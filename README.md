# 🪶 cherrypick-interactive

### Cherry-pick missing commits from `dev` to `main` — interactively and safely.

---

## 🚧 Motivation

When you maintain long-lived branches like `dev` and `main`, keeping them in sync can get messy.  
Sometimes you rebase, sometimes you cherry-pick, sometimes you merge release branches — and every time, it's easy to lose track of which commits actually made it into production.

**This CLI solves that pain point:**

- It compares two branches (e.g. `origin/dev` vs `origin/main`)
- Lists commits in `dev` that are *not yet* in `main`
- Lets you choose which ones to cherry-pick interactively
- Handles merge conflicts with an interactive resolution wizard
- Preserves original commit messages perfectly (even with squashed commits)
- (Optionally) bumps your semantic version, creates a release branch, updates `package.json`, and opens a GitHub draft PR for review

No manual `git log` diffing. No risky merges. No guesswork.

---

## 🧭 What it does

- 🔍 Finds commits in `dev` not present in `main`
- 🗂️ Lets you select which commits to cherry-pick (or pick all)
- 🪜 Cherry-picks in the correct order (oldest → newest)
- ⚔️ **Interactive conflict resolution wizard** with multiple strategies
- 🎯 **Preserves exact commit messages** from squashed commits
- 🪄 Detects **semantic version bump** (`major`, `minor`, `patch`) from conventional commits
- 🧩 Creates a `release/x.y.z` branch from `main`
- 🧾 Generates a Markdown changelog from commits
- 🧰 Optionally:
    - updates `package.json` version
    - commits and pushes it
    - opens a **GitHub PR** (draft or normal)

---

## 📦 Installation

```bash
npm install -g cherrypick-interactive
```

(You can also run it directly without installing globally using `npx`.)

---

## 🚀 Quick Start

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
3. Let you select which to cherry-pick
4. Compute the next version from commit messages
5. Create `release/<next-version>` from `main`
6. Cherry-pick the selected commits (with conflict resolution if needed)
7. Update your `package.json` version and commit it
8. Push the branch and open a **draft PR** on GitHub

---

## 🧩 Common Use Cases

### 1. Compare branches manually

```bash
cherrypick-interactive
```

Lists commits in `origin/dev` that aren't in `origin/main`, filtered by the last week.

### 2. Cherry-pick all missing commits automatically

```bash
cherrypick-interactive --all-yes
```

### 3. Preview changes without applying them

```bash
cherrypick-interactive --dry-run
```

### 4. Filter commits by pattern

```bash
cherrypick-interactive --ignore-commits "^chore\(deps\)|^ci:"
```

Excludes commits starting with `chore(deps)` or `ci:` from the selection list.

### 5. Ignore certain commits from semantic versioning

```bash
cherrypick-interactive --ignore-semver "bump|dependencies"
```

Treats commits containing "bump" or "dependencies" as chores (no version bump).

---

## ⚙️ Options

| Flag | Description | Default |
|------|--------------|----------|
| `--dev` | Source branch (commits to copy) | `origin/dev` |
| `--main` | Target branch (commits already merged here will be skipped) | `origin/main` |
| `--since` | Git time window filter (e.g. `"2 weeks ago"`) | `1 week ago` |
| `--no-fetch` | Skip `git fetch --prune` | `false` |
| `--all-yes` | Cherry-pick all missing commits without prompt | `false` |
| `--dry-run` | Show what would happen without applying changes | `false` |
| `--semantic-versioning` | Detect semantic version bump from commits | `true` |
| `--current-version` | Current version (if not reading from file) | — |
| `--version-file` | Path to `package.json` (to read & update version) | `./package.json` |
| `--create-release` | Create `release/x.y.z` branch from `main` | `true` |
| `--push-release` | Push release branch to origin | `true` |
| `--draft-pr` | Create the GitHub PR as a draft | `false` |
| `--version-commit-message` | Template for version bump commit | `chore(release): bump version to {{version}}` |
| `--ignore-semver` | Comma-separated regex patterns to ignore for semver | — |
| `--ignore-commits` | Comma-separated regex patterns to exclude commits | — |

---

## 🧠 How Semantic Versioning Works

The tool analyzes commit messages using **Conventional Commits**:

| Prefix | Example | Bump |
|---------|----------|------|
| `BREAKING CHANGE:` | `feat(auth): BREAKING CHANGE: require MFA` | **major** |
| `feat:` | `feat(ui): add dark mode` | **minor** |
| `fix:` / `perf:` | `fix(api): correct pagination offset` | **patch** |

Use `--ignore-semver` to treat certain commits as chores:

```bash
cherrypick-interactive --ignore-semver "^chore\(deps\)|bump|merge"
```

---

## ⚔️ Interactive Conflict Resolution

When cherry-picking encounters conflicts, the tool provides an **interactive wizard**:

### Conflict Resolution Options:

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

### Key Features:

✅ **Preserves original commit messages** — Even when resolving conflicts, the commit message from the original commit in `dev` is maintained exactly  
✅ **Handles squashed commits** — Works correctly with squashed commits that contain multiple changes  
✅ **Resume cherry-picking** — After resolving conflicts, automatically continues with remaining commits

---

## 🧹 Why This Helps

If your team:
- Rebases or cherry-picks from `dev` → `main`
- Uses temporary release branches
- Works with squashed commits
- Needs to handle merge conflicts gracefully
- Tracks semantic versions via commits

…this CLI saves time and reduces errors.  
It automates a tedious, error-prone manual process into a single command that behaves like `yarn upgrade-interactive`, but for Git commits.

**Special features:**
- ✅ Preserves exact commit messages (critical for squashed commits)
- ✅ Interactive conflict resolution without leaving the terminal
- ✅ Smart pattern-based filtering for commits and version detection
- ✅ Automatic changelog generation

---

## 🧰 Requirements

- Node.js ≥ 18
- Git ≥ 2.0
- **GitHub CLI (`gh`)** — *Optional, only required if using `--push-release`*
    - Install from: https://cli.github.com/
    - The tool will check if `gh` is installed and offer to continue without it
- A clean working directory (no uncommitted changes)

---

## 🎯 Best Practices

### 1. Use `--ignore-commits` to filter noise

```bash
cherrypick-interactive --ignore-commits "^ci:|^chore\(deps\):|Merge branch"
```

Exclude CI updates, dependency bumps, and merge commits from selection.

### 2. Use `--ignore-semver` for version accuracy

```bash
cherrypick-interactive --ignore-semver "bump|dependencies|merge"
```

Prevent certain commits from affecting semantic version calculation.

### 3. Always use `--draft-pr` for review

```bash
cherrypick-interactive --draft-pr
```

Creates draft PRs so your team can review before merging.

### 4. Test with `--dry-run` first

```bash
cherrypick-interactive --dry-run
```

See what would happen without making any changes.

---

## 🧾 License

**MIT** — free to use, modify, and distribute.

---

## 🧑‍💻 Contributing

1. Clone the repo
2. Run locally:
   ```bash
   node cli.js --dry-run
   ```
3. Test edge cases before submitting PRs:
    - Squashed commits with conflicts
    - Empty cherry-picks
    - Multiple conflict resolutions
4. Please follow Conventional Commits for your changes.

---

## 🐛 Troubleshooting

### "GitHub CLI (gh) is not installed"
The tool automatically checks for `gh` CLI when using `--push-release`. If not found, you'll be prompted to:
- Install it from https://cli.github.com/ and try again
- Or continue without creating a PR (the release branch will still be pushed)

You can also run without `--push-release` to skip PR creation entirely:
```bash
cherrypick-interactive --create-release --no-push-release
```

### "Cherry-pick has conflicts"
Use the interactive wizard to resolve conflicts file-by-file or in bulk.

### "Commit message changed after conflict resolution"
This issue has been fixed! The tool now preserves the original commit message using `git commit -C <hash>`.

### "Version not detected correctly"
Use `--ignore-semver` to exclude commits that shouldn't affect versioning:
```bash
cherrypick-interactive --ignore-semver "bump|chore\(deps\)"
```

### "Too many commits to review"
Use `--ignore-commits` to filter out noise, or adjust `--since` to a shorter time window:
```bash
cherrypick-interactive --since "3 days ago" --ignore-commits "^ci:|^docs:"
```

---

> Created to make release management simpler and safer for teams who value clean Git history, predictable deployments, and efficient conflict resolution.
