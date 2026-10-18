# Signboard for Omarchy

A personal sprint taskboard, maintained through a CLI or an agent, with a native QML window in Omarchy's shell.

Forked from [Colin Devroe's Signboard](https://github.com/cdevroe/signboard). The fork retains its Markdown cards, atomic file writes, ordering, archive and import support. The desktop Electron application and MCP server have been removed.

## What it does

- Stories form taskboard rows; task cards appear under To do, Doing, Waiting and Done.
- Select the current sprint, another sprint, the backlog or all work.
- See completed tasks, active work against a WIP limit, planned hours against capacity, and missing estimates.
- Select a card to inspect its notes and change its status.
- Prompt your default Omarchy agent from the board, with the selected card, board and sprint included as context.
- Watch changes from agents and background jobs appear automatically.

The prompt box launches the agent in Omarchy's normal terminal using `omarchy agent prompt`. The conversation continues in that terminal. The taskboard stays open and refreshes as the agent writes. There is no embedded chat transcript or model subscription in this fork.

## Install on Omarchy

Requires Node.js 22 or newer, npm, and an Omarchy version with the Quickshell plugin API and `omarchy agent prompt`.

```bash
git clone https://github.com/jeremystokese2/signboard.git
cd signboard
./scripts/install.sh
```

The installer installs Node dependencies without lifecycle scripts, links this checkout into the user plugin directory, links the CLI under `~/.local/bin`, and enables the plugin. It refuses to replace an unrelated existing plugin or CLI. Keep the checkout in place while installed.

```bash
signboard init ~/Documents/Workboard
signboard sprint create 'This week' --goal 'Prepare the proposal' --capacity 12 --wip 2
signboard sprint start 'This week'
signboard gui
```

The GUI can also be summoned using `omarchy-shell shell summon jeremy.signboard '{}'`. It uses the CLI's selected board unless passed a `board` path in the payload. Configure your default agent through Omarchy if you have not already done so.

## Agent skill

The GUI includes the bundled skill's absolute path with every prompt. For automatic discovery elsewhere, link it into your agent's skills folder:

```bash
signboard skill install --target ~/.codex/skills
# Or use the corresponding skills folder for another agent.
signboard skill show
```

The skill teaches the CLI, task decomposition, personal sprint planning, WIP, estimates, blockers and explicit carryover. It treats the board as a record of your work. Adding a task is not permission for an agent to execute that task.

## CLI

```bash
signboard --help
signboard work add 'Prepare proposal' --kind story --sprint current --json
# Use the returned story ID:
signboard work add 'Compare options' --parent STORY_ID --estimate 2 --json
signboard work edit TASK_ID --status Doing
signboard taskboard --json
signboard taskboard --watch --json
```

Commands accept `--board /absolute/path`. Existing `cards`, `lists`, `archive`, `settings` and `import` commands remain available: `signboard legacy-help`. See [CLI guide](docs/signboard-cli.md).

## Storage and limits

Cards remain Markdown files with YAML frontmatter. Sprint definitions live in `sprints.json`; card metadata holds kind, parent, sprint, estimate and blocker. Sprint closing preserves its tasks. Moving a story to another sprint does not silently move its children; carry tasks over explicitly.

Capacity and estimates are hours. Totals count task cards, excluding their parent stories. Unknown estimates remain visible. Capacity is a planning comparison, not an automatic schedule or calendar integration. There are no burndown charts.

CLI processes serialise board access using an exclusive lock in the CLI config directory and use upstream atomic file writes. A crashed process can leave a lock; only remove it after confirming the owning PID is no longer running. External text editors and other Signboard versions do not participate in this lock. Avoid simultaneous external edits. See [storage](docs/file-format.md) and [architecture](docs/architecture.md).

## Development

```bash
npm ci --ignore-scripts
npm test
npm run test:upstream
```

QML lives in `qml/Taskboard.qml`; the root manifest follows Omarchy's plugin contract. It uses the shell's theme colours. Changes in an installed user plugin are reloaded by Omarchy. No Electron build or web server is required.

MIT licence; upstream copyright is retained in [LICENSE](LICENSE).
