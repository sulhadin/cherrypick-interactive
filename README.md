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
- ⚔️ [**Interactive conflict resolution wizard**](docs/conflict-resolution.md) with multiple strategies
- 🎯 **Preserves exact commit messages** from squashed commits
- 🪄 Detects [**semantic version bump**](docs/semantic-versioning.md) from conventional commits
- 🧩 Creates a `release/x.y.z` branch from `main`
- 🧾 Generates a Markdown changelog from commits
- 🔗 [**Tracker integration**](docs/tracker-integration.md) — links ticket IDs to ClickUp, Jira, Linear, or custom
- 🖥️ Rich [**TUI dashboard**](docs/tui-dashboard.md) with diff preview, search, and keyboard shortcuts
- 🤖 [**CI mode**](docs/ci-mode.md) for fully non-interactive pipeline execution
- ↩️ [**Undo / rollback**](docs/undo-rollback.md) with checkpoint-based session recovery
- 📋 **Changelog preview** before cherry-pick starts
- ⚠️ **Dependency detection** warns when selected commits depend on unselected ones
- 💾 [**Profiles**](docs/profiles.md) to save and reuse CLI flag combinations

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
3. Let you select which to cherry-pick (TUI dashboard with diff preview)
4. Detect potential dependencies between commits
5. Show a changelog preview with version bump info
6. Create `release/<next-version>` from `main`
7. Cherry-pick the selected commits (with conflict resolution if needed)
8. Update your `package.json` version and commit it
9. Push the branch and open a **draft PR** on GitHub

---

## 🧩 Common Use Cases

```bash
# Compare branches (default: origin/dev vs origin/main, last week)
cherrypick-interactive

# Pick everything, no prompts
cherrypick-interactive --all-yes

# Preview without applying
cherrypick-interactive --dry-run

# Filter out noise
cherrypick-interactive --ignore-commits "^chore\(deps\)|^ci:"

# Use a saved profile
cherrypick-interactive --profile hotfix

# Run in CI/CD
cherrypick-interactive --ci --conflict-strategy theirs --format json > result.json

# Link ticket IDs in changelog
cherrypick-interactive --tracker clickup --tracker-url "https://app.clickup.com/t/{{id}}"

# Undo the last session
cherrypick-interactive --undo
```

---

## ⚙️ Options

### Cherry-pick options

| Flag | Description | Default |
|------|--------------|----------|
| `--dev` | Source branch | `origin/dev` |
| `--main` | Target branch | `origin/main` |
| `--since` | Time window (e.g. `"2 weeks ago"`) | `1 week ago` |
| `--no-fetch` | Skip `git fetch --prune` | `false` |
| `--all-yes` | Cherry-pick all without prompt | `false` |
| `--ignore-commits` | Regex patterns to exclude commits | — |

### Version options

| Flag | Description | Default |
|------|--------------|----------|
| `--semantic-versioning` | Auto-detect version bump | `true` |
| `--current-version` | Current X.Y.Z version | — |
| `--version-file` | Path to `package.json` | `./package.json` |
| `--version-commit-message` | Commit message template | `chore(release): bump version to {{version}}` |
| `--ignore-semver` | Regex patterns to ignore for semver | — |

### Release options

| Flag | Description | Default |
|------|--------------|----------|
| `--create-release` | Create release branch | `true` |
| `--push-release` | Push and create PR | `true` |
| `--draft-pr` | Create PR as draft | `false` |

### CI options — [detailed docs](docs/ci-mode.md)

| Flag | Description | Default |
|------|--------------|----------|
| `--ci` | Non-interactive mode | `false` |
| `--conflict-strategy` | `fail`, `ours`, `theirs`, `skip` | `fail` |
| `--format` | `text` or `json` | `text` |
| `--dependency-strategy` | `warn`, `fail`, `ignore` | `warn` |

### Tracker options — [detailed docs](docs/tracker-integration.md)

| Flag | Description | Default |
|------|--------------|----------|
| `--tracker` | Preset: `clickup`, `jira`, `linear` | — |
| `--ticket-pattern` | Custom regex (one capture group) | — |
| `--tracker-url` | URL template with `{{id}}` | — |

### Profile options — [detailed docs](docs/profiles.md)

| Flag | Description | Default |
|------|--------------|----------|
| `--profile` | Load named profile | — |
| `--save-profile` | Save flags as profile | — |
| `--list-profiles` | List profiles and exit | `false` |

### Other options

| Flag | Description | Default |
|------|--------------|----------|
| `--undo` | [Rollback](docs/undo-rollback.md) to pre-cherry-pick state | `false` |
| `--no-tui` | Disable [TUI dashboard](docs/tui-dashboard.md), use simple checkbox | `false` |
| `--dry-run` | Preview without applying | `false` |

---

## 📖 Detailed Documentation

| Topic | Description |
|-------|-------------|
| [⚔️ Conflict Resolution](docs/conflict-resolution.md) | Per-file and bulk conflict resolution, CI strategies |
| [🧠 Semantic Versioning](docs/semantic-versioning.md) | Conventional commits, version sources, ignore patterns |
| [🖥️ TUI Dashboard](docs/tui-dashboard.md) | Keyboard shortcuts, diff preview, search, fallback behavior |
| [💾 Profiles](docs/profiles.md) | Save/load/list profiles, config file format, CI usage |
| [🔗 Tracker Integration](docs/tracker-integration.md) | ClickUp, Jira, Linear presets, custom patterns |
| [🤖 CI Mode](docs/ci-mode.md) | Exit codes, JSON output, GitHub Actions example |
| [↩️ Undo / Rollback](docs/undo-rollback.md) | Checkpoint system, safety checks, limitations |

---

## 🧰 Requirements

- Node.js ≥ 20
- Git ≥ 2.0
- **GitHub CLI (`gh`)** — *Optional, only required if using `--push-release`*

---

## 🎯 Best Practices

1. **Filter noise:** `--ignore-commits "^ci:|^chore\(deps\):|Merge branch"`
2. **Version accuracy:** `--ignore-semver "bump|dependencies|merge"`
3. **Review first:** `--draft-pr`
4. **Test first:** `--dry-run`
5. **Save your workflow:** `--save-profile release --dev origin/dev --main origin/main --since "1 month ago"`

---

## 🧑‍💻 Contributing

1. Clone the repo
2. Install dependencies: `yarn install`
3. Run locally: `node cli.js --dry-run`
4. Run tests: `yarn test`
5. Follow Conventional Commits for your changes.

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| GitHub CLI not installed | Install from https://cli.github.com/ or use `--no-push-release` |
| Cherry-pick has conflicts | Use the [interactive wizard](docs/conflict-resolution.md) or `--conflict-strategy` in CI |
| Version not detected correctly | Use `--ignore-semver "bump\|chore\(deps\)"` |
| Too many commits | Use `--ignore-commits` or `--since "3 days ago"` |
| Want to undo | `cherrypick-interactive --undo` ([details](docs/undo-rollback.md)) |

---

## 🧾 License

**MIT** — free to use, modify, and distribute.

---

> Created to make release management simpler and safer for teams who value clean Git history, predictable deployments, and efficient conflict resolution.
