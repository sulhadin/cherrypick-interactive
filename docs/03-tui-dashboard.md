# Feature: TUI Dashboard

## Problem

The current `inquirer` checkbox UI is functional but limited. Users can't see commit details (diff, files changed) without leaving the selection screen. There's no summary bar, no keyboard shortcuts for bulk actions, and no visual context about what they're selecting.

## Solution

Replace the commit selection UI with a rich TUI (Terminal User Interface) built with `ink` (React for CLI). A split-pane layout with commit list on top and a live diff preview on bottom.

## Layout

```
┌─ cherrypick-interactive ──────────────────────────────────┐
│                                                            │
│  origin/dev → origin/main  │  12 missing  │  Since: 1w    │
│                                                            │
│  ☑ abc1234  feat: add user auth              2 days ago    │
│  ☐ def5678  fix: login redirect              3 days ago    │
│> ☑ ghi9012  chore: update deps               5 days ago    │
│  ☐ jkl3456  docs: update readme              6 days ago    │
│                                                            │
│  [space] toggle  [a] all  [n] none  [d] diff  [enter] go  │
│                                                            │
│  ── Preview (ghi9012) ────────────────────────────────────  │
│  3 files changed, +42 -17                                  │
│  package.json  │  yarn.lock  │  src/utils.js               │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

## Components

| Component | Responsibility |
|-----------|---------------|
| `<App>` | Root — manages state, keyboard input |
| `<Header>` | Branch names, commit count, time range |
| `<CommitList>` | Scrollable list with toggle checkboxes |
| `<CommitRow>` | Single commit: checkbox, hash, subject, date |
| `<KeyBar>` | Bottom bar showing available keyboard shortcuts |
| `<Preview>` | Diff summary of the currently highlighted commit |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑/↓` or `j/k` | Navigate commits |
| `space` | Toggle selected commit |
| `a` | Select all |
| `n` | Deselect all |
| `d` | Show full diff in scrollable overlay (press `Esc` to return) |
| `/` | Search/filter commits by message text |
| `enter` | Confirm selection and proceed |
| `q` | Quit (prompts "Are you sure?" if commits are selected) |

## Tech Stack

**Decision: Use `ink` with `createElement` API (no JSX, no build step).**

- **ink** — React renderer for CLI. Adds React as a peer dependency (~150-200 KB to node_modules). This is acceptable for the UX improvement it provides.
- **htm** — Tagged template literals as JSX alternative. Must be added as an explicit dependency.
- Keep `inquirer` for non-TUI prompts (conflict resolution, confirmations)
- All ink-ecosystem packages must be verified for pure ESM compatibility (`"type": "module"` or proper `"exports"` map) before adding.

### No Build Step

The project has no transpiler today. To avoid adding one:
- Use `.js` files with `import { createElement as h } from 'ink'` instead of JSX
- Or use `htm` (tagged template literals) as a JSX alternative

## Implementation Steps

1. Add `ink`, `react`, and `htm` as dependencies (verify all are ESM-compatible before adding)
2. Create `src/tui/` directory:
   - `App.js` — root component, state management
   - `Header.js` — summary bar
   - `CommitList.js` — scrollable commit list
   - `CommitRow.js` — single row
   - `Preview.js` — diff preview pane
   - `KeyBar.js` — shortcut hints
   - Use `createElement` or `htm` instead of JSX (no build step)
3. Create `renderCommitSelector(commits, gitRaw)` function:
   - Renders `<App>` via `ink`'s `render()`
   - Returns a promise that resolves with selected commit hashes
4. Replace `selectCommitsInteractive()` call in `main()` with the new TUI
5. Use `git diff-tree --stat <hash>` for preview data
6. Use `git show <hash> --stat` for file change summary

## Migration Strategy

- Keep `inquirer`-based selection as fallback (`--no-tui` flag)
- TUI is the default when terminal supports it
- Fall back to inquirer automatically when non-interactive terminal detected:
  - Check `process.stdout.isTTY` (no TTY → no TUI)
  - Check `CI` environment variable (`CI=true` → no TUI). GitHub Actions and most CI providers set this automatically.
  - Some CI environments have pseudo-TTYs that fool `isTTY` alone — always check both.

## Acceptance Criteria

- [ ] Commit list renders with checkboxes, hashes, subjects, and dates
- [ ] Arrow keys and j/k navigate the list
- [ ] Space toggles selection
- [ ] Preview pane shows diff stats of highlighted commit
- [ ] Enter confirms and returns selected hashes
- [ ] `--no-tui` falls back to inquirer
- [ ] Non-interactive terminals fall back automatically (checks both `isTTY` and `CI` env var)
- [ ] Minimum terminal size check — gracefully degrade to inquirer if terminal is too small
- [ ] `q` prompts for confirmation when commits are selected
- [ ] `/` key opens search/filter for commit messages
- [ ] `d` opens scrollable diff overlay with `Esc` to return
- [ ] Works on macOS and Linux terminals (Windows: auto-fallback to inquirer, documented as unsupported for TUI)
