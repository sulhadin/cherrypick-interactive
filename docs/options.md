# ⚙️ All Options

Complete reference for all CLI flags. Run `cherrypick-interactive --help` to see this in your terminal.

## Cherry-pick options

| Flag | Description | Default |
|------|--------------|----------|
| `--dev` | Source branch (commits to copy) | `origin/dev` |
| `--main` | Target branch (commits already merged here will be skipped) | `origin/main` |
| `--since` | Git time window filter (e.g. `"2 weeks ago"`) | `1 week ago` |
| `--no-fetch` | Skip `git fetch --prune` | `false` |
| `--all-yes` | Cherry-pick all missing commits without prompt | `false` |
| `--ignore-commits` | Comma-separated regex patterns to exclude commits | — |

## Version options

| Flag | Description | Default |
|------|--------------|----------|
| `--semantic-versioning` | Detect semantic version bump from commits | `true` |
| `--current-version` | Current version (if not reading from file) | — |
| `--version-file` | Path to `package.json` (to read & update version) | `./package.json` |
| `--version-commit-message` | Template for version bump commit. Use `{{version}}` placeholder. | `chore(release): bump version to {{version}}` |
| `--ignore-semver` | Comma-separated regex patterns to ignore for semver | — |

See [Semantic Versioning](semantic-versioning.md) for details.

## Release options

| Flag | Description | Default |
|------|--------------|----------|
| `--create-release` | Create `release/x.y.z` branch from `main` | `true` |
| `--push-release` | Push release branch to origin and create PR | `true` |
| `--draft-pr` | Create the GitHub PR as a draft | `false` |

## CI options

| Flag | Description | Default |
|------|--------------|----------|
| `--ci` | Enable fully non-interactive mode (implies `--all-yes`) | `false` |
| `--conflict-strategy` | How to handle conflicts: `fail`, `ours`, `theirs`, `skip` | `fail` |
| `--format` | Output format: `text` or `json` | `text` |
| `--dependency-strategy` | How to handle dependencies: `warn`, `fail`, `ignore` | `warn` |

See [CI Mode](ci-mode.md) for exit codes, JSON output, and GitHub Actions example.

## Tracker options

| Flag | Description | Default |
|------|--------------|----------|
| `--tracker` | Built-in preset: `clickup`, `jira`, `linear` | — |
| `--ticket-pattern` | Custom regex to capture ticket ID (must have one capture group) | — |
| `--tracker-url` | URL template with `{{id}}` placeholder | — |

See [Tracker Integration](tracker-integration.md) for presets and custom patterns.

## Profile options

| Flag | Description | Default |
|------|--------------|----------|
| `--profile` | Load a named profile from `.cherrypickrc.json` | — |
| `--save-profile` | Save current CLI flags as a named profile | — |
| `--list-profiles` | List available profiles and exit | `false` |

See [Profiles](profiles.md) for config file format and CI usage.

## Session options

| Flag | Description | Default |
|------|--------------|----------|
| `--undo` | Reset release branch to pre-cherry-pick state | `false` |

See [Undo / Rollback](undo-rollback.md) for safety checks and limitations.

## UI options

| Flag | Description | Default |
|------|--------------|----------|
| `--no-tui` | Disable TUI dashboard, use simple checkbox instead | `false` |
| `--dry-run` | Show what would happen without applying changes | `false` |

See [TUI Dashboard](tui-dashboard.md) for keyboard shortcuts and fallback behavior.
