const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createCrawlQueue, readQueueConcurrency, DEFAULT_CONCURRENCY } = require('../src/web/backend/crawl-queue.js');

const tick = (n = 10) => (n <= 1 ? Promise.resolve() : Promise.resolve().then(() => tick(n - 1)));

test('enqueue antwortet sofort mit Job, getJob liest ihn (fremder Owner → null)', async () => {
  const q = createCrawlQueue({});
  const created = q.enqueue({
    owner: 'anna',
    journey: 'bike',
    kind: 'parse-text',
    spec: { text: 'x' },
    run: async () => ({ item: { name: 'Später' } }),
  });
  assert.equal(created.status, 'in progress');
  assert.equal(typeof created.jobId, 'string');
  assert.equal(created.kind, 'parse-text');
  assert.equal(created.journey, 'bike');

  const view = q.getJob(created.jobId, 'anna');
  assert.equal(view.status, 'in progress');
  assert.equal(q.getJob('gibts-nicht', 'anna'), null);
  assert.equal(q.getJob(created.jobId, 'bob'), null);

  await tick();
  assert.equal(q.getJob(created.jobId, 'anna').status, 'done');
  assert.equal(q.getJob(created.jobId, 'anna').item.name, 'Später');
});

test('FIFO + Konkurrenz-Limit: max. 1 Läufer, Reihenfolge, Wartepositionen', async () => {
  const q = createCrawlQueue({ concurrency: 1 });
  const releases = {};
  let parallel = 0;
  let maxParallel = 0;
  const started = [];
  const run = (spec) => {
    parallel += 1;
    maxParallel = Math.max(maxParallel, parallel);
    started.push(spec.n);
    return new Promise((resolve) => { releases[spec.n] = () => { parallel -= 1; resolve({ item: { name: spec.n } }); }; });
  };
  const a = q.enqueue({ owner: 'anna', journey: 'bike', kind: 'import-link', spec: { n: 'a' }, run });
  const b = q.enqueue({ owner: 'anna', journey: 'bike', kind: 'import-link', spec: { n: 'b' }, run });
  const c = q.enqueue({ owner: 'anna', journey: 'bike', kind: 'import-link', spec: { n: 'c' }, run });
  await tick();

  assert.deepEqual(started, ['a']);
  assert.equal(q.getJob(a.jobId, 'anna').position, 0); // läuft
  assert.equal(q.getJob(b.jobId, 'anna').position, 1);
  assert.equal(q.getJob(c.jobId, 'anna').position, 2);
  assert.equal(q.getJob(c.jobId, 'anna').queueLength, 3);

  releases.a();
  await tick();
  assert.deepEqual(started, ['a', 'b']);
  assert.equal(q.getJob(a.jobId, 'anna').status, 'done');
  assert.equal(q.getJob(c.jobId, 'anna').position, 1);

  releases.b();
  await tick();
  releases.c();
  await tick();
  assert.deepEqual(started, ['a', 'b', 'c']);
  assert.equal(maxParallel, 1);
  assert.equal(q.getJob(c.jobId, 'anna').status, 'done');
});

test('errored übernimmt message/code/status; onSettled feuert pro Job', async () => {
  const settled = [];
  const q = createCrawlQueue({ onSettled: (view, meta) => settled.push([view, meta]) });
  const created = q.enqueue({
    owner: 'anna',
    journey: 'bike',
    kind: 'import-link',
    spec: {},
    run: async () => { throw { status: 502, code: 'CONTENT_BLOCKED', message: 'Bot-Schutz' }; },
  });
  await tick();
  const view = q.getJob(created.jobId, 'anna');
  assert.equal(view.status, 'errored');
  assert.equal(view.error, 'Bot-Schutz');
  assert.equal(view.code, 'CONTENT_BLOCKED');
  assert.equal(view.statusCode, 502);
  assert.equal(settled.length, 1);
  assert.equal(settled[0][0].jobId, created.jobId);
  assert.equal(settled[0][0].status, 'errored');
  assert.deepEqual(settled[0][1], { owner: 'anna', journey: 'bike' });
});

test('done übernimmt item/provider/fetcher/meta', async () => {
  const q = createCrawlQueue({});
  const created = q.enqueue({
    owner: 'anna',
    journey: 'bike',
    kind: 'import-link',
    spec: {},
    run: async () => ({ item: { name: 'Stub' }, provider: 'local-cmd', fetcher: 'local-cmd', meta: { textChars: 5 } }),
  });
  await tick();
  const view = q.getJob(created.jobId, 'anna');
  assert.equal(view.status, 'done');
  assert.equal(view.item.name, 'Stub');
  assert.equal(view.provider, 'local-cmd');
  assert.equal(view.fetcher, 'local-cmd');
  assert.equal(view.meta.textChars, 5);
});

test('fertige Jobs verfallen nach TTL (danach 404)', async () => {
  let t = 1000;
  const q = createCrawlQueue({ ttlMs: 500, now: () => t });
  const created = q.enqueue({
    owner: 'anna', journey: 'bike', kind: 'parse-text', spec: {}, run: async () => ({ item: { name: 'X' } }),
  });
  await tick();
  assert.equal(q.getJob(created.jobId, 'anna').status, 'done');
  t += 501;
  assert.equal(q.getJob(created.jobId, 'anna'), null);
});

test('readQueueConcurrency: Default 2, min. 1, Env-Override', () => {
  const prev = process.env.CRAWL_QUEUE_CONCURRENCY;
  try {
    delete process.env.CRAWL_QUEUE_CONCURRENCY;
    assert.equal(readQueueConcurrency(), DEFAULT_CONCURRENCY);
    process.env.CRAWL_QUEUE_CONCURRENCY = '3';
    assert.equal(readQueueConcurrency(), 3);
    process.env.CRAWL_QUEUE_CONCURRENCY = '0';
    assert.equal(readQueueConcurrency(), DEFAULT_CONCURRENCY);
    process.env.CRAWL_QUEUE_CONCURRENCY = 'quatsch';
    assert.equal(readQueueConcurrency(), DEFAULT_CONCURRENCY);
  } finally {
    if (prev === undefined) delete process.env.CRAWL_QUEUE_CONCURRENCY;
    else process.env.CRAWL_QUEUE_CONCURRENCY = prev;
  }
});
