# Feature: Profiles

## Problem

Users who work with the same branch/flag combinations repeatedly have to type long commands every time:

```bash
cherrypick-interactive --dev origin/develop --main origin/release/v2 --since "2 weeks ago" --ignore-commits "chore,docs" --draft-pr
```

This is tedious, error-prone, and not shareable across team members.

## Solution

Allow users to save named profiles in a `.cherrypickrc.json` file at the project root. A profile stores a set of CLI flags that can be invoked with `--profile <name>`.

## Config Format

Profiles live under a `"profiles"` key to avoid collisions with other top-level config sections (e.g. `tracker`):

```json
{
  "profiles": {
    "hotfix": {
      "dev": "origin/develop",
      "main": "origin/release/v2",
      "since": "2 weeks ago",
      "ignore-commits": "chore,docs",
      "draft-pr": true
    },
    "nightly": {
      "dev": "origin/dev",
      "main": "origin/staging",
      "since": "1 day ago",
      "all-yes": true
    }
  },
  "tracker": {
    "ticket-pattern": "...",
    "tracker-url": "..."
  }
}
```

## Usage

```bash
# Use a saved profile
cherrypick-interactive --profile hotfix

# Profile + override (CLI flags take precedence)
cherrypick-interactive --profile hotfix --since "3 days ago"

# Save current flags as a profile
cherrypick-interactive --save-profile hotfix --dev origin/develop --main origin/release/v2
```

## CLI Changes

| Flag | Type | Description |
|------|------|-------------|
| `--profile` | string | Load a named profile from `.cherrypickrc.json` |
| `--save-profile` | string | Save current CLI flags as a named profile |
| `--list-profiles` | boolean | List available profiles and exit |

## Implementation Steps

1. Add `--profile` and `--save-profile` options to yargs config
2. Create `loadProfile(name)` function:
   - Resolve `.cherrypickrc.json` from git repo root (`git rev-parse --show-toplevel`), not `process.cwd()`
   - Return the named profile object or throw if not found
3. Create `saveProfile(name, flags)` function:
   - Resolve path via git repo root
   - Read existing `.cherrypickrc.json` (or start with `{}`)
   - If profile already exists, prompt for overwrite confirmation before replacing
   - Use an **allowlist** of saveable flag names (only known-safe config keys) instead of a denylist, to prevent accidentally persisting sensitive values
   - Merge the new profile and write back
   - Print saved profile contents to stdout so the user can verify
4. In `main()`, before any logic, if `--profile` is set:
   - Load profile
   - Merge into `argv` (CLI flags override profile values)
5. If `--save-profile` is set:
   - Strip meta flags (`save-profile`, `profile`, `list-profiles`, `help`, `version`)
   - Save remaining flags under the `profiles` key
   - Exit after saving
6. If `--list-profiles` is set:
   - Read `.cherrypickrc.json`, list profile names with their key flags
   - Exit after listing

## Profiles in CI

Profiles committed to the repo can be reused in CI workflows — configure once, use everywhere:

```bash
# In GitHub Actions
cherrypick-interactive --ci --profile ci-nightly
```

```json
{
  "profiles": {
    "ci-nightly": {
      "dev": "origin/dev",
      "main": "origin/staging",
      "since": "1 day ago",
      "conflict-strategy": "theirs"
    }
  }
}
```

This keeps CI workflow files clean and moves configuration into the repo where it can be reviewed via PR.

### Security: Config file trust in CI

When running in CI on a `pull_request` trigger, the PR branch may contain a modified `.cherrypickrc.json`. To prevent a malicious PR from poisoning CI behavior, either:
- Load `.cherrypickrc.json` from the **base branch** (not the PR head) in CI
- Or require all security-sensitive flags (`conflict-strategy`, branch names) to be set explicitly in the workflow YAML, not from the config file

## Merge Priority (lowest to highest)

1. Yargs defaults
2. Profile values
3. CLI flags (explicit)

## Acceptance Criteria

- [ ] `--profile <name>` loads flags from `.cherrypickrc.json`
- [ ] CLI flags override profile values
- [ ] `--save-profile <name>` persists current flags
- [ ] Missing profile name throws a clear error
- [ ] Missing `.cherrypickrc.json` on `--profile` throws a clear error
- [ ] `.cherrypickrc.json` is human-readable (pretty-printed JSON)
- [ ] `--list-profiles` shows available profiles and exits
- [ ] Profiles stored under `"profiles"` key (not top-level) to avoid key collisions
- [ ] `--save-profile` prompts before overwriting an existing profile
- [ ] `--save-profile` prints saved contents to stdout for verification
- [ ] `--save-profile` uses an allowlist of saveable flags (no sensitive values persisted)
- [ ] Config file resolved from git repo root, not `process.cwd()`
