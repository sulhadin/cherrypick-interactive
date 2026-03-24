# ⚔️ Interactive Conflict Resolution

When cherry-picking encounters conflicts, the tool provides an **interactive wizard**:

## Conflict Resolution Options

**Per-file resolution:**
- **Use ours** — Keep the current branch's version
- **Use theirs** — Accept the cherry-picked commit's version
- **Open in editor** — Manually resolve conflicts in your editor
- **Show diff** — View the conflicting changes
- **Mark resolved** — Stage the file as-is

**Bulk actions:**
- **Use ours for ALL** — Apply current branch's version to all conflicts
- **Use theirs for ALL** — Accept cherry-picked version for all conflicts
- **Stage ALL** — Mark all files as resolved
- **Launch mergetool** — Use Git's configured merge tool

## Key Features

✅ **Preserves original commit messages** — Even when resolving conflicts, the commit message from the original commit in `dev` is maintained exactly
✅ **Handles squashed commits** — Works correctly with squashed commits that contain multiple changes
✅ **Resume cherry-picking** — After resolving conflicts, automatically continues with remaining commits

## CI Mode

In CI mode, `--conflict-strategy` handles conflicts automatically:

| Strategy | Behavior |
|----------|----------|
| `fail` | Abort on first conflict (exit code 1) |
| `ours` | Resolve using current branch version |
| `theirs` | Resolve using cherry-picked version |
| `skip` | Skip conflicting commit, continue with rest |

```bash
cherrypick-interactive --ci --conflict-strategy theirs
```

> **Security note:** `--conflict-strategy theirs` automatically accepts the cherry-picked commit's version. Only use when the source branch has equivalent branch protection rules.
