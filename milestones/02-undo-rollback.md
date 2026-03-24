# Feature: Undo / Rollback

## Problem

After cherry-picking commits onto a release branch, the user may realize they included a wrong commit. Currently, the only way to fix this is to manually figure out git commands (`revert`, `reset`, etc.). This is error-prone, especially for less experienced users.

## Solution

Before each cherry-pick session starts, save a checkpoint (the commit hash of the branch tip). When the user runs `--undo`, reset the release branch to that checkpoint and force push. Then optionally re-open the interactive selection so they can pick the correct commits.

## How It Works

### Save checkpoint

When cherry-pick session begins (after branch creation, before first pick):

```
checkpoint = current HEAD commit hash
```

Store in `.cherrypick-session.json`:

```json
{
  "branch": "release/1.8.0",
  "checkpoint": "abc1234def5678",
  "timestamp": "2026-03-24T14:30:00Z",
  "commits": ["aaa1111", "bbb2222", "ccc3333"]
}
```

### Undo flow

```bash
cherrypick-interactive --undo
```

```
⚠ WARNING: This will rewrite remote history for release/1.8.0.
  Anyone else working on this branch will be affected.

  Checkpoint: abc1234 (origin/main)
  Commits to discard: 3
  This is an all-or-nothing rollback — individual commits cannot be selectively removed.

  Continue? (y/N)
```

On confirm:
1. `git reset --hard <checkpoint>`
2. If remote tracking branch exists → `git push --force-with-lease`
3. Delete `.cherrypick-session.json`
4. Ask: "Re-open commit selection? (Y/n)"
5. If yes → run the normal cherry-pick flow from scratch

## CLI Changes

| Flag | Type | Description |
|------|------|-------------|
| `--undo` | boolean | Reset current release branch to pre-cherry-pick state |

## Implementation Steps

1. Add `--undo` option to yargs config
2. Create `saveSession({ branch, checkpoint, commits })` function:
   - Write `.cherrypick-session.json` to git repo root (`git rev-parse --show-toplevel`), not `process.cwd()`
3. Create `loadSession()` function:
   - Resolve path via git repo root
   - Read and parse `.cherrypick-session.json`
   - Return `null` if not found
4. In `cherryPickSequential()`, before first pick:
   - Get current HEAD hash
   - Call `saveSession()`
5. On successful completion (PR created / push done):
   - Delete `.cherrypick-session.json` (session is finalized)
6. When `--undo` is passed in `main()`:
   - Load session, abort if none found
   - **Validate checkpoint**: verify that the checkpoint hash is an ancestor of the current HEAD on the session branch (`git merge-base --is-ancestor`). Abort if not.
   - **Divergence check**: verify no extra commits exist on the branch beyond the session's known commits. If the branch has diverged (someone else pushed), abort with a warning.
   - Confirm with user (warning must mention remote history rewrite)
   - `git reset --hard <checkpoint>`
   - `git push --force-with-lease`
   - Clean up session file
   - Show summary: "Branch release/1.8.0 has been reset to abc1234. You can now re-select commits."
   - Ask: "Re-open commit selection? (Y/n)"
   - If yes → run the normal cherry-pick flow from scratch

## Notes

- The `commits` field in the session file is informational only (for display in the undo prompt). Undo always resets to `checkpoint` — it does not selectively revert individual commits.

## Edge Cases

- No session file exists → "No active session to undo."
- User is on a different branch than the session → warn and confirm
- Session is stale (branch was already merged) → warn and abort
- Branch is local-only (no remote tracking) → skip force push, only reset locally
- `--undo` combined with `--ci` → error and exit. Undo is interactive-only. In CI, just re-run the pipeline instead.

## Acceptance Criteria

- [ ] Session file is created before cherry-pick starts
- [ ] `--undo` resets branch to checkpoint and force pushes with `--force-with-lease`
- [ ] User is prompted before destructive action
- [ ] Session file is cleaned up after undo or successful completion
- [ ] Option to re-open selection after undo
- [ ] Clear error when no session exists
- [ ] `.cherrypick-session.json` added to `.gitignore`
- [ ] `--undo` with `--ci` exits with an error (interactive-only feature)
- [ ] Checkpoint hash validated as ancestor of current HEAD before reset
- [ ] Branch divergence detected and aborted if extra unknown commits exist
- [ ] Warning message explicitly mentions remote history rewrite
- [ ] Session file resolved from git repo root, not `process.cwd()`
- [ ] Summary shown after reset before re-opening selection
