# 🚀 Quick Start

## Simplest Usage

```bash
cherrypick-interactive
```

This will compare `origin/dev` vs `origin/main` for the last week and let you select commits interactively.

## Full Workflow

```bash
cherrypick-interactive \
  --semantic-versioning \
  --version-file ./package.json \
  --create-release \
  --push-release \
  --draft-pr
```

✅ This will:
1. Fetch `origin/dev` and `origin/main`
2. List commits in `dev` missing from `main`
3. Let you select which to cherry-pick (TUI dashboard with diff preview)
4. Detect potential dependencies between commits
5. Show a changelog preview with version bump info
6. Create `release/<next-version>` from `main`
7. Cherry-pick the selected commits (with conflict resolution if needed)
8. Update your `package.json` version and commit it
9. Push the branch and open a **draft PR** on GitHub

## Custom Branches

```bash
cherrypick-interactive --dev origin/develop --main origin/release/v2 --since "2 weeks ago"
```

## With a Profile

Save your flags once, reuse forever:

```bash
# Save
cherrypick-interactive --save-profile release --dev origin/dev --main origin/main --since "1 month ago" --draft-pr

# Use
cherrypick-interactive --profile release
```

See [Profiles](profiles.md) for more details.
