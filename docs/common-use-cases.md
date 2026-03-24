# 🧩 Common Use Cases

## 1. Compare branches manually

```bash
cherrypick-interactive
```

Lists commits in `origin/dev` that aren't in `origin/main`, filtered by the last week.

## 2. Cherry-pick all missing commits automatically

```bash
cherrypick-interactive --all-yes
```

## 3. Preview changes without applying them

```bash
cherrypick-interactive --dry-run
```

## 4. Filter commits by pattern

```bash
cherrypick-interactive --ignore-commits "^chore\(deps\)|^ci:"
```

Excludes commits starting with `chore(deps)` or `ci:` from the selection list.

## 5. Ignore certain commits from semantic versioning

```bash
cherrypick-interactive --ignore-semver "bump|dependencies"
```

Treats commits containing "bump" or "dependencies" as chores (no version bump).

## 6. Use a saved profile

```bash
# Save your flags once
cherrypick-interactive --save-profile hotfix --dev origin/develop --main origin/release --since "2 weeks ago"

# Reuse anytime
cherrypick-interactive --profile hotfix
```

See [Profiles](profiles.md) for more details.

## 7. Run in CI/CD pipeline

```bash
cherrypick-interactive --ci --conflict-strategy theirs --format json > result.json
```

See [CI Mode](ci-mode.md) for exit codes, JSON output, and GitHub Actions example.

## 8. Link ticket IDs in changelog

```bash
cherrypick-interactive --tracker clickup --tracker-url "https://app.clickup.com/t/{{id}}"
```

See [Tracker Integration](tracker-integration.md) for presets and custom patterns.

## 9. Undo the last cherry-pick session

```bash
cherrypick-interactive --undo
```

See [Undo / Rollback](undo-rollback.md) for safety checks and details.

## 10. Custom time window

```bash
cherrypick-interactive --since "3 months ago"
```

## 11. Different branch names

```bash
cherrypick-interactive --dev origin/develop --main origin/production
```

## 12. Skip git fetch

```bash
cherrypick-interactive --no-fetch
```

Useful when you've already fetched or are working offline.
