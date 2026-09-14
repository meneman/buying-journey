---
name: todo-next-kanban
description: Pick exactly ONE open card from the todo list of the Obsidian Kanban board, decide autonomously which one should be tackled next to advance the board smoothly, move it to progress while working, implement it fully (tests + manual verification where relevant), and move it to done with an "Erledigt YYYY-MM-DD: ..." writeup — or park it in waiting if it gets blocked and no other way forward exists. Use whenever the user asks to work through/advance the Kanban board — e.g. "arbeite das Kanban ab", "mach die nächste Kanban-Aufgabe", "nimm dir die nächste Karte vor", "work on the next todo". Does exactly one card per invocation, never more, even if finishing early makes it tempting to continue.
---

# TODO next (Kanban)

Advances the Obsidian Kanban board `docs/vault/Untitled Kanban.md` by exactly
one card per invocation: choose the single best next card from the `todo`
list, move it to `progress` while working, implement it completely, move it
to `done` with a completion note. Only exception: if the card gets blocked
in `progress` and there is genuinely no other way forward, park it in
`waiting` instead of `done` (see step 8). Then stop — picking up a second
card is a new invocation of this skill, not a continuation of this one.

## When to use this vs. other Kanban-related skills

- User wants a card **executed** ("arbeite das Board ab", "next todo") → this
  skill.
- User wants a rough idea turned into a **new, well-specified card** → use
  `todo-intake-kanban` instead (that skill never implements anything).
- Don't run both in one invocation — this skill only consumes existing
  `- [ ]` cards in `todo`, it doesn't write new ones.

## Board format

- File: `docs/vault/Untitled Kanban.md` (format of the
  community-archive/obsidian-kanban plugin).
- Frontmatter contains `kanban-plugin: board`.
- Each `## heading` (`todo`, `progress`, `waiting`, `done`) is a list.
  `waiting` is only a parking spot for cards blocked in `progress` (see
  step 8) — never a regular target.
- Each line `- [ ] Card title` under a heading is a card; indented
  sub-bullets directly underneath belong to that card (the spec written by a
  prior `todo-intake-kanban` pass).
- The `%% kanban:settings ... %%` block at the end of the file belongs to
  the plugin and must not be changed.
- Card moves follow the `kanban-move-card` mechanics: remove the complete
  card (title line plus its indented sub-bullets) from the source list and
  append it at the end of the target list (before the next `## heading` or
  before the `%% kanban:settings` block). Leave every other card untouched.

## Steps

1. **Read `docs/vault/Untitled Kanban.md` in full.** Collect every open card
   (`- [ ]`) in the `todo` list with its indented sub-bullets — those
   sub-bullets are the spec, written by a prior `todo-intake-kanban` pass
   specifically so this step doesn't need to re-ask the user anything.

2. **Pick exactly one open card.** See "Deciding which card is next" below.
   State the pick and a one-line reason before starting work.

3. **Move the chosen card from `todo` to `progress` before touching any
   code.** Move the whole card (title line plus its indented sub-bullets),
   nothing else.

4. **Ground the chosen card in the current code before touching anything
   else.** The card's sub-bullets were written against the codebase *at the
   time it was queued* — re-check that the files/methods/line numbers it
   names still look like that; code may have moved on since. If something
   has drifted in a way that changes scope, adapt sensibly and note the
   deviation in the completion writeup (step 7) rather than silently going
   off-spec.

5. **Load a more specific skill if the card points at one.** If the chosen
   card explicitly references an established pattern or skill, invoke it via
   the `Skill` tool before implementing — don't reinvent a convention
   that's already documented.

6. **Implement the card completely**, following this repo's existing
   conventions (frontend in `frontend/`: React 19 + Vite + TypeScript +
   shadcn/ui + Tailwind CSS 4 + Radix; backend in `src/web/backend`:
   Express on Node; root scripts orchestrate both, `frontend/` has its own
   `package.json` with `dev`/`build`/`lint`) and the specifics the card's
   sub-bullets already pinned down (edge cases, which files need plumbing
   changes, which components/tokens to reuse, etc.). Don't quietly expand
   scope beyond what the card specifies, and don't re-litigate a decision
   the card already resolved.

7. **Verify before moving anything to done:**
   - Run `npm test` — backend suite (node test runner over `test/`) green.
   - If the change touches the frontend, also run `npm --prefix frontend
     run build` (`tsc -b` + `vite build`) and `npm --prefix frontend run
     lint` (`oxlint`); both must pass.
   - If the change touches a view/UI, don't test it yourself in a browser —
     don't start `npm run dev` and don't use any `claude-in-chrome` tools.
     Instead, **overwrite** `docs/local/MANUAL_TESTS.md` with a checklist
     for the user to work through by hand. Fully replace any prior content
     (it only ever covers the card this run just implemented, not a running
     history — that lives in the cards' `Erledigt` lines). Include:
     - A short header: the card's title and today's date, plus a note that
       the user needs to start `npm run dev` themselves before testing
       (Backend on port `3000`, Vite dev server on port `5173`, opens
       `http://localhost:5173`; `/api` calls are proxied to the backend).
     - Concrete `- [ ]` checklist points — which page/URL to open, what
       state/element to look at and how it should behave, and any edge cases
       the card's sub-bullets explicitly called out.
   - If the change doesn't touch a view/UI, leave `docs/local/MANUAL_TESTS.md`
     alone (don't create or clear it).
   - Add/adjust tests for the new behavior — every completed card in `done`
     names the tests it added or changed; match that.

8. **Move the card from `progress` to `done`**, matching the existing
   completed-card style:
   - Keep the card's original title and sub-bullets as they were — don't
     rewrite the spec.
   - Append one indented sub-bullet starting with `Erledigt <today's date,
     YYYY-MM-DD>: ` (get today's date from the current session context,
     don't guess or reuse a date from an old example) summarizing what
     changed: files touched, the tests added/updated and that the suites
     from step 7 are green, and any scope deviation from step 4. If step 7
     wrote the manual-test checklist, say so explicitly — e.g. "manuelle
     Browser-Verifikation ausstehend, siehe `docs/local/MANUAL_TESTS.md`" —
     rather than implying the UI was verified.
   - Leave every other card in the file untouched.
   - **Blocked instead of done (exception only):** if something went wrong
     in `progress`, or a decision came up that you cannot reasonably make
     alone (and `AskUserQuestion` can't resolve it either — e.g. it needs
     input only the user can give, or external access you don't have), and
     there is genuinely no other way to complete the card, move it from
     `progress` to `waiting` instead of `done`. Keep the checkbox unchecked
     (`- [ ]`), keep the original title and sub-bullets, and append one
     indented sub-bullet starting with `Blockiert <today's date,
     YYYY-MM-DD>: ` describing what went wrong or which decision is open,
     what you already tried, and exactly what you need from the user to
     continue. Never park a card in `waiting` just to avoid a big or
     unpleasant task — `waiting` is strictly for cards that cannot proceed.

9. **Stop.** Report back to the user: which card was picked, why (briefly),
   and a summary of the change — or, if the card was parked in `waiting`,
   which blocker stopped it and what you need from the user. If
   `docs/local/MANUAL_TESTS.md` was written, call that out explicitly and
   give a one-line gist of what needs manual checking — don't just leave it
   to a general "tests passed" summary. Do not proceed to a second card
   even if the first finished quickly or a "natural next step" suggests
   itself — that belongs to the next time this skill runs.

Per the repo-wide git rules, don't commit these changes yourself unless the
user's invocation explicitly asked for that too — leave the diff (code +
board) for review.

## Deciding which card is next

There's no single rule — weigh these, in roughly this priority order:

1. **Dependencies first.** Prefer a card whose prerequisites already exist
   over one that depends on infrastructure not yet built. If card B's spec
   assumes something card A would introduce, A goes first regardless of
   list position.
2. **List order as the default tie-breaker.** The `todo` list is generally
   maintained in roughly the order it matters to the user, so default to the
   topmost open card. Deviate when a lower card is fully specified and ready
   while a higher one is genuinely blocked, still ambiguous, or clearly much
   larger in scope/risk than the alternatives.
3. **Shared groundwork across cards.** Some cards explicitly note they'd
   share a plumbing change with a sibling card. If an earlier run already
   built that shared piece, a later card referencing it is now cheaper than
   it looks on paper — check the code for whether it's already there before
   assuming the note still describes open work. This can be a reason to
   prefer that later card, since the hard part is already done.
4. **Genuinely ready over merely next.** If the top candidate still has an
   open judgment call beyond what's reasonable to decide unilaterally (rare —
   `todo-intake-kanban` front-loads most of these), either resolve it with
   `AskUserQuestion` or pick the next-best ready card instead of guessing.
5. **Prefer smaller, self-contained, lower-risk cards when otherwise tied**
   — keeps the board moving smoothly instead of getting stuck mid-way
   through a large structural change. But don't perpetually dodge the big
   card: if it's the only one left, or clearly next given points 1-2, do it.

If the `todo` list has no open (`- [ ]`) cards, say so and stop without
changing anything.
