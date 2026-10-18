# Architecture

The Node CLI is the application boundary. The QML panel and agents both invoke it; neither has a separate database. Omarchy hosts the panel inside its existing Quickshell process.

## Runtime

`bin/signboard.js` enters `lib/sprintCli.js`. Sprint and work commands use `lib/sprintBoard.js`; existing card/list/archive/import commands delegate to upstream `lib/cliApp.js`. Both reuse upstream Markdown parsing, card identity, list movement and atomic-write helpers.

`qml/Taskboard.qml` runs `taskboard --watch --json`. The CLI checks for changes every 1.5 seconds and emits one JSON line when the snapshot changes. It exits when the panel closes. Status controls invoke `work edit`; the prompt box invokes `agent --prompt` with the selected item ID and view.

The agent command constructs a prompt with the board path, CLI path, skill path and selected item. It spawns `omarchy agent prompt` with an argument array and the board as its working directory. Omarchy selects and launches the default agent. No shell interpolates the user's prompt. A dry-run command exposes the handoff for inspection without launching an agent.

## Model

- Board: an upstream Signboard directory.
- Sprint: an ID, name, goal, optional dates, capacity in hours, WIP limit and planned/active/closed state in `sprints.json`.
- Story: a Markdown card with `work_kind: story`.
- Task: a Markdown card with `work_kind: task`, optional `work_parent` story ID, `work_sprint` ID, `work_estimate` hours and `work_blocked` reason.
- Status: the card's containing list. New work commands use To do, Doing, Waiting and Done. The taskboard also displays legacy list names when present.

New tasks inherit their story's sprint once at creation. Subsequent story changes do not silently replan children. Explicit task membership supports partial delivery and carryover. Closing a sprint retains membership and never marks work done.

Each story becomes a row containing selected tasks. Unparented tasks have an Other work row. Task totals exclude stories, preventing parent and child estimates from counting twice. Unknown estimates have a separate count. Remaining hours are the sum of estimates on unfinished tasks; they are not time tracking or a prediction.

## Writes and concurrent use

The CLI resolves the board's real path and acquires an exclusive lock under its config directory. This covers both new commands and retained card/list/archive/settings/import commands. Snapshot reads take the same lock, avoiding observation of partially completed CLI operations. Lock acquisition fails clearly when another process owns it; the watcher retries on its next tick.

Writes reuse upstream same-directory temporary files, fsync and atomic rename. Multi-file operations are not database transactions. Other applications editing Markdown directly do not share the CLI lock. A crash can leave a lock containing its PID; verify the process has stopped before removing it. Stale locks are not automatically stolen.

## Installation and discovery

The repository root is a valid Omarchy plugin with `manifest.json`. The installer links it into the user plugin folder and enables it through Omarchy. The CLI uses Node directly. The skill is installed by a symlink so updates follow the checkout; existing unrelated skills are never overwritten.

Markdown remains readable in Obsidian. The retained storage helpers preserve its metadata and imports, but the removed Electron deep-link handlers and companion plugin are not supplied by this fork.
