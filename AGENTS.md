# Signboard for Omarchy

Use UK English in prose. This fork is a personal taskboard with a Node CLI and an Omarchy Quickshell/QML panel. The user's work is the subject of the board; it is not an agent execution queue.

Read `docs/architecture.md` for boundaries and `skills/signboard/SKILL.md` for the board workflow. The root `manifest.json` makes the repository an Omarchy panel plugin.

- Preserve upstream Markdown card IDs, unknown frontmatter and ordering conventions.
- Use `lib/atomicFile.js` for durable writes. Keep board mutations under the CLI lock.
- Keep CLI help, the skill and README consistent with behaviour.
- Use argument arrays for agent launches. Respect the default agent selected by Omarchy.
- Use `qs.Commons.Color` for QML theme colours. Keep the GUI usable by keyboard.
- Run `npm test` and `npm run test:upstream` for CLI/storage changes. Validate QML with an isolated Quickshell harness; do not launch a paid agent as a test.
- Keep machine-specific QA output and screenshots under ignored `.local/` or `output/`.
- Do not reintroduce Electron or MCP dependencies.
