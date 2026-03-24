# Feature: Modular Refactor — Split cli.js into Modules

## Problem

`cli.js` is a 1875-line monolith containing 60+ functions across 10+ logical domains. This makes it:
- Hard to navigate and understand for new contributors
- Impossible to unit test individual functions without running the CLI
- Prone to merge conflicts when multiple features are developed in parallel
- Difficult to identify boundaries between concerns

## Solution

Extract logical groups of functions into separate ES modules under `src/`. Keep `cli.js` as a thin entry point: argument parsing, orchestration, and `main()`.

## Proposed Module Structure

```
cli.js                          → Entry point: yargs config, main() orchestration
src/
├── git.js                      → Git operations (gitRaw, getSubjects, getDevCommits, filterMissing)
├── version.js                  → Semver logic (parseVersion, incrementVersion, classifySingleCommit,
│                                  computeSemanticBumpForCommits, collapseBumps, normalizeMessage)
├── changelog.js                → Changelog generation (buildChangelogBody, shortSha, stripOrigin)
├── conflict.js                 → Conflict resolution (handleCherryPickConflict, conflictsResolutionWizard,
│                                  resolveSingleFileWizard, cherryPickSequential, getConflictedFiles,
│                                  assertNoUnmerged, isCherryPickInProgress, hasStagedChanges,
│                                  isEmptyCherryPick, showConflictsList)
├── profiles.js                 → Profile management (loadProfile, saveProfile, listProfiles,
│                                  applyProfile, loadRcConfig, saveRcConfig, getRcPath)
├── session.js                  → Session/undo (saveSession, loadSession, deleteSession,
│                                  handleUndo, hasRemoteTrackingBranch, getSessionPath)
├── tracker.js                  → Tracker integration (parseTrackerConfig, linkifyTicket,
│                                  loadTrackerFromRc, TRACKER_PRESETS)
├── dependency.js               → Dependency detection (detectDependencies, batchGetChangedFiles)
├── patterns.js                 → Regex pattern helpers (parseSemverIgnore, parseIgnoreCommits,
│                                  matchesAnyPattern, shouldIgnoreCommit)
├── release.js                  → Release branch operations (ensureReleaseBranchFresh, checkGhCli,
│                                  runGh, getPkgVersion, setPkgVersion)
├── io.js                       → File I/O helpers (readJson, writeJson, runBin)
├── errors.js                   → ExitError class
├── tui/                        → TUI components (already extracted)
│   ├── App.js
│   ├── CommitList.js
│   ├── CommitRow.js
│   ├── Header.js
│   ├── KeyBar.js
│   ├── Preview.js
│   ├── html.js
│   └── index.js
└── select.js                   → Commit selection (selectCommitsInteractive,
                                   selectCommitsWithTuiOrFallback, shouldUseTui)
```

## What Stays in cli.js

```
- Shebang (#!/usr/bin/env node)
- Imports from src/ modules
- Yargs argument configuration
- log/err helpers (depend on isJsonFormat)
- ciResult collector
- main() function (orchestration only — no business logic)
- main() call
```

Estimated `cli.js` after refactor: ~400 lines (down from 1875).

## Shared State

Some modules need shared state:
- `argv` — pass as parameter, not global
- `git` (simple-git instance) — create in cli.js, pass to modules
- `gitRaw` — export from `src/git.js`, pass git instance
- `log`/`err` — pass as parameter or create a `src/logger.js`
- `chalk` — each module imports its own

**Rule:** No module reads `argv` directly. All configuration is passed as function parameters. This makes functions testable in isolation.

## Migration Strategy

1. **One module at a time** — extract, import, test, commit
2. **Start with leaf modules** (no internal dependencies): `errors.js`, `io.js`, `patterns.js`
3. **Then mid-level modules**: `git.js`, `version.js`, `tracker.js`
4. **Then complex modules**: `conflict.js`, `profiles.js`, `session.js`
5. **Last**: `changelog.js`, `release.js`, `dependency.js`, `select.js`
6. **After all extractions**: clean up `cli.js` to pure orchestration

## Migration Order

```
1. src/errors.js          (ExitError class — zero dependencies)
2. src/io.js              (readJson, writeJson, runBin — only fs/child_process)
3. src/patterns.js        (regex helpers — only safe-regex2)
4. src/git.js             (git operations — depends on simple-git)
5. src/version.js         (semver logic — depends on semver)
6. src/tracker.js         (tracker — depends on io.js, safe-regex2)
7. src/changelog.js       (changelog — depends on version.js, tracker.js)
8. src/profiles.js        (profiles — depends on io.js, git.js for repo root)
9. src/session.js         (session/undo — depends on io.js, git.js)
10. src/dependency.js     (dependency detection — depends on git.js)
11. src/conflict.js       (conflict resolution — depends on git.js, inquirer)
12. src/release.js        (release ops — depends on git.js, io.js)
13. src/select.js         (commit selection — depends on inquirer, tui/)
```

## Testing Benefits

After refactor, each module can be unit tested independently:

```js
// test/tracker.test.js — no CLI needed
import { linkifyTicket, parseTrackerConfig } from '../src/tracker.js';

it('links ClickUp ticket', () => {
    const config = parseTrackerConfig({ tracker: 'clickup', 'tracker-url': '...' });
    assert.equal(linkifyTicket('#abc123 fix bug', config), '[#abc123](...) fix bug');
});
```

## Acceptance Criteria

- [ ] Each logical domain in its own module under `src/`
- [ ] `cli.js` is orchestration only (~400 lines)
- [ ] No module reads `argv` directly — all config passed as parameters
- [ ] All existing tests pass without modification
- [ ] No new dependencies added
- [ ] Each module is independently importable and testable
- [ ] `"files"` field in package.json already covers `src/` — no change needed
- [ ] No behavioral changes — pure refactor, zero user-facing impact
