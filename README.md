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

## 📦 Installation

```bash
npm install -g cherrypick-interactive
```

(You can also run it directly without installing globally using `npx`.)

---

## 🚀 Quick Start

```bash
cherrypick-interactive
```

That's it. Compares `origin/dev` vs `origin/main` for the last week and lets you pick interactively.

For a full release workflow, see the [Quick Start guide](docs/quick-start.md).

---

## 🧭 What it does

- 🔍 Finds commits in `dev` not present in `main`
- 🗂️ Lets you select which commits to cherry-pick (or pick all)
- 🪜 Cherry-picks in the correct order (oldest → newest)
- ⚔️ [**Interactive conflict resolution wizard**](docs/conflict-resolution.md)
- 🎯 **Preserves exact commit messages** from squashed commits
- 🪄 Detects [**semantic version bump**](docs/semantic-versioning.md) from conventional commits
- 🧩 Creates a `release/x.y.z` branch from `main`
- 🧾 Generates a Markdown changelog with [**ticket linking**](docs/tracker-integration.md)
- 🖥️ Rich [**TUI dashboard**](docs/tui-dashboard.md) with diff preview, search, and keyboard shortcuts
- 🤖 [**CI mode**](docs/ci-mode.md) for fully non-interactive pipeline execution
- ↩️ [**Undo / rollback**](docs/undo-rollback.md) with checkpoint-based session recovery
- 💾 [**Profiles**](docs/profiles.md) to save and reuse CLI flag combinations

---

## 📖 Documentation

| Topic | Description |
|-------|-------------|
| [🚀 Quick Start](docs/quick-start.md) | Getting started, full workflow, custom branches |
| [🧩 Common Use Cases](docs/common-use-cases.md) | Filtering, profiles, CI, tracker, undo, and more |
| [⚙️ All Options](docs/options.md) | Complete reference for all CLI flags |
| [⚔️ Conflict Resolution](docs/conflict-resolution.md) | Per-file and bulk resolution, CI strategies |
| [🧠 Semantic Versioning](docs/semantic-versioning.md) | Conventional commits, version sources, ignore patterns |
| [🖥️ TUI Dashboard](docs/tui-dashboard.md) | Keyboard shortcuts, diff preview, search, fallback |
| [💾 Profiles](docs/profiles.md) | Save/load/list profiles, config file, CI usage |
| [🔗 Tracker Integration](docs/tracker-integration.md) | ClickUp, Jira, Linear presets, custom patterns |
| [🤖 CI Mode](docs/ci-mode.md) | Exit codes, JSON output, GitHub Actions example |
| [↩️ Undo / Rollback](docs/undo-rollback.md) | Checkpoint system, safety checks, limitations |

---

## 🧰 Requirements

- Node.js ≥ 20
- Git ≥ 2.0
- **GitHub CLI (`gh`)** — *Optional, only required if using `--push-release`*

---

## 🧑‍💻 Contributing

1. Clone the repo
2. Install dependencies: `yarn install`
3. Run locally: `node cli.js --dry-run`
4. Run tests: `yarn test`
5. Follow Conventional Commits for your changes.

---

## 🧾 License

**MIT** — free to use, modify, and distribute.

---

> Created to make release management simpler and safer for teams who value clean Git history, predictable deployments, and efficient conflict resolution.
