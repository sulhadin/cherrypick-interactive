# Cross-cutting Concerns

These items apply across all 7 feature docs and should be addressed before or during implementation.

## 1. Add `"files"` field to package.json

The project has no `"files"` field and no `.npmignore`. When `npm publish` runs, everything not in `.gitignore` is included — meaning `docs/`, `.cherrypickrc.json`, `.cherrypick-session.json`, and other working files will ship to npm.

**Fix (before any feature work):**

```json
{
  "files": ["cli.js", "src/"]
}
```

This allowlist approach guarantees only necessary files are published, regardless of what working files exist in the repo.

## 2. Yargs flag grouping

The current tool has 15 flags. The 7 features collectively add ~12 more, bringing the total to 27+. Without organization, `--help` output becomes overwhelming.

**Fix:** Organize flags into yargs groups:

```
Cherry-pick options:
  --dev, --main, --since, --all-yes, --no-fetch, --ignore-commits

Version options:
  --semantic-versioning, --current-version, --version-file, --version-commit-message

Release options:
  --create-release, --push-release, --draft-pr

CI options:
  --ci, --conflict-strategy, --format, --dependency-strategy

Tracker options:
  --tracker, --ticket-pattern, --tracker-url

Profile options:
  --profile, --save-profile, --list-profiles

Session options:
  --undo

UI options:
  --no-tui, --dry-run
```

## 3. Test strategy

The project has no test framework, no test scripts, and none of the 7 feature docs mention testing. Adding 12+ flags and 6 TUI components without tests makes regression detection impossible.

**Fix:** Before implementing features, add a test foundation:
- Use Node.js built-in `node:test` (zero new dependencies, available since Node 18)
- Add a `"test"` script to package.json
- Each feature's acceptance criteria must include unit tests for:
  - Flag parsing and validation
  - Core logic functions (linkifyTicket, detectDependencies, etc.)
  - Error paths (missing config, invalid regex, etc.)

## 4. Node.js engine compatibility

The CI example uses Node 22, and `ink` v5 may require Node 20.11+. The current `engines` field is `>=20`.

**Fix:** Audit each feature's runtime requirements against Node 20.0.0. If any feature requires Node 22+ APIs, bump `engines` to `>=22`. Otherwise, keep `>=20` and ensure all code paths work.

## 5. Suggested implementation order

```
00. Cross-cutting: "files" field, yargs groups, test foundation
01. Profiles (shared config file — other features depend on this)
05. Tracker integration (uses config file from 01)
06. Commit dependency detection (independent, moderate complexity)
07. Dry-run changelog preview (depends on 06 — flow is: select → dependency check → preview → cherry-pick)
04. CI mode (biggest behavioral change, needs thorough testing)
02. Undo/rollback (independent, requires careful edge case handling)
03. TUI dashboard (biggest scope, most new dependencies, last)
```
