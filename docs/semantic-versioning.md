# 🧠 Semantic Versioning

The tool analyzes commit messages using **Conventional Commits** to automatically detect version bumps.

## How It Works

| Prefix | Example | Bump |
|---------|----------|------|
| `BREAKING CHANGE:` | `feat(auth): BREAKING CHANGE: require MFA` | **major** |
| `feat:` | `feat(ui): add dark mode` | **minor** |
| `fix:` / `perf:` | `fix(api): correct pagination offset` | **patch** |

The highest bump wins: if any selected commit is a breaking change, the bump is `major` regardless of other commits.

## Ignoring Commits for Versioning

Use `--ignore-semver` to treat certain commits as chores (no version bump):

```bash
cherrypick-interactive --ignore-semver "^chore\(deps\)|bump|merge"
```

This is useful for dependency bumps, merge commits, or other commits that shouldn't affect the version.

## Releasing Commits That Don't Bump

Only `feat`, `fix`, `perf` and breaking changes bump the version. When every selected commit is something else (`chore`, `refactor`, `docs`, a non-conventional message, ...), there is no next version, so `--create-release` stops before cherry-picking instead of cutting a release under the current version.

Count those commits as a patch:

```bash
cherrypick-interactive --other-bump patch
```

Commits matched by `--ignore-semver` still never bump, so you can exclude merge or release-bump commits while releasing the rest as a patch. To cherry-pick without cutting a release at all, pass `--no-create-release`.

## Version Sources

The current version can be read from:
- `--version-file ./package.json` (default) — reads the `version` field from `--main` (not your working tree, so a stale checkout cannot bump an old version) and updates it on the release branch
- `--current-version 1.2.3` — explicit version, no file read

If the version file doesn't exist, the tool will prompt to create one with version `0.0.0`.

## Version Commit Message

Customize the version bump commit message:

```bash
cherrypick-interactive --version-commit-message "release: v{{version}}"
```

Default: `chore(release): bump version to {{version}}`
