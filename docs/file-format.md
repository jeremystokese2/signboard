# Board storage

This fork retains upstream Signboard's board layout:

```text
Workboard/
  board-settings.md
  sprints.json
  000-To-do-stock/
    000-compare-options-ab123.md
  001-Doing-stock/
  002-Done-stock/
  XXX-Archive/
```

List folders and card files carry numeric ordering prefixes. Card IDs are the five-character filename suffixes. Moving/reordering changes paths, while IDs remain stable. CLI operations preserve upstream metadata and unknown frontmatter. Archives retain restore metadata.

Card bodies contain Markdown notes and optional checklists. Frontmatter contains title, labels, start/due dates, Signboard identity and link metadata. This fork adds `work_kind` (story/task), `work_parent` (story ID), `work_sprint` (sprint UUID), `work_estimate` (hours or null), and `work_blocked` (reason or empty string). Existing cards without these fields appear as unparented backlog tasks.

`sprints.json` has version 1, an optional activeSprint ID, and an array of sprint definitions. Use the CLI to edit it. A task's explicit sprint membership determines its view; story movement does not cascade to children.

Back up the whole board, including hidden files and archive. Linked external files remain at their original paths and need their own backup. The CLI default board and access locks live under `$SIGNBOARD_CLI_CONFIG_DIR`, or `$XDG_CONFIG_HOME/signboard`, or `~/.config/signboard`.

Filesystem sync is possible but does not merge concurrent edits. Finish writes and let sync complete before editing on another device. The fork serialises its own CLI operations but external text editors do not participate.
