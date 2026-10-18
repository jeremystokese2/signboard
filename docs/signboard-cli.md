# CLI guide

Run `signboard --help` for sprint, work, taskboard, agent and skill commands. Run `signboard legacy-help` for retained upstream card, list, archive, settings and import commands.

`--board PATH` selects an explicit board; `signboard use PATH` persists a default. `--json` prints machine-readable results. `signboard init PATH` creates an empty personal board; its parent folder must already exist.

For bulk text use `work add TITLE --body-file PATH` or `work edit ID --body-file PATH`. Read the existing body first; replacement replaces the whole body. Use the retained `cards notes add` or section-edit commands for targeted notes.

Sprint create/edit accepts `--goal`, `--start`, `--end`, `--capacity` and `--wip`. Start selects one active sprint; close clears it and preserves work. Task membership can be `--sprint current`, a sprint ID/name, or `none` for the backlog. New tasks inherit the parent's sprint only at creation.

Work add/edit accepts `--kind story|task`, `--parent ID|none`, `--estimate HOURS|none`, `--blocked REASON|none`, `--status`, `--title` (edit) and body options. Tasks can have a story parent; stories cannot nest. IDs are returned by create and read commands.

`taskboard --sprint current|backlog|all|ID --json` returns rows, columns, sprint metadata and totals. `--watch` emits newline-delimited snapshots when changed. SIGTERM/SIGINT stops the watcher.

`agent --prompt TEXT --card ID --sprint ID` launches the default Omarchy agent with the bundled skill and board context. `--dry-run` prints the argv without launching. The GUI uses this command. Background jobs can use the ordinary board commands directly, with explicit board paths.

`skill install --target PATH` links the bundled skill inside an agent's skills directory; it refuses to replace an unrelated existing entry. `skill show` prints it without installation.
