# 🪶 cherrypick-interactive

### Cherry-pick missing commits from `dev` to `main` — interactively and safely.

---

## 🚧 Motivation

When you maintain long-lived branches like `dev` and `main`, keeping them in sync can get messy.  
Sometimes you rebase, sometimes you cherry-pick, sometimes you merge release branches — and every time, it’s easy to lose track of which commits actually made it into production.

**This CLI solves that pain point:**

- It compares two branches (e.g. `origin/dev` vs `origin/main`)
- Lists commits in `dev` that are *not yet* in `main`
- Lets you choose which ones to cherry-pick interactively
- (Optionally) bumps your semantic version, creates a release branch, updates `package.json`, and opens a GitHub draft PR for review

No manual `git log` diffing. No risky merges. No guesswork.

---

## 🧭 What it does

- 🔍 Finds commits in `dev` not present in `main`
- 🗂️ Lets you select which commits to cherry-pick (or pick all)
- 🪜 Cherry-picks in the correct order (oldest → newest)
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
cherrypick-interactive   --semantic-versioning   --version-file ./package.json   --create-release   --push-release   --draft-pr
```

✅ This will:
1. Fetch `origin/dev` and `origin/main`
2. List commits in `dev` missing from `main`
3. Let you select which to cherry-pick
4. Compute the next version from commit messages
5. Create `release/<next-version>` from `main`
6. Cherry-pick the selected commits
7. Update your `package.json` version and commit it
8. Push the branch and open a **draft PR** on GitHub

---

## 🧩 Common Use Cases

### 1. Compare branches manually

```bash
cherrypick-interactive
```

Lists commits in `origin/dev` that aren’t in `origin/main`, filtered by the last week.

### 2. Cherry-pick all missing commits automatically

```bash
cherrypick-interactive --all-yes
```

### 3. Preview changes without applying them

```bash
cherrypick-interactive --dry-run
```

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
| `--semantic-versioning` | Detect semantic version bump from commits | `false` |
| `--current-version` | Current version (if not reading from file) | — |
| `--version-file` | Path to `package.json` (to read & update version) | — |
| `--create-release` | Create `release/x.y.z` branch from `main` | `false` |
| `--push-release` | Push release branch to origin | `true` |
| `--draft-pr` | Create the GitHub PR as a draft | `false` |
| `--version-commit-message` | Template for version bump commit | `chore(release): bump version to {{version}}` |

---

## 🧠 How Semantic Versioning Works

The tool analyzes commit messages using **Conventional Commits**:

| Prefix | Example | Bump |
|---------|----------|------|
| `BREAKING CHANGE:` | `feat(auth): BREAKING CHANGE: require MFA` | **major** |
| `feat:` | `feat(ui): add dark mode` | **minor** |
| `fix:` / `perf:` | `fix(api): correct pagination offset` | **patch** |

---

## 🪵 Example Run

```bash
$ cherrypick-interactive --semantic-versioning --version-file ./package.json --create-release --draft-pr

Fetching remotes (git fetch --prune)...
Comparing subjects since 1 week ago
Dev:  origin/dev
Main: origin/main

Select commits to cherry-pick (3 missing):
❯◯ (850aa02) fix: crypto withdrawal payload
 ◯ (2995cea) feat: OTC offer account validation
 ◯ (84fe310) chore: bump dependencies

Semantic Versioning
  Current: 1.20.0  Detected bump: minor  Next: 1.21.0

Creating release/1.21.0 from origin/main...
✓ Ready on release/1.21.0. Cherry-picking will apply here.
✓ package.json updated and committed: chore(release): bump version to 1.21.0
✅ Pull request created for release/1.21.0 → main
```

---

## 🧹 Why This Helps

If your team:
- Rebases or cherry-picks from `dev` → `main`
- Uses temporary release branches
- Tracks semantic versions via commits

…this CLI saves time and reduces errors.  
It automates a tedious, error-prone manual process into a single command that behaves like `yarn upgrade-interactive`, but for Git commits.

---

## 🧰 Requirements

- Node.js ≥ 18
- GitHub CLI (`gh`) installed and authenticated
- A clean working directory (no uncommitted changes)

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
3. Test edge cases before submitting PRs
4. Please follow Conventional Commits for your changes.

---

> Created to make release management simpler and safer for teams who value clean Git history and predictable deployments.
