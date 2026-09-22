---
name: conventional-commits
description: >-
  Write commit messages as Conventional Commits. Use when committing,
  squash-merging, or naming a PR whose title becomes the squash commit.
---
1. Header: `<type>(<optional scope>): <imperative summary>`, lowercase type, no trailing period, under 72 characters.
2. Types: `feat` (new behaviour), `fix` (bug), `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `style`, `revert`. Pick by effect on users, not by files touched.
3. Breaking change: `!` after the type/scope, and a `BREAKING CHANGE: <what breaks and how to migrate>` footer.
4. Body: explain *why* the change was needed and what was rejected; the diff already shows *what*. Wrap at 72.
5. One logical change per commit. If the summary needs "and", split it.
6. Never add `Co-Authored-By` or other AI attribution trailers.
