// In-Memory-FIFO-Queue mit begrenzt parallelen Läufern für asynchrone
// Hintergrund-LLM-Jobs (z.B. serverseitiger Property-Abgleich).
//
// Warum kein Framework: keine neue Dependency, kein Redis — die LLM-Last ist
// Subprozess-/Netzwerk-gebunden (agy-CLI via `execFile`, HTTP-Fetch), daher
// genügen N parallele Läufer im Backend-Prozess. Neustart-Verlust ist
// akzeptiert: wartende/laufende Jobs sind danach weg, `GET` antwortet 404.
//
// Statuswerte: "in progress" | "done" | "errored".
const { randomUUID } = require('node:crypto');

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_TTL_MS = 3600000; // fertige Records leben 1h, danach 404
const DEFAULT_DEBOUNCE_MS = 300;

/** Liest `CRAWL_QUEUE_CONCURRENCY` (Default 2, min. 1). */
function readQueueConcurrency() {
  const raw = Number(process.env.CRAWL_QUEUE_CONCURRENCY);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_CONCURRENCY;
}

/** Liest `SPEC_ALIGNMENT_DEBOUNCE_MS` (Default 300, min. 0). */
function readAlignmentDebounceMs() {
  const raw = Number(process.env.SPEC_ALIGNMENT_DEBOUNCE_MS);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_DEBOUNCE_MS;
}

/**
 * Erzeugt eine Queue. `run` ist die Job-Funktion und bekommt das Spec-Objekt
 * aus `enqueue`; bei Erfolg löst sie mit dem Ergebnis auf, bei Fehler wirft
 * sie `{ status?, code?, message }`. `onSettled(publicView, { owner, journey })`
 * feuert bei `done`/`errored` (z.B. für den SSE-Broadcast).
 */
function createCrawlQueue({ concurrency = DEFAULT_CONCURRENCY, ttlMs = DEFAULT_TTL_MS, now = Date.now, onSettled } = {}) {
  const limit = Number.isFinite(concurrency) && concurrency >= 1 ? Math.floor(concurrency) : DEFAULT_CONCURRENCY;
  const jobs = new Map(); // id -> Record
  const waiting = []; // ids, FIFO
  const pendingTimers = new Map(); // key -> { timer, token }
  const latestTokens = new Map(); // key -> token
  let seq = 0;
  let running = 0;

  function sweep() {
    const t = now();
    for (const [id, record] of jobs) {
      if (record.finishedAt !== null && t > record.expiresAt) {
        jobs.delete(id);
      }
    }
    for (let i = waiting.length - 1; i >= 0; i--) {
      if (!jobs.has(waiting[i])) waiting.splice(i, 1);
    }
  }

  function positionOf(record) {
    if (record.status !== 'in progress') return 0;
    const idx = waiting.indexOf(record.id);
    return idx === -1 ? 0 : running + idx;
  }

  function publicView(record) {
    const view = {
      jobId: record.id,
      kind: record.kind,
      journey: record.journey,
      status: record.status,
      position: positionOf(record),
      queueLength: waiting.length + running,
      createdAt: new Date(record.createdAt).toISOString(),
      startedAt: record.startedAt === null ? null : new Date(record.startedAt).toISOString(),
      finishedAt: record.finishedAt === null ? null : new Date(record.finishedAt).toISOString(),
    };
    if (record.status === 'done' && record.outcome) {
      view.item = record.outcome.item;
      if (record.outcome.provider !== undefined) view.provider = record.outcome.provider;
      if (record.outcome.fetcher !== undefined) view.fetcher = record.outcome.fetcher;
      if (record.outcome.meta !== undefined) view.meta = record.outcome.meta;
    }
    if (record.status === 'errored' && record.outcome) {
      view.error = record.outcome.message;
      if (record.outcome.code !== undefined) view.code = record.outcome.code;
      if (record.outcome.status !== undefined) view.statusCode = record.outcome.status;
    }
    return view;
  }

  function finish(record, status, outcome) {
    running -= 1;
    record.status = status;
    record.outcome = outcome;
    record.finishedAt = now();
    record.expiresAt = record.finishedAt + ttlMs;
    if (typeof onSettled === 'function') {
      try {
        onSettled(publicView(record), { owner: record.owner, journey: record.journey });
      } catch {
        // Ein fehlerhafter Hook darf die Queue nie anhalten.
      }
    }
    pump();
  }

  function pump() {
    while (running < limit && waiting.length > 0) {
      const id = waiting.shift();
      const record = jobs.get(id);
      if (!record) continue;
      running += 1;
      record.startedAt = now();
      Promise.resolve()
        .then(() => record.run(record.spec))
        .then(
          (outcome) => finish(record, 'done', outcome || {}),
          (error) => finish(record, 'errored', {
            message: (error && error.message) || String(error),
            ...(error && error.code !== undefined ? { code: error.code } : {}),
            ...(error && typeof error.status === 'number' ? { status: error.status } : {}),
          }),
        );
    }
  }

  return {
    /** Legt einen Job an ({ owner, journey, kind, spec, run }) und gibt die 202-Antwort zurück. */
    enqueue({ owner, journey, kind, spec, run, debounceKey }) {
      sweep();
      const record = {
        id: randomUUID(),
        owner,
        journey,
        kind,
        spec,
        run,
        debounceKey: debounceKey || null,
        status: 'in progress',
        outcome: null,
        createdAt: now(),
        startedAt: null,
        finishedAt: null,
        expiresAt: null,
      };
      jobs.set(record.id, record);
      waiting.push(record.id);
      pump();
      return publicView(record);
    },
    /**
     * Plant einen debounced Job pro `key` (z.B. `owner/slug`): Neuere Aufrufe
     * ersetzen ausstehende Timer und noch wartende Jobs (Latest-wins), ohne
     * bereits laufende Jobs abzubrechen. `run` erhält `(spec, { isLatest })`.
     */
    scheduleDebounced({ key, owner, journey, kind, spec, debounceMs = DEFAULT_DEBOUNCE_MS, run }) {
      const token = ++seq;
      latestTokens.set(key, token);

      const prevTimer = pendingTimers.get(key);
      if (prevTimer) {
        clearTimeout(prevTimer.timer);
        pendingTimers.delete(key);
      }

      for (let i = waiting.length - 1; i >= 0; i--) {
        const waitingId = waiting[i];
        const waitingRecord = jobs.get(waitingId);
        if (waitingRecord && waitingRecord.debounceKey === key) {
          waiting.splice(i, 1);
          jobs.delete(waitingId);
        }
      }

      const startJob = () => {
        if (latestTokens.get(key) !== token) return null;
        return this.enqueue({
          owner,
          journey,
          kind,
          spec,
          debounceKey: key,
          run: (jobSpec) => run(jobSpec, { isLatest: () => latestTokens.get(key) === token }),
        });
      };

      const delay = Number.isFinite(debounceMs) && debounceMs > 0 ? Math.floor(debounceMs) : 0;
      if (delay === 0) {
        return startJob();
      }
      const timer = setTimeout(() => {
        pendingTimers.delete(key);
        startJob();
      }, delay);
      if (timer.unref) timer.unref();
      pendingTimers.set(key, { timer, token });
      return null;
    },
    /** Liest einen Job (nur eigener Owner; abgelaufene/fehlende → null = 404). */
    getJob(id, owner) {
      const record = jobs.get(id);
      if (!record || record.owner !== owner) return null;
      if (record.finishedAt !== null && now() > record.expiresAt) {
        jobs.delete(id);
        return null;
      }
      return publicView(record);
    },
    /** Bricht alle wartenden Debounce-Timer ab (z.B. beim Herunterfahren). */
    dispose() {
      for (const entry of pendingTimers.values()) {
        clearTimeout(entry.timer);
      }
      pendingTimers.clear();
      waiting.length = 0;
    },
  };
}

module.exports = {
  createCrawlQueue,
  readQueueConcurrency,
  readAlignmentDebounceMs,
  DEFAULT_CONCURRENCY,
  DEFAULT_TTL_MS,
  DEFAULT_DEBOUNCE_MS,
};
