# Prompt for the other agent: reproduce the vault + kanban + skills structure (game project)

Copy everything below the line into the other project. It is written so the
other agent can work autonomously by reading this repo as the reference.

---

You are setting up project infrastructure. Goal: reproduce the
Obsidian vault + kanban + agent-skills structure from the reference repo
into THIS project (a game — different domain, same structure).

Reference repo (read-only source, copy structure — NOT domain content):
`/home/jakob/projekte/bike`

Read these reference files first (all paths relative to the reference repo):

- `docs/vault/README.md` — vault landing page: headings and conventions to imitate, text NOT to copy
- `docs/vault/Untitled Kanban.md` — board format: frontmatter, the four `##` lists, card line shape, trailing `%% kanban:settings %%` block (read only the top ~30 lines plus the settings footer; do NOT copy the bike cards)
- `docs/vault/.obsidian/community-plugins.json` — must contain `obsidian-kanban`
- `docs/vault/.obsidian/plugins/obsidian-kanban/manifest.json` — plugin id + version (here 2.0.51)
- `.agents/skills/kanban-edit-card/SKILL.md` — copy verbatim
- `.agents/skills/kanban-move-card/SKILL.md` — copy verbatim
- `.agents/skills/todo-intake-kanban/SKILL.md` — copy verbatim
- `.agents/skills/todo-next-kanban/SKILL.md` — copy verbatim
- `.agents/skills/buying-journey-manager/SKILL.md` — read as a SHAPE template only (CLI usage + agent instructions); do NOT copy its content (bike/SQLite/MCP domain)
- `docs/local/MANUAL_TESTS.md` — ephemeral per-card checklist semantics (overwritten per UI task, never history)
- `.gitignore` — vault and skills are committed; secrets/DBs/build output are ignored

Do this in THIS project:

1. **Vault shell.** Create `docs/vault/` and `docs/local/`. Copy the reference
   `docs/vault/.obsidian/` 1:1 (all JSON + `plugins/obsidian-kanban/`), OR —
   if you distrust copied editor state — create an empty vault and install the
   community plugin `obsidian-kanban` from inside Obsidian, then open the board
   file once in Kanban view so the config regenerates.
2. **Board.** Create `docs/vault/Untitled Kanban.md` with frontmatter
   `kanban-plugin: board`, exactly four lists (`## todo`, `## progress`,
   `## waiting`, `## done`), each card as one `- [ ] Title` line with indented
   sub-bullet specs, and the `%% kanban:settings %%` footer copied in shape
   from the reference (never hand-edit it). Start with ONE probe card
   `- [ ] Probe card (delete me)` under `## todo`. Keep the filename
   `Untitled Kanban.md` — the skills hardcode it.
3. **Vault content (rewrite, don't copy).** Write a fresh `docs/vault/README.md`
   (how to open the vault, what goes in it, structure, conventions: one note =
   one topic, filename = title, `[[Wikilinks]]`, sparse tags) and one purpose
   note for THIS game (one-sentence definition, why it exists, what it is not,
   typical flow). Add growth folders as needed (`Inbox/`, `Entscheidungen/` or
   English equivalents). Never copy bike notes or bike cards.
4. **Skills.** Create `.agents/skills/<name>/SKILL.md` for `kanban-edit-card`,
   `kanban-move-card`, `todo-intake-kanban`, `todo-next-kanban`, copying each
   reference `SKILL.md` verbatim (frontmatter `name:` + `description:`
   included; directory name must match `name:`). If you renamed the board,
   update the board path identically in all four. Then decide the domain skill:
   skip it, or write one `<game>-manager/SKILL.md` following the reference
   shape but with this game's real scripts/commands.
5. **Git.** Ensure `docs/vault/.obsidian/` and `.agents/skills/` are committed;
   ensure secrets, local databases/saves, build output, and `node_modules/` (or
   engine equivalents) are ignored. Never commit the reference repo's content.
6. **Verify before reporting done:**
   - `ls docs/vault/ docs/vault/.obsidian/plugins/ .agents/skills/` shows the
     vault, the plugin dir, and the skill dirs; each `SKILL.md` has `name:` frontmatter.
   - Board header shows `kanban-plugin: board` + four `##` lists; settings footer intact.
   - Ask the user to open `docs/vault/` in Obsidian ("Open folder as vault"):
     the board must render as Kanban with 4 columns and the probe card visible.
   - Dry run, then revert: add a probe card per `kanban-edit-card`, move it
     `todo` → `progress` → `done` per `kanban-move-card`, check `git diff` shows
     only intended lines, then delete the probe.
   - `git status --short` shows only intended new files.

Rules: structure over content (never import bike cards/notes/skill logic);
merge, don't overwrite, if `docs/vault/` or `.agents/skills/` already exist;
the visual Obsidian render check is the gate that matters (file checks alone
are not enough). Report: what you copied verbatim, what you rewrote, the
domain-skill decision, and verification results including the user's Obsidian
confirmation.
