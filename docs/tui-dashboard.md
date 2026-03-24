# 🖥️ TUI Dashboard

The commit selection screen features a rich terminal UI built with [ink](https://github.com/vadimdemedes/ink).

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑/↓` or `j/k` | Navigate commits |
| `Space` | Toggle selection |
| `a` | Select all |
| `n` | Deselect all |
| `/` | Search/filter commits by message |
| `d` | Full diff overlay (Esc to return) |
| `p` | Toggle preview pane |
| `Enter` | Confirm selection |
| `q` | Quit (with confirmation if commits are selected) |

## Visual States

Each commit row has three visual states:
- **Cursor (active row):** cyan hash, white subject
- **Selected (checked):** green hash, green subject — stays green even when cursor moves away
- **Default:** gray/dim

Each commit shows its hash, subject, and relative date.

## Diff Preview

Press `p` to toggle the preview pane, which shows `git show --stat` output for the highlighted commit with colored output.

Press `d` to open a full scrollable diff overlay. Press `Esc` to return to the commit list.

## Search / Filter

Press `/` to enter search mode. Type to filter commits by message text. Press `Enter` to apply the filter, `Esc` to cancel.

## Fallback

The TUI falls back to a simple `inquirer` checkbox in these cases:
- `--no-tui` flag is set
- Windows (auto-fallback, documented as unsupported for TUI)
- Terminal too small (< 15 rows or < 60 columns)
- Non-interactive terminal (`process.stdout.isTTY` is false)
- CI environment (`CI=true` environment variable)
- `--ci` or `--all-yes` flags are set
