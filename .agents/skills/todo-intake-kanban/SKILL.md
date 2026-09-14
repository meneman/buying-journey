---
name: todo-intake-kanban
description: Take a raw TODO the user hands you (a short instruction, optionally with a code/file snippet pasted in for context), ground it in the actual current code, ask clarifying questions about the genuinely ambiguous parts, then write a well-specified card into the Obsidian Kanban board. Does NOT implement the feature. Use whenever the user says things like "add this to the todo", "trag das ins TODO ein", "füge das TODO hinzu", "notier das als todo", or pastes a task plus a file/snippet and asks it to be queued up.
---

# TODO intake (Kanban)

Turns a rough, one-line task idea into a precise, unambiguous card in the
Obsidian Kanban board — without writing any implementation code. The point
is to front-load the questions so that whoever (or whichever future
session) picks the item up later can implement it without having to
re-derive scope or guess intent.

## When to use this vs. just implementing

- User hands you a TODO and asks you to queue/note/add it → this skill.
- User asks you to actually build/fix something now → just do the work,
  don't route it through here (this skill is for intake, not execution).
- Don't use this to mark existing items done — completed items get moved to
  `done` as part of finishing the work itself (see `kanban-move-card`),
  not through this flow.

## Steps

1. **Parse what was handed to you.** The user may paste a bare sentence, or
   wrap a file/snippet in markers (e.g. `<!-- BEGIN some/file.erb -->`) to
   anchor the request to a specific place in the code. If a file/snippet is
   referenced, that's a pointer — read the real file, don't rely solely on
   the pasted excerpt (it may be stale or partial).

2. **Ground it in the current code before judging what's ambiguous.** Read
   the referenced file(s) and whatever they depend on (the view's caller,
   the helper it uses, the model/struct backing the data). You need to know
   what data is actually available today to tell which parts of the request
   are genuinely open questions versus things the code already answers.

3. **Identify real ambiguities only.** Look for places where the instruction
   is compatible with more than one reasonable implementation and the choice
   materially changes scope, UI, or data plumbing — e.g.:
   - Scope: does this apply once per card/page, or once per repeated
     sub-element (per column, per row, per category)?
   - Replace vs. add: does the new thing replace something already there, or
     sit alongside it?
   - Comparison/ordering basis: chronological order, which two points are
     being compared, which direction counts as "better".
   - Data availability: is the data the request assumes already passed down
     to this view/partial, or does plumbing need to change?
   - Edge cases the instruction doesn't mention: empty/short history, nil
     values, missing previous data point.

   Don't ask about things you can resolve by reading the code, and don't ask
   more than ~3-4 questions. If the instruction is already unambiguous once
   you've read the code, skip straight to step 5.

4. **Ask via `AskUserQuestion`, not open-ended prose.** Give each question
   2-4 concrete, mutually exclusive options with short descriptions (a
   `preview` is worth adding when a visual mockup makes the choice clearer
   than words, e.g. comparing two ways of laying out values). Prefer this
   over asking the user to write a free-form answer — it's faster for them
   and keeps the resulting spec precise.

5. **Write the entry as a card into the `todo` list of the Obsidian Kanban
   board `docs/vault/Untitled Kanban.md`.** Follow the board format
   (see `kanban-edit-card`):
   - Frontmatter contains `kanban-plugin: board`.
   - Each `## heading` (`todo`, `progress`, `waiting`, `done`) is a list.
   - Each line `- [ ] Card title` under a heading is a card.
   - The `%% kanban:settings ... %%` block at the end of the file belongs
     to the plugin and must not be changed.
   - Match the existing card style:
     - New card: `- [ ] <short title>` at the end of the `todo` list (before
       the next `## heading` or before the `%% kanban:settings` block) — the
       title should name the file/area it targets (e.g. "Lighthouse
       `_page_card.html.erb`: ...").
     - Indented sub-bullets directly underneath the card line spelling out
       the resolved specifics: one bullet per clarified decision (scope,
       replace-vs-add, comparison basis, etc.), plus any
       implementation-relevant facts you learned while reading the code
       (which files need changing, what data isn't currently plumbed
       through, what edge case needs handling).
     - Keep it concrete enough that a future session could implement it
       without opening this conversation for context, but don't write the
       implementation itself — no code blocks with the actual fix, no diff.
     - Leave the checkbox unchecked (`- [ ]`) — this skill only queues work,
       it never marks it done.
     - Don't create duplicates: if a card with the same title already
       exists, ask before adding.

6. **Don't implement.** Once the card is written, stop — report back what
   was added (and briefly why each clarified point was resolved that way),
   don't proceed to build it unless the user separately asks.
