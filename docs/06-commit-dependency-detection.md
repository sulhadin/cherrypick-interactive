# Feature: Commit Dependency Detection

## Problem

When selecting commits to cherry-pick, users may unknowingly skip a commit that a selected commit depends on. This leads to conflicts during cherry-pick that could have been avoided. The user wastes time resolving conflicts or debugging why a pick failed.

## Solution

After commit selection (before cherry-pick starts), analyze the file-level overlap between selected and unselected commits. If a selected commit touches files that were also modified by an unselected commit that comes earlier in the history, warn the user and offer to include the missing commit.

## How It Works

1. User selects commits and presses Enter
2. For each selected commit, get its changed file list (`git diff-tree --no-commit-id --name-only -r <hash>`)
3. For each unselected commit, get its changed file list
4. If a selected commit and an earlier unselected commit share changed files → flag as potential dependency
5. Show warning with options

## CLI Changes

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dependency-strategy` | string | `warn` | How to handle detected dependencies in CI: `warn`, `fail`, `ignore`. In interactive mode, the user is always prompted regardless of this flag. |

## Warning UI

```
⚠ Potential dependency detected (file-level heuristic — may be a false positive):

  Selected:    (ghi9012) feat: add login endpoint
  Depends on:  (def5678) feat: add user model  [NOT SELECTED]
  Shared files: src/models/user.js, src/routes/auth.js

? How would you like to proceed?
  ❯ Include missing commits and continue
    Go back to selection
    Continue anyway (may cause conflicts)
```

If multiple dependencies found, list all of them before prompting. Uses `inquirer` list/select pattern (not numbered options) for consistency with the rest of the tool.

When "Include missing commits" is selected, show the full list of commits that will be added and ask for confirmation before proceeding.

## Implementation Steps

1. Create `getChangedFiles(hash, gitRaw)` function:
   - Run `git diff-tree --no-commit-id --name-only -r <hash>`
   - Return array of file paths
2. Create `detectDependencies(selected, unselected, gitRaw)` function:
   - For each selected hash, get changed files
   - For each unselected hash, get changed files
   - Find overlaps where unselected commit is older (earlier in the sequence)
   - Return array of `{ selected, dependency, sharedFiles }` objects
3. In `main()`, after commit selection and before cherry-pick:
   - Call `detectDependencies()`
   - If dependencies found, show warning
   - Handle user choice:
     - **Include**: add missing commits to selection, re-sort oldest→newest
     - **Go back**: return to selection screen
     - **Continue**: proceed as-is
4. In CI mode (`--ci`), behavior depends on `--dependency-strategy`:
   - `warn` (default) → log warnings to stderr, continue
   - `fail` → exit with code 4 if dependencies detected (distinct from conflict exit code 1)
   - `ignore` → skip detection entirely

## Performance

- Batch all file-list fetching into a single `git log --name-only --pretty=format:COMMIT:%H` call instead of N+M individual `git diff-tree` subprocess spawns. This is critical for Windows where process spawning is significantly slower.
- Cache file lists to avoid duplicate calls
- For N selected + M unselected commits: N*M comparisons (set intersection)
- Enforce a configurable maximum commit count (default: 200). Skip analysis with a warning when exceeded.
- Acceptable for typical ranges (< 100 commits total)

## Limitations

- File-level detection only — not function-level
- Same file doesn't always mean dependency (two independent changes to the same file)
- This is a heuristic, not a guarantee — it catches most common cases
- Single-level detection only — does not recursively check if the suggested dependency commit itself has further dependencies. Acceptable for v1; can be extended later if needed.

## Definition of "Earlier"

"Earlier" means chronologically older — a commit that appears before the selected commit in the branch history. A selected commit can only depend on older unselected commits, not newer ones. The comparison uses the commit order as received from `git log` (newest → oldest), reversed to oldest → newest.

## Acceptance Criteria

- [ ] Dependencies detected after selection, before cherry-pick starts
- [ ] Warning shows which commits depend on which, with shared file list
- [ ] User can include missing commits, go back, or continue
- [ ] Including missing commits re-sorts the full list oldest→newest
- [ ] No false positives from commits that come after the selected one
- [ ] CI mode respects `--dependency-strategy` (`warn` / `fail` / `ignore`)
- [ ] Performance is acceptable for 100+ commits
- [ ] Single-level detection only (no recursive dependency chain)
- [ ] Warning UI uses inquirer list/select (not numbered options)
- [ ] Warning includes "heuristic — may be false positive" note
- [ ] "Include" option shows full list of commits to add before confirming
- [ ] File lists fetched via single batched git command (not N+M subprocesses)
- [ ] Max commit count enforced with configurable limit
