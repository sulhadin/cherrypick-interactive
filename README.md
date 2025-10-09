# cherrypick-interactive

Interactively cherry-pick commits that are in **dev** but not in **main** using a **subject/title** comparison (rebases & cherry-picks tolerated if titles match).

## Install / Run

### Quick run (no install)
```bash
npx cherrypick-interactive --dev origin/dev --main origin/main --since "2 weeks ago"
```
## Global install
```
npm i -g cherrypick-interactive
cherrypick-interactive --dev origin/dev --main origin/main --since "1 week ago"
```
## Options
 - --dev <branch> (default: origin/dev) — source branch
 - --main <branch> (default: origin/main) — comparison branch
 - --since "<window>" (default: 1 week ago) — e.g. "2 weeks ago", "1 month ago"
 - --no-fetch — skip git fetch --prune
 - --all-yes — non-interactive: cherry-pick all missing (oldest → newest)
 - --dry-run — print the planned cherry-picks and exit

## How it works
 1.	Collects commit subjects from --main within the window.
 2.	Collects commit hash + subject from --dev within the window.
 3.	Lists dev commits whose subject is not present in main.
 4.	Interactive multi-select (like yarn upgrade-interactive).
 5.	Cherry-picks in oldest → newest order.

Note: This relies on commit titles being consistent across branches.

## Examples
```
# Compare last 2 weeks and cherry-pick interactively
cherrypick-interactive --since "2 weeks ago"

# Non-interactive, cherry-pick everything missing
cherrypick-interactive --yes

# Just preview what would be cherry-picked
cherrypick-interactive --dry-run
```

## Local test
```
npm install
npm link          # makes the CLI available as `cherrypick-interactive`
cherrypick-interactive --dev origin/dev --main origin/main --since "2 weeks ago"
```

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
...
