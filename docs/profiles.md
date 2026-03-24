# 💾 Profiles

Save and reuse CLI flag combinations so you don't have to type long commands every time.

## Usage

```bash
# Save current flags as a profile
cherrypick-interactive --save-profile hotfix --dev origin/develop --main origin/release --since "2 weeks ago"

# Load a saved profile
cherrypick-interactive --profile hotfix

# Override a single flag from the profile
cherrypick-interactive --profile hotfix --since "3 days ago"

# List all available profiles
cherrypick-interactive --list-profiles
```

## Config File

Profiles are stored in `.cherrypickrc.json` at the git repository root:

```json
{
  "profiles": {
    "hotfix": {
      "dev": "origin/develop",
      "main": "origin/release",
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
    "ticket-pattern": "#([a-z0-9]+)",
    "tracker-url": "https://app.clickup.com/t/{{id}}"
  }
}
```

## Merge Priority

When a profile is loaded, values are merged with this priority (lowest to highest):

1. Yargs defaults
2. Profile values
3. CLI flags (explicit)

CLI flags always win over profile values.

## Overwrite Protection

When saving to an existing profile name, you'll be prompted to confirm before overwriting.

## Security

- Only known-safe flags are saved (allowlist approach)
- Sensitive values (tokens, etc.) are never persisted
- Config file is resolved from git repo root, not `process.cwd()`

## Profiles in CI

Commit `.cherrypickrc.json` to the repo so CI workflows can use profiles:

```bash
cherrypick-interactive --ci --profile ci-nightly
```
