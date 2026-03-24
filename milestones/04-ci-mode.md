# Feature: CI Mode

## Problem

The tool is fully interactive — it prompts for selections, confirmations, and conflict resolution. This makes it unusable in CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins) where there is no terminal.

Existing `--all-yes` flag covers some cases but doesn't handle conflicts or guarantee zero interactivity.

## Solution

A `--ci` flag that guarantees fully non-interactive execution. All decisions are automated, conflicts follow a predefined strategy, and output is structured for pipeline consumption.

## Usage

```bash
# Basic — pick all missing commits, fail on conflict
cherrypick-interactive --ci

# With conflict strategy
cherrypick-interactive --ci --conflict-strategy ours

# Cherry-pick specific time range
cherrypick-interactive --ci --since "1 day ago" --conflict-strategy theirs

# Output JSON for downstream steps
cherrypick-interactive --ci --format json
```

## CLI Changes

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--ci` | boolean | `false` | Enable CI mode (fully non-interactive) |
| `--conflict-strategy` | string | `fail` | How to handle conflicts: `fail`, `ours`, `theirs`, `skip`. In CI: auto-resolves. In interactive: sets default but user is still prompted to confirm. |
| `--format` | string | `text` | Output format: `text` or `json`. JSON goes to stdout, all logs to stderr. |

## Conflict Strategies

| Strategy | Behavior |
|----------|----------|
| `fail` | Abort the entire process on first conflict (exit code 1) |
| `ours` | Resolve all conflicts using current branch version |
| `theirs` | Resolve all conflicts using cherry-picked commit version |
| `skip` | Skip the conflicting commit, continue with the rest |

### Security Note: `theirs` strategy

`--conflict-strategy theirs` automatically accepts the cherry-picked commit's version for all conflicts. If an attacker gets malicious code into the source branch, CI will merge it into the release branch without human review. Only use `theirs` when the source branch has equivalent branch protection rules and code review requirements.

## JSON Output

When `--format json` is set, the JSON serializer must use a **field allowlist** — never include `process.env`, error stack traces, or any values that might contain tokens. Only the following fields are emitted:

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
  "changelog": "## v1.8.0\n\n### Features\n- add user auth\n...",
  "pr": {
    "url": "https://github.com/org/repo/pull/42"
  }
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success — all commits applied |
| `1` | Conflict — cherry-pick failed (with `--conflict-strategy fail`) |
| `2` | No commits — nothing to cherry-pick |
| `3` | Auth error — git push or PR creation failed |
| `4` | Dependency — unresolved dependencies detected (with `--dependency-strategy fail`) |

Distinct exit codes allow CI pipelines to differentiate failure reasons in conditional steps (e.g., `if: steps.sync.outcome == 'failure'` combined with exit code parsing).

## Color Handling

`chalk` auto-detects CI environments and already respects the `NO_COLOR=1` environment variable (standard convention). No custom `--no-color` flag is needed — rely on chalk's built-in detection:
- `NO_COLOR=1` → disables colors (set this in CI env)
- `FORCE_COLOR=0` → also disables colors
- Colors auto-disabled when `--format json` is set

## Git Authentication in CI

The tool pushes branches and creates PRs via `gh`. In CI this requires:
- `GITHUB_TOKEN` with `contents: write` and `pull-requests: write` permissions
- Git identity configured (`user.name`, `user.email`) for commits

### GITHUB_TOKEN vs PAT

**Important:** Pushes made with the default `GITHUB_TOKEN` will NOT trigger downstream workflows (e.g., your release workflow). This is a GitHub Actions safeguard against infinite loops. If you need the cherry-pick sync to trigger other workflows:
- Use a **Personal Access Token (PAT)** or **GitHub App token** instead of `GITHUB_TOKEN`
- Pass the same token to `actions/checkout` via the `token` parameter so git push uses it

### Schedule Limitations

GitHub Actions scheduled workflows (`cron`) can be delayed 5–15+ minutes and only run on the default branch. Plan accordingly — don't rely on exact timing.

These are shown in the example below.

## CI/CD Example

```yaml
# GitHub Actions — nightly sync dev → staging
name: Nightly Sync
on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:  # Allow manual triggering for debugging

# Prevent overlapping runs on the same branch
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
          # Use a PAT instead of GITHUB_TOKEN if you need this to trigger downstream workflows
          # token: ${{ secrets.PAT }}

      - uses: actions/setup-node@v5
        with:
          node-version: 22

      - name: Configure git identity
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Install cherrypick-interactive
        run: npm install -g cherrypick-interactive@latest

      - name: Run cherry-pick sync
        run: cherrypick-interactive --ci --dev origin/dev --main origin/staging --conflict-strategy theirs --format json > result.json
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NO_COLOR: 1

      - name: Upload result as artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: cherrypick-result
          path: result.json
          if-no-files-found: ignore

      - name: Notify on failure
        if: failure()
        run: echo "Cherry-pick sync failed"
```

### Why `npm install -g` instead of `npx`?

`npx` downloads the package on every run, adding latency and network dependency. In CI, prefer `npm install -g` for faster builds. Use `@latest` to always get the newest version, or pin a specific version (e.g., `@1.8.0`) for full reproducibility.

## Implementation Steps

1. Add `--ci`, `--conflict-strategy`, and `--format` options to yargs. Organize under a "CI options" yargs group.
2. When `--ci` is set, implicitly enable:
   - `--all-yes` (select all commits)
   - `--no-fetch` stays as-is (user controls this)
3. Replace all `inquirer.prompt()` calls with guards:
   - Create helper: `async function promptOrDefault(promptConfig, ciDefault)`
   - In CI mode, return `ciDefault` without prompting
4. In `handleCherryPickConflict()`:
   - If `--ci` + `fail` → abort and exit 1
   - If `--ci` + `ours` → `git checkout --ours . && git add .`
   - If `--ci` + `theirs` → `git checkout --theirs . && git add .`
   - If `--ci` + `skip` → `git cherry-pick --abort`, continue loop
5. At the end of `main()`, if `--format json`:
   - Collect results into object
   - `console.log(JSON.stringify(result, null, 2))`
   - Suppress all other `log()` output (or redirect to stderr)

## Acceptance Criteria

- [ ] `--ci` runs with zero interactive prompts
- [ ] `--conflict-strategy` resolves conflicts automatically
- [ ] `--format json` produces structured, parseable output
- [ ] Non-zero exit code on failure
- [ ] All `log()` output goes to stderr when `--format json` is set
- [ ] Works in GitHub Actions, GitLab CI, and bare terminals
- [ ] `--ci` without `--conflict-strategy` defaults to `fail`
- [ ] `--conflict-strategy` works independently of `--ci` (usable in interactive mode too)
- [ ] JSON output includes `changelog` field for downstream consumption
- [ ] Documented exit codes (0, 1, 2, 3, 4) for pipeline conditionals
- [ ] Exit codes only apply in `--ci` mode; non-CI preserves current behavior
- [ ] Colors auto-disabled with `--format json`; respects `NO_COLOR=1` (no custom flag)
- [ ] JSON serializer uses field allowlist (no env vars or stack traces leaked)
- [ ] `--conflict-strategy` in interactive mode sets default but still prompts user
- [ ] `theirs` strategy security warning documented
- [ ] Flags organized under yargs groups to keep `--help` readable
