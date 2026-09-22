---
name: pr-conventions
description: >-
  Compose a PR title and description that follow the org convention. Use when
  opening or rewriting a pull request.
---
1. Derive the ClickUp id from the branch name: `CU-([A-Za-z0-9]+)` first, else the first bare `[0-9][a-z0-9]{6,}` token; `0` if none.
2. Title: `#<id> - <imperative summary>`.
3. Body: follow `.github/pull_request_template.md` when present (`## Changelog`, `## Description`, optional `## Before merge`).
4. End the body with the ClickUp id on its own line.
