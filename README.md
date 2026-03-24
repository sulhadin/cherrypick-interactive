# cherrypick-interactive

Cherry-pick missing commits from one branch to another — interactively and safely.

## What it does

Compares two branches, shows what's missing, lets you pick which commits to move over, and handles the rest: conflicts, versioning, changelog, PR.

```bash
npx cherrypick-interactive
```

## Install

```bash
npm install -g cherrypick-interactive
```

## Quick Start

```bash
# Interactive selection with all defaults
cherrypick-interactive

# Preview without applying
cherrypick-interactive --dry-run

# Pick everything, no prompts
cherrypick-interactive --all-yes
```

Full workflow with release branch and PR:

```bash
cherrypick-interactive \
  --semantic-versioning \
  --version-file ./package.json \
  --create-release \
  --push-release \
  --draft-pr
```

## Features

**Core:**
- Finds commits in source branch not present in target branch
- Interactive commit selection (TUI dashboard or simple checkbox)
- Cherry-picks in correct order (oldest to newest)
- Interactive conflict resolution wizard (per-file or bulk)
- Preserves original commit messages

**Versioning & Release:**
- Detects semantic version bump from conventional commits
- Creates `release/x.y.z` branch
- Generates markdown changelog
- Updates `package.json` version
- Opens GitHub PR (draft or normal)

**Profiles:**
- Save and reuse CLI flag combinations
- `--save-profile hotfix` saves current flags
- `--profile hotfix` loads them back
- `--list-profiles` shows available profiles
- Stored in `.cherrypickrc.json`

**Tracker Integration:**
- Links ticket IDs in changelog to your issue tracker
- Built-in presets: `--tracker clickup`, `--tracker jira`, `--tracker linear`
- Custom patterns: `--ticket-pattern "#([a-z0-9]+)" --tracker-url "https://app.clickup.com/t/{{id}}"`
- ReDoS-safe regex validation

**CI Mode:**
- `--ci` for fully non-interactive execution
- `--conflict-strategy ours|theirs|skip|fail`
- `--format json` for structured output (stdout=JSON, stderr=logs)
- Distinct exit codes: 0=success, 1=conflict, 2=no commits, 3=auth error, 4=dependency

**Dependency Detection:**
- Warns when selected commits depend on unselected ones (file-level heuristic)
- Options: include missing commits, go back to selection, or continue anyway
- `--dependency-strategy warn|fail|ignore`

**Undo / Rollback:**
- `--undo` resets release branch to pre-cherry-pick state
- Checkpoint saved automatically before each session
- Validates branch integrity before reset
- Uses `--force-with-lease` (not `--force`)

**Changelog Preview:**
- Shows full changelog before cherry-pick starts
- Includes version bump info and ticket links
- Confirmation defaults to No — must explicitly approve

## Options

### Cherry-pick

| Flag | Default | Description |
|------|---------|-------------|
| `--dev` | `origin/dev` | Source branch |
| `--main` | `origin/main` | Target branch |
| `--since` | `1 week ago` | Time window for commits |
| `--no-fetch` | `false` | Skip `git fetch --prune` |
| `--all-yes` | `false` | Select all commits without prompt |
| `--ignore-commits` | — | Regex patterns to exclude commits |

### Version

| Flag | Default | Description |
|------|---------|-------------|
| `--semantic-versioning` | `true` | Auto-detect version bump |
| `--current-version` | — | Current X.Y.Z version |
| `--version-file` | `./package.json` | Read/write version from file |
| `--version-commit-message` | `chore(release): bump version to {{version}}` | Commit message template |
| `--ignore-semver` | — | Regex patterns to exclude from versioning |

### Release

| Flag | Default | Description |
|------|---------|-------------|
| `--create-release` | `true` | Create release branch |
| `--push-release` | `true` | Push and create PR |
| `--draft-pr` | `false` | Create PR as draft |

### CI

| Flag | Default | Description |
|------|---------|-------------|
| `--ci` | `false` | Non-interactive mode |
| `--conflict-strategy` | `fail` | `fail`, `ours`, `theirs`, `skip` |
| `--format` | `text` | `text` or `json` |
| `--dependency-strategy` | `warn` | `warn`, `fail`, `ignore` |

### Tracker

| Flag | Default | Description |
|------|---------|-------------|
| `--tracker` | — | Preset: `clickup`, `jira`, `linear` |
| `--ticket-pattern` | — | Custom regex (one capture group) |
| `--tracker-url` | — | URL template with `{{id}}` |

### Profile

| Flag | Default | Description |
|------|---------|-------------|
| `--profile` | — | Load named profile |
| `--save-profile` | — | Save current flags as profile |
| `--list-profiles` | `false` | List profiles and exit |

### Session

| Flag | Default | Description |
|------|---------|-------------|
| `--undo` | `false` | Rollback to pre-cherry-pick state |

### UI

| Flag | Default | Description |
|------|---------|-------------|
| `--no-tui` | `false` | Use simple checkbox instead of TUI |
| `--dry-run` | `false` | Preview without applying |

## CI/CD Usage

```yaml
- run: npx cherrypick-interactive --ci --conflict-strategy theirs --format json > result.json
```

Exit codes: `0` success, `1` conflict, `2` no commits, `3` auth error, `4` dependency issue.

## Profiles

```bash
# Save
cherrypick-interactive --save-profile hotfix --dev origin/develop --main origin/release --since "2 weeks ago"

# Use
cherrypick-interactive --profile hotfix

# Override
cherrypick-interactive --profile hotfix --since "3 days ago"
```

Config stored in `.cherrypickrc.json`:

```json
{
  "profiles": {
    "hotfix": {
      "dev": "origin/develop",
      "main": "origin/release",
      "since": "2 weeks ago"
    }
  },
  "tracker": {
    "ticket-pattern": "#([a-z0-9]+)",
    "tracker-url": "https://app.clickup.com/t/{{id}}"
  }
}
```

## Conflict Resolution

When conflicts occur, the tool offers:

**Per-file:** use ours, use theirs, open in editor, show diff, mark resolved

**Bulk:** use ours for all, use theirs for all, stage all, launch mergetool

In CI mode, `--conflict-strategy` handles this automatically.

## Requirements

- Node.js >= 20
- Git >= 2.0
- GitHub CLI (`gh`) — optional, for `--push-release`

## License

MIT
