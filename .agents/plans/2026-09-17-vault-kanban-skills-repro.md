## Goal

Give an agent in a different project everything it needs to reproduce this repo's working structure 1:1 in spirit: an Obsidian vault (in `docs/vault/`) with a Kanban board, plus the agent skill set in `.agents/skills/` that operates on that board.

## Success Criteria

- The other project has a `docs/vault/` folder that opens in Obsidian as a vault, with the Kanban plugin active and a 4-list board rendering.
- The other project has `.agents/skills/` with the portable Kanban skills working unchanged (create/move cards, intake, next-task loop).
- The other agent knows exactly which parts to copy verbatim, which to rename/adapt (project-specific notes, board cards, domain skill), and how to verify each step.
- No dependency on this repo's domain logic (bike-buying SQLite app, MCP server, frontend) leaks into the new project unless deliberately adapted.

## Context And Current Facts

How it is set up here (all verified in this workspace, paths relative to repo root):

- **Vault location:** `docs/vault/` is the vault root — Obsidian opens this folder (via "Open folder as vault"), not the repo root. App code, `data/`, and `frontend/` stay outside the vault.
- **Vault contents:** `README.md` (vault start page), `Was-ist-VeloPath.md` (project purpose note), `Architektur/` (`Übersicht.md`, `Backend.md`, `Frontend.md`), `Untitled Kanban.md` (the board), `Unbenannt.base`, `.trash/`, and `.obsidian/`.
- **Obsidian config is versioned:** `docs/vault/.obsidian/` contains `app.json`, `appearance.json`, `core-plugins.json` (file-explorer, search, graph, backlinks, etc.), `community-plugins.json` (`["obsidian-kanban"]`), `workspace.json` (opens the Kanban file in Kanban view), `graph.json`, and `plugins/obsidian-kanban/` (manifest: id `obsidian-kanban`, version 2.0.51). Copying this directory reproduces editor + plugin setup.
- **Board format** (`docs/vault/Untitled Kanban.md`, format of the `obsidian-kanban` plugin by mgmeyers):
  - Frontmatter holds `kanban-plugin: board`.
  - Four `##` lists: `todo`, `progress`, `waiting`, `done`.
  - Each card is one line `- [ ] Title` plus indented sub-bullets (spec, context, file references).
  - Finished cards keep title + spec and append one `Erledigt YYYY-MM-DD: ...` sub-bullet (files touched, tests, verification); blocked cards get `Blockiert YYYY-MM-DD: ...` and move to `waiting`.
  - File ends with a `%% kanban:settings ... %%` block that must never be hand-edited.
- **Vault conventions** (from `docs/vault/README.md`): one note = one topic, filename = title, link notes with `[[Wikilinks]]`, sparse tags (`#entscheidung`, `#probefahrt`, `#favorit`), `README.md` stays the vault landing page.
- **Skills** (`.agents/skills/<name>/SKILL.md`, frontmatter `name:` + `description:`):
  - `kanban-edit-card` — create a card in `todo` (default) or append details to an existing card by exact title match; never touch the settings block; ask on duplicates/ambiguity.
  - `kanban-move-card` — move a whole card line between lists (normal flow `todo` → `progress` → `done`; `progress` → `waiting` only when genuinely blocked and undecidable alone); mechanics: delete full line from source, append at end of target list.
  - `todo-intake-kanban` — turn a raw one-liner (+ optional pasted file/snippet) into a well-specified `todo` card without implementing anything: ground it in real code first, ask max ~3-4 questions about genuine ambiguities (scope, replace-vs-add, ordering basis, data plumbing, edge cases), then write `- [ ]` + indented spec bullets concrete enough for a future session.
  - `todo-next-kanban` — execute exactly one `todo` card per invocation: pick one (dependencies first, list order as tie-break, prefer ready/small), move to `progress`, re-ground the spec in current code, implement + verify (`npm test`; frontend changes also need build + lint), write ephemeral UI checklist to `docs/local/MANUAL_TESTS.md` (fully overwritten each time, never a history), then move to `done` with `Erledigt`-bullet or to `waiting` with `Blockiert`-bullet; then stop.
  - `buying-journey-manager` — domain-specific (SQLite bike-buying DB via `src/agent/scripts/`, REST, crawl prompts). This is the template for "one domain skill per project", not something to copy verbatim into an unrelated project.
- **Ephemeral vs. durable:** `docs/local/MANUAL_TESTS.md` is scratch (one card's checklist, overwritten per run). Card `Erledigt` lines are the durable history. `data/*.db*` and `.env` are git-ignored; the vault and `.agents/skills/` are committed.

## Constraints And Non-goals

- The plan copies structure and workflow, not domain content: bike notes, bike cards, and the buying-journey skill's SQLite/MCP details do not transfer unless the target project is also a buying-journey app.
- No new code, no refactor of this repo, no plugin upgrade — this plan only documents and ports the setup.
- Target agent is assumed to have file-write access and Obsidian available to the user for the visual check; if the target project already has a `docs/vault/` or `.agents/skills/`, the plan merges rather than overwrites (see risks).

## Key Decisions

- **Vault at `docs/vault/`, opened as vault (not repo root).** Keeps notes/graph/plugin config scoped to docs while code stays out. Alternative (vault = repo root) rejected: it would index `node_modules/`, `data/*.db`, and build output into search/graph.
- **Copy `.obsidian/` wholesale, then rename content.** Fastest faithful reproduction (plugin + workspace view included). Alternative (fresh install of the Kanban plugin) is the fallback if the target wants zero copied editor state — costs one manual plugin install and re-creation of the board view.
- **Port 4 Kanban skills verbatim; treat the 5th as a template.** `kanban-edit-card`, `kanban-move-card`, `todo-intake-kanban`, `todo-next-kanban` are domain-free (only the board path `docs/vault/Untitled Kanban.md` is hardcoded). `buying-journey-manager` must be rewritten per project (or skipped if the target has no CLI/MCP domain to wrap).
- **Keep the board filename `Untitled Kanban.md`.** Skill files hardcode this path and `workspace.json` opens it by name; renaming means editing all four skills + workspace config. Rename only if the target consciously accepts that edit.
- **Keep `docs/local/MANUAL_TESTS.md` semantics (overwrite, not append).** It is the per-card hand-test sheet; history lives on the cards. New projects often get this wrong and accumulate stale checklists.

## Recommended Approach

Copy in three layers — (1) vault shell + Obsidian config, (2) empty-but-valid Kanban board, (3) skills — then adapt the two project-specific notes (`README.md`, purpose note) and decide the fate of the domain skill. Verify each layer with file checks plus one visual Obsidian open and one dry-run card lifecycle (create → move → move back → delete the probe) before handing over.

## Work Plan

### Phase 1 — Vault shell + Obsidian config

1. In the target repo, create `docs/vault/` and `docs/local/`.
2. Copy `docs/vault/.obsidian/` 1:1 (all JSON files + `plugins/obsidian-kanban/`). This carries `community-plugins.json` (`obsidian-kanban`), core plugin toggles, and `workspace.json` (Kanban view on open).
3. If the target distrusts copied editor state: instead create an empty vault folder, install community plugin `obsidian-kanban` (ID `obsidian-kanban`, here v2.0.51) from inside Obsidian, open the board file once in Kanban view so `workspace.json` regenerates.
4. Write `docs/vault/README.md` fresh for the new project (landing page: how to open the vault, what the vault is for, link to the purpose note). Do not copy the VeloPath text — copy its headings (Open in Obsidian / What goes here / Structure / Conventions).
5. Write one purpose note (here `Was-ist-VeloPath.md`): one-sentence project definition, why it exists, what it is not, typical flow. Filename = title, `[[Wikilinks]]` to structure notes.
6. Optional: create `Architektur/` (or equivalent) only if the target needs system docs; otherwise start with `Inbox/` + `Entscheidungen/`/`Tagebuch/` as growth folders per the README sketch.

### Phase 2 — Kanban board

1. Create `docs/vault/Untitled Kanban.md` with exactly this skeleton (keep names unless Phase decision says otherwise):
   ```
   ---
   kanban-plugin: board
   ---
   ## todo
   ## progress
   ## waiting
   ## done
   %% kanban:settings
   ```
   ```
   {"kanban-plugin":"board","list-collapse":[false,false,false,false]}
   ```
   %%
   ```
   (Copy the settings block shape from this repo's board file verbatim.)
2. Add one probe card `- [ ] Probe card (delete me)` under `## todo` to validate rendering, then delete it after the visual check.
3. Do not migrate this repo's cards (they reference bike files/tests). If history is wanted, move at most 1–2 `done` cards as style examples and strip their content, or leave the board empty.

### Phase 3 — Skills

1. Create `.agents/skills/<name>/SKILL.md` for the four portable skills, copying each `SKILL.md` verbatim (frontmatter `name:` + `description:` included). Directory names must match the `name:` field.
2. Decide the domain skill: (a) skip it if the target has no agent-operated backend, or (b) write a new `<domain>-manager/SKILL.md` following the buying-journey skill's shape (CLI usage with copy-paste commands → agent instructions section → status/error rules), but with the target's real scripts/endpoints.
3. Keep the board path consistent: every skill references `docs/vault/Untitled Kanban.md`. If the target renames the board, update all four skills identically.
4. Keep `docs/local/MANUAL_TESTS.md` semantics: created/overwritten only by task-execution runs for UI changes, never versioned history.

### Phase 4 — Conventions, git, handoff doc

1. `.gitignore`: ensure Edge artifacts stay out (`node_modules/`, `.env`, local DBs/logs). Ensure `docs/vault/.obsidian/` and `.agents/skills/` are committed (do not ignore them).
2. Document the loop for the other agent: intake (`todo-intake-kanban`) → execute one card (`todo-next-kanban`) → move with `Erledigt`/`Blockiert` bullets → UI cards overwrite `docs/local/MANUAL_TESTS.md`; never commit unless the user asked.
3. Hand the target agent this plan file plus pointers to the four verbatim skill sources.

## Validation Plan

- `ls docs/vault/ docs/vault/.obsidian/plugins/ .agents/skills/` shows vault, plugin dir, and 4–5 skill dirs; each `SKILL.md` starts with `---` frontmatter containing `name:`.
- `cat docs/vault/.obsidian/community-plugins.json` contains `obsidian-kanban`; `head docs/vault/Untitled Kanban.md` shows `kanban-plugin: board` and the four `##` lists; the `%% kanban:settings` footer is intact.
- Visual: open `docs/vault/` in Obsidian ("Open folder as vault") — board renders as Kanban with 4 columns; probe card appears in `todo`.
- Functional dry run (then revert): add probe card via `kanban-edit-card` steps, move `todo` → `progress` → `done` via `kanban-move-card` steps, confirm other cards/settings untouched via `git diff`, then remove the probe.
- `git status --short` shows only intended new files; no `.env`, DB, or `node_modules` staged.

## Risks / Rollback

- **Target already has `docs/vault/` or `.agents/skills/`:** do not overwrite; merge (add missing skill dirs, keep existing notes). Rollback = `git checkout --` / delete only the new files.
- **Obsidian version drift:** `.obsidian/*.json` are forward-compatible in practice; if the board opens as Markdown instead of Kanban, reinstall/enable `obsidian-kanban` in-app and reopen the file in Kanban view.
- **Copied `workspace.json` paths:** it references the board filename; renaming the board without updating skills + workspace breaks all four skills' path assumptions — prefer keeping the filename.
- **Leaking domain content:** copying `Was-ist-VeloPath.md` or bike cards verbatim confuses the new project; always rewrite purpose content and start the board empty.
- **Highest-risk check:** the visual Obsidian open — file-level checks pass even when the plugin is disabled, so the board-render confirmation is the gate that matters.

## Open Questions

None — all structural facts were read from this repo. The only input the other agent needs from its user: project name/purpose (for the README + purpose note), whether to keep the `Untitled Kanban.md` filename, and whether a domain skill is needed.
