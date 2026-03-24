# 🔗 Tracker Integration

Link ticket IDs in your changelog and PR description to your issue tracker. No API calls, no authentication — just pattern matching and URL templating.

## Built-in Presets

```bash
cherrypick-interactive --tracker clickup --tracker-url "https://app.clickup.com/t/{{id}}"
cherrypick-interactive --tracker jira --tracker-url "https://team.atlassian.net/browse/{{id}}"
cherrypick-interactive --tracker linear --tracker-url "https://linear.app/my-team/issue/{{id}}"
```

Presets set the `--ticket-pattern` automatically. `--tracker-url` is still required since it contains team-specific values.

## Custom Patterns

For trackers not covered by presets:

```bash
cherrypick-interactive --ticket-pattern "#([a-z0-9]+)" --tracker-url "https://app.clickup.com/t/{{id}}"
```

The regex must have exactly **one capture group** for the ticket ID.

## How It Works

```
Commit:    #86c8w62wx - Fix login bug (#585)
Pattern:   #([a-z0-9]+)
URL:       https://app.clickup.com/t/{{id}}

Changelog: [#86c8w62wx](https://app.clickup.com/t/86c8w62wx) - Fix login bug (#585)
```

Only the **first match** is replaced to avoid linking PR numbers or other false positives.

## Config File

Store tracker config in `.cherrypickrc.json` so you don't have to pass flags every time:

```json
{
  "tracker": {
    "ticket-pattern": "#([a-z0-9]+)",
    "tracker-url": "https://app.clickup.com/t/{{id}}"
  }
}
```

## Preset Patterns

| Preset | Pattern | Example Match |
|--------|---------|---------------|
| `clickup` | `#([a-z0-9]+)` | `#86c8w62wx` |
| `jira` | `([A-Z]+-\d+)` | `PROJ-123` |
| `linear` | `\[([A-Z]+-\d+)\]` | `[ENG-456]` |

## Summary Log

After processing, the tool logs how many commits had ticket IDs linked:

```
Tracker: 4 of 12 commits had ticket IDs linked.
```

This helps surface misconfigurations when 0 matches are found.

## Safety

All user-supplied regex patterns are validated with `safe-regex2` to prevent catastrophic backtracking (ReDoS).
