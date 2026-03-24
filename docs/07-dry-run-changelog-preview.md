# Feature: Dry-run Changelog Preview

## Problem

Users commit to a cherry-pick session without seeing the final changelog output. After cherry-picking, if the changelog doesn't look right (wrong version bump, missing commits, bad formatting), they have to undo and redo. The feedback loop is too late.

## Solution

After commit selection and dependency check — but before cherry-pick starts — show a full preview of the changelog that will be generated. The user can review and either proceed or go back to adjust their selection.

## Flow

```
[Select commits] → [Dependency check] → [Changelog preview] → [Cherry-pick]
```

## Preview UI

```
── Changelog Preview ──────────────────

## v1.8.0 (minor bump)
Previous: v1.7.1 → Next: v1.8.0

### Features
- [#86c8w62wx](https://app.clickup.com/t/86c8w62wx) - Add user auth
- [#92a4b31cx](https://app.clickup.com/t/92a4b31cx) - Add login endpoint

### Fixes
- [#71d2e90wx](https://app.clickup.com/t/71d2e90wx) - Fix redirect loop

### Others
- Update dependencies

────────────────────────────────────

4 commits selected │ 3 files will be created/modified

Proceed with cherry-pick? (y/N)
```

## Implementation Steps

1. Move version computation (`computeSemanticBumpForCommits`) to happen before cherry-pick, alongside selection
   - Currently it already runs before cherry-pick in `main()` — confirm this
2. Compute the release branch name (`release/<version>`) before preview so it can be passed to `buildChangelogBody()` if needed — the branch doesn't need to exist yet, just the name
3. Move `buildChangelogBody()` call to preview stage:
   - Call it with selected commits, computed version, and tracker config
   - Render the output to terminal
4. Add confirmation prompt after preview:
   - **Yes** → proceed with cherry-pick
   - **No** → return to commit selection
5. If tracker integration is configured, linkify tickets in preview
6. In `--dry-run` mode:
   - Show existing commit list output (preserve backward compatibility)
   - Additionally show the changelog preview below it
   - Exit after preview (no cherry-pick, no branch creation)
7. In `--ci` mode:
   - Log preview to stderr
   - Proceed without confirmation

## Integration with Existing Code

The `buildChangelogBody()` function already exists and generates markdown. The only change is calling it earlier and displaying it before cherry-pick starts, rather than writing it to file after cherry-pick.

Current flow:
```
select → create branch → cherry-pick → build changelog → write file
```

New flow:
```
select → compute version → preview changelog → confirm → create branch → cherry-pick → write changelog file
```

## Acceptance Criteria

- [ ] Changelog preview shown after selection, before cherry-pick
- [ ] Preview includes version bump info (previous → next)
- [ ] Preview includes all sections (Features, Fixes, Others)
- [ ] Preview includes linked ticket IDs (if tracker configured)
- [ ] User can go back to selection from preview
- [ ] `--dry-run` shows preview and exits
- [ ] `--ci` logs preview to stderr, proceeds automatically
- [ ] Preview matches the final changelog that gets written to file
- [ ] If commits are skipped during cherry-pick (conflicts), final changelog is regenerated — may differ from preview. This is documented.
- [ ] Confirmation prompt defaults to No (`y/N`) — user must explicitly confirm
- [ ] `--dry-run` preserves existing output format and adds changelog preview below it (backward compatible)
- [ ] Preview uses ASCII-safe formatting (no emoji in header) for terminal compatibility
