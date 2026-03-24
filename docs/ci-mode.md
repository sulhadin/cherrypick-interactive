# 🤖 CI Mode

Run `cherrypick-interactive` fully non-interactive in CI/CD pipelines.

## Usage

```bash
# Basic — pick all missing commits, fail on conflict
cherrypick-interactive --ci

# With conflict strategy
cherrypick-interactive --ci --conflict-strategy theirs

# JSON output for downstream steps
cherrypick-interactive --ci --format json > result.json
```

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--ci` | `false` | Enable fully non-interactive mode (implies `--all-yes`) |
| `--conflict-strategy` | `fail` | `fail`, `ours`, `theirs`, `skip` |
| `--format` | `text` | `text` or `json` |
| `--dependency-strategy` | `warn` | `warn`, `fail`, `ignore` |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success — all commits applied |
| `1` | Conflict — cherry-pick failed (with `--conflict-strategy fail`) |
| `2` | No commits — nothing to cherry-pick |
| `3` | Auth error — git push or PR creation failed |
| `4` | Dependency — unresolved dependencies detected (with `--dependency-strategy fail`) |

## JSON Output

When `--format json` is set, structured JSON goes to **stdout** and all logs go to **stderr**:

```json
{
  "version": {
    "previous": "1.7.1",
    "next": "1.8.0",
    "bump": "minor"
  },
  "branch": "release/1.8.0",
  "commits": {
    "applied": ["abc1234", "def5678"],
    "skipped": ["ghi9012"],
    "total": 3
  },
  "changelog": "## v1.8.0\n\n### Features\n...",
  "pr": {
    "url": null
  }
}
```

Colors are auto-disabled in JSON mode (`NO_COLOR=1`).

## GitHub Actions Example

```yaml
name: Nightly Sync
on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:

concurrency:
  group: cherrypick-sync
  cancel-in-progress: false

permissions:
  contents: write
  pull-requests: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Enable Corepack
        run: corepack enable

      - uses: actions/setup-node@v5
        with:
          node-version: 22

      - name: Configure git identity
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Install and run
        run: |
          npm install -g cherrypick-interactive@latest
          cherrypick-interactive --ci --dev origin/dev --main origin/staging --conflict-strategy theirs --format json > result.json
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NO_COLOR: 1
```

## Color Handling

`chalk` respects the `NO_COLOR=1` environment variable. No custom `--no-color` flag needed.

## Git Authentication

The tool pushes branches and creates PRs via `gh`. In CI this requires:
- `GITHUB_TOKEN` with `contents: write` and `pull-requests: write` permissions
- Git identity configured (`user.name`, `user.email`)

> **Note:** Pushes made with `GITHUB_TOKEN` will NOT trigger downstream workflows. Use a PAT or GitHub App token if needed.
