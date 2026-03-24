# ↩️ Undo / Rollback

Made a mistake? Roll back the entire cherry-pick session with a single command.

## Usage

```bash
cherrypick-interactive --undo
```

## How It Works

1. Before each cherry-pick session, a checkpoint is automatically saved (`.cherrypick-session.json`)
2. When `--undo` is run:
   - Validates the checkpoint hash is an ancestor of current HEAD
   - Checks for branch divergence (extra unknown commits)
   - Confirms with the user (warning mentions remote history rewrite)
   - Resets branch to checkpoint with `git reset --hard`
   - Force pushes with `--force-with-lease` (if remote exists)
   - Cleans up session file
3. Offers to re-open commit selection

## Safety Checks

- **Checkpoint validation:** Verifies the checkpoint commit is a valid ancestor before reset
- **Divergence detection:** If someone else pushed commits after your cherry-pick, the undo is aborted to prevent data loss
- **--force-with-lease:** Safer than `--force` — refuses to push if the remote has changed
- **Confirmation default: No** — user must explicitly type `y`
- **Branch mismatch warning:** If you're on a different branch than the session, you'll be prompted to switch

## Session File

The session is stored in `.cherrypick-session.json` at the git repository root:

```json
{
  "branch": "release/1.8.0",
  "checkpoint": "abc1234def5678...",
  "timestamp": "2026-03-24T14:30:00.000Z",
  "commits": ["aaa1111", "bbb2222", "ccc3333"]
}
```

This file is:
- Created automatically before each cherry-pick session
- Deleted on successful completion (PR created/pushed)
- Deleted after a successful undo
- Listed in `.gitignore`

## Limitations

- **All-or-nothing:** Undo resets to the checkpoint — individual commits cannot be selectively removed
- **Interactive only:** `--undo` with `--ci` exits with an error. In CI, re-run the pipeline instead.
- **One session:** Only the most recent session is tracked
