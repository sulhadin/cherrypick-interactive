#!/usr/bin/env node
import chalk from "chalk";
import { promises as fsPromises, readFileSync } from "node:fs";
import inquirer from "inquirer";
import { spawn } from "node:child_process";
import simpleGit from "simple-git";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import updateNotifier from "update-notifier";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const git = simpleGit();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

const notifier = updateNotifier({
  pkg,
  updateCheckInterval: 0, // 12h
});

// Only print if an update is available
if (notifier.update) {
  const name = pkg.name || "cherrypick-interactive";
  const current = notifier.update.current;
  const latest = notifier.update.latest;
  console.log("");
  console.log(chalk.yellow("⚠️  A new version is available"));
  console.log(chalk.gray(`  ${name}: ${chalk.red(current)} → ${chalk.green(latest)}`));
  console.log(chalk.cyan(`  Update with: ${chalk.bold(`npm i -g ${name}`)}\n`));
}

const argv = yargs(hideBin(process.argv))
  .scriptName("cherrypick-interactive")
  .usage("$0 [options]")
  .option("dev", {
    type: "string",
    default: "origin/dev",
    describe: "Source branch (contains commits you want).",
  })
  .option("main", {
    type: "string",
    default: "origin/main",
    describe: "Comparison branch (commits present here will be filtered out).",
  })
  .option("since", {
    type: "string",
    default: "1 week ago",
    describe: 'Time window passed to git --since (e.g. "2 weeks ago", "1 month ago").',
  })
  .option("no-fetch", {
    type: "boolean",
    default: false,
    describe: "Skip 'git fetch --prune'.",
  })
  .option("all-yes", {
    type: "boolean",
    default: false,
    describe: "Non-interactive: cherry-pick ALL missing commits (oldest → newest).",
  })
  .option("dry-run", {
    type: "boolean",
    default: false,
    describe: "Print what would be cherry-picked and exit.",
  })
  .option("semantic-versioning", {
    type: "boolean",
    default: true,
    describe: "Compute next semantic version from selected (or missing) commits.",
  })
  .option("current-version", {
    type: "string",
    describe: "Current version (X.Y.Z). Required when --semantic-versioning is set.",
  })
  .option("create-release", {
    type: "boolean",
    default: true,
    describe:
      "Create a release branch from --main named release/<computed-version> before cherry-picking.",
  })
  .option("push-release", {
    type: "boolean",
    default: true,
    describe: "After creating the release branch, push and set upstream (origin).",
  })
  .option("draft-pr", {
    type: "boolean",
    default: false,
    describe: "Create the release PR as a draft.",
  })
  .option("version-file", {
    type: "string",
    default: "./package.json",
    describe:
      "Path to package.json (read current version; optional replacement for --current-version)",
  })
  .option("version-commit-message", {
    type: "string",
    default: "chore(release): bump version to {{version}}",
    describe: "Commit message template for version bump. Use {{version}} placeholder.",
  })
  .wrap(200)
  .help()
  .alias("h", "help")
  .alias("v", "version").argv;

const log = (...a) => console.log(...a);
const err = (...a) => console.error(...a);

async function gitRaw(args) {
  const out = await git.raw(args);
  return out.trim();
}

async function getSubjects(branch) {
  const out = await gitRaw(["log", "--no-merges", "--pretty=%s", branch]);
  if (!out) {
    return new Set();
  }
  return new Set(out.split("\n").filter(Boolean));
}

async function getDevCommits(branch, since) {
  const out = await gitRaw(["log", "--no-merges", "--since=" + since, "--pretty=%H %s", branch]);

  if (!out) {
    return [];
  }
  return out.split("\n").map((line) => {
    const firstSpace = line.indexOf(" ");
    const hash = line.slice(0, firstSpace);
    const subject = line.slice(firstSpace + 1);
    return { hash, subject };
  });
}

function filterMissing(devCommits, mainSubjects) {
  return devCommits.filter(({ subject }) => !mainSubjects.has(subject));
}

async function selectCommitsInteractive(missing) {
  const choices = [
    new inquirer.Separator(chalk.gray("── Newest commits ──")),
    ...missing.map(({ hash, subject }, idx) => {
      // display-only trim to avoid accidental leading spaces
      const displaySubject = subject.replace(/^[\s\u00A0]+/, "");
      return {
        name: `${chalk.dim(`(${hash.slice(0, 7)})`)} ${displaySubject}`,
        value: hash,
        short: displaySubject,
        idx, // we keep index for oldest→newest ordering later
      };
    }),
    new inquirer.Separator(chalk.gray("── Oldest commits ──")),
  ];
  const termHeight = process.stdout.rows || 24; // fallback for non-TTY environments

  const { selected } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selected",
      message: `Select commits to cherry-pick (${missing.length} missing):`,
      choices,
      pageSize: Math.max(10, Math.min(termHeight - 5, missing.length)),
    },
  ]);

  return selected;
}

async function handleCherryPickConflict(hash) {
  while (true) {
    err(chalk.red(`\n✖ Cherry-pick has conflicts on ${hash} (${hash.slice(0, 7)}).`));
    await showConflictsList(); // prints conflicted files (if any)

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "Choose how to proceed:",
        choices: [
          { name: "Skip this commit", value: "skip" },
          { name: "Resolve conflicts now", value: "resolve" },
          { name: "Revoke and cancel (abort entire sequence)", value: "abort" },
        ],
      },
    ]);

    if (action === "skip") {
      await gitRaw(["cherry-pick", "--skip"]);
      log(chalk.yellow(`↷ Skipped commit ${chalk.dim(`(${hash.slice(0, 7)})`)}`));
      return "skipped";
    }

    if (action === "abort") {
      await gitRaw(["cherry-pick", "--abort"]);
      throw new Error("Cherry-pick aborted by user.");
    }

    const res = await conflictsResolutionWizard(hash);
    if (res === "continued") {
      // Successfully continued; this commit is now applied
      return "continued";
    }
  }
}

async function getConflictedFiles() {
  const out = await gitRaw(["diff", "--name-only", "--diff-filter=U"]);
  return out ? out.split("\n").filter(Boolean) : [];
}

async function assertNoUnmerged() {
  const files = await getConflictedFiles();
  return files.length === 0;
}

async function runBin(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: "inherit" });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}`))));
  });
}

async function showConflictsList() {
  const files = await getConflictedFiles();

  if (!files.length) {
    log(chalk.green("No conflicted files reported by git."));
    return [];
  }
  err(chalk.yellow("Conflicted files:"));
  for (const f of files) {
    err("  - " + f);
  }
  return files;
}

async function resolveSingleFileWizard(file) {
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: `How to resolve "${file}"?`,
      choices: [
        { name: "Use ours (current branch)", value: "ours" },
        { name: "Use theirs (picked commit)", value: "theirs" },
        { name: "Open in editor", value: "edit" },
        { name: "Show diff", value: "diff" },
        { name: "Mark resolved (stage file)", value: "stage" },
        { name: "Back", value: "back" },
      ],
    },
  ]);

  try {
    if (action === "ours") {
      await gitRaw(["checkout", "--ours", file]);
      await git.add([file]);
      log(chalk.green(`✓ Applied "ours" and staged: ${file}`));
    } else if (action === "theirs") {
      await gitRaw(["checkout", "--theirs", file]);
      await git.add([file]);
      log(chalk.green(`✓ Applied "theirs" and staged: ${file}`));
    } else if (action === "edit") {
      const editor = process.env.EDITOR || "vi";
      log(chalk.cyan(`Opening ${file} in ${editor}...`));
      await runBin(editor, [file]);
      // user edits and saves, so now they can stage
      const { stageNow } = await inquirer.prompt([
        {
          type: "confirm",
          name: "stageNow",
          message: "File edited. Stage it now?",
          default: true,
        },
      ]);
      if (stageNow) {
        await git.add([file]);
        log(chalk.green(`✓ Staged: ${file}`));
      }
    } else if (action === "diff") {
      const d = await gitRaw(["diff", file]);
      err(chalk.gray(`\n--- diff: ${file} ---\n${d}\n--- end diff ---\n`));
    } else if (action === "stage") {
      await git.add([file]);
      log(chalk.green(`✓ Staged: ${file}`));
    }
  } catch (e) {
    err(chalk.red(`Action failed on ${file}: ${e.message || e}`));
  }

  return action;
}

async function conflictsResolutionWizard(hash) {
  // Loop until no conflicts remain and continue succeeds
  while (true) {
    const files = await showConflictsList();
    if (files.length === 0) {
      try {
        await gitRaw(["cherry-pick", "--continue"]);
        const subject = await gitRaw(["show", "--format=%s", "-s", hash]);
        log(`${chalk.green("✓")} cherry-picked ${chalk.dim(`(${hash.slice(0, 7)})`)} ${subject}`);
        return "continued";
      } catch (e) {
        err(chalk.red("`git cherry-pick --continue` failed:"));
        err(String(e.message || e));
        // fall back to loop
      }
    }

    const { choice } = await inquirer.prompt([
      {
        type: "list",
        name: "choice",
        message: "Select a file to resolve or a global action:",
        pageSize: Math.min(20, Math.max(8, files.length + 5)),
        choices: [
          ...files.map((f) => ({ name: f, value: { type: "file", file: f } })),
          new inquirer.Separator(chalk.gray("─ Actions ─")),
          { name: "Use ours for ALL", value: { type: "all", action: "ours-all" } },
          { name: "Use theirs for ALL", value: { type: "all", action: "theirs-all" } },
          { name: "Stage ALL", value: { type: "all", action: "stage-all" } },
          { name: "Launch mergetool (all)", value: { type: "all", action: "mergetool-all" } },
          {
            name: "Try to continue (run --continue)",
            value: { type: "global", action: "continue" },
          },
          { name: "Back to main conflict menu", value: { type: "global", action: "back" } },
        ],
      },
    ]);

    if (!choice) {
      continue;
    }
    if (choice.type === "file") {
      await resolveSingleFileWizard(choice.file);
      continue;
    }

    if (choice.type === "all") {
      for (const f of files) {
        if (choice.action === "ours-all") {
          await gitRaw(["checkout", "--ours", f]);
          await git.add([f]);
        } else if (choice.action === "theirs-all") {
          await gitRaw(["checkout", "--theirs", f]);
          await git.add([f]);
        } else if (choice.action === "stage-all") {
          await git.add([f]);
        } else if (choice.action === "mergetool-all") {
          await runBin("git", ["mergetool"]);
          break; // mergetool all opens sequentially; re-loop to re-check state
        }
      }
      continue;
    }

    if (choice.type === "global" && choice.action === "continue") {
      if (await assertNoUnmerged()) {
        try {
          await gitRaw(["cherry-pick", "--continue"]);
          const subject = await gitRaw(["show", "--format=%s", "-s", hash]);
          log(`${chalk.green("✓")} cherry-picked ${chalk.dim(`(${hash.slice(0, 7)})`)} ${subject}`);
          return "continued";
        } catch (e) {
          err(chalk.red("`--continue` failed. Resolve remaining issues and try again."));
        }
      } else {
        err(chalk.yellow("There are still unmerged files."));
      }
    }

    if (choice.type === "global" && choice.action === "back") {
      return "back";
    }
  }
}

async function cherryPickSequential(hashes) {
  const result = { applied: 0, skipped: 0 };

  for (const hash of hashes) {
    try {
      await gitRaw(["cherry-pick", hash]);
      const subject = await gitRaw(["show", "--format=%s", "-s", hash]);
      log(`${chalk.green("✓")} cherry-picked ${chalk.dim(`(${hash.slice(0, 7)})`)} ${subject}`);
      result.applied += 1;
    } catch (e) {
      try {
        const action = await handleCherryPickConflict(hash);
        if (action === "skipped") {
          result.skipped += 1;
          continue;
        }
        if (action === "continued") {
          // --continue başarıyla commit oluşturdu
          result.applied += 1;
          continue;
        }
      } catch (abortErr) {
        err(chalk.red(`✖ Cherry-pick aborted on ${hash}`));
        throw abortErr;
      }
    }
  }

  return result;
}

/**
 * Semantic version bumping
 * @returns {Promise<void>}
 */
function parseVersion(v) {
  const m = String(v || "")
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) {
    throw new Error(`Invalid --current-version "${v}". Expected X.Y.Z`);
  }
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function incrementVersion(version, bump) {
  const cur = parseVersion(version);
  if (bump === "major") {
    return `${cur.major + 1}.0.0`;
  }
  if (bump === "minor") {
    return `${cur.major}.${cur.minor + 1}.0`;
  }
  if (bump === "patch") {
    return `${cur.major}.${cur.minor}.${cur.patch + 1}`;
  }
  return `${cur.major}.${cur.minor}.${cur.patch}`;
}

function normalizeMessage(msg) {
  // normalize whitespace; keep case-insensitive matching
  return (msg || "").replace(/\r\n/g, "\n");
}

// Returns "major" | "minor" | "patch" | null for a single commit message
function classifySingleCommit(messageBody) {
  const body = normalizeMessage(messageBody);

  // Major
  if (/\bBREAKING[- _]CHANGE(?:\([^)]+\))?\s*:?/i.test(body)) {
    return "major";
  }

  // Minor
  if (/(^|\n)\s*(\*?\s*)?feat(?:\([^)]+\))?\s*:?/i.test(body)) {
    return "minor";
  }

  // Patch
  if (/(^|\n)\s*(\*?\s*)?(fix|perf)(?:\([^)]+\))?\s*:?/i.test(body)) {
    return "patch";
  }

  return null;
}

// Given many commits, collapse to a single bump level
function collapseBumps(levels) {
  if (levels.includes("major")) {
    return "major";
  }
  if (levels.includes("minor")) {
    return "minor";
  }
  if (levels.includes("patch")) {
    return "patch";
  }
  return null;
}

// Fetch full commit messages (%B) for SHAs and compute bump
async function computeSemanticBumpForCommits(hashes, gitRawFn) {
  if (!hashes.length) {
    return null;
  }

  const levels = [];
  for (const h of hashes) {
    const msg = await gitRawFn(["show", "--format=%B", "-s", h]);
    const level = classifySingleCommit(msg);
    if (level) {
      levels.push(level);
    }
    if (level === "major") {
      break;
    } // early exit if major is found
  }
  return collapseBumps(levels);
}
async function main() {
  try {
    if (!argv["no-fetch"]) {
      log(chalk.gray("Fetching remotes (git fetch --prune)..."));
      await git.fetch(["--prune"]);
    }

    const currentBranch = (await gitRaw(["rev-parse", "--abbrev-ref", "HEAD"])) || "HEAD";

    log(chalk.gray(`Comparing subjects since ${argv.since}`));
    log(chalk.gray(`Dev:  ${argv.dev}`));
    log(chalk.gray(`Main: ${argv.main}`));

    const [devCommits, mainSubjects] = await Promise.all([
      getDevCommits(argv.dev, argv.since),
      getSubjects(argv.main),
    ]);

    const missing = filterMissing(devCommits, mainSubjects);

    if (missing.length === 0) {
      log(chalk.green("✅ No missing commits found in the selected window."));
      return;
    }

    const indexByHash = new Map(missing.map((c, i) => [c.hash, i])); // 0=newest, larger=older

    let selected;
    if (argv["all-yes"]) {
      selected = missing.map((m) => m.hash);
    } else {
      selected = await selectCommitsInteractive(missing);
      if (!selected.length) {
        log(chalk.yellow("No commits selected. Exiting."));
        return;
      }
    }

    const bottomToTop = [...selected].sort((a, b) => indexByHash.get(b) - indexByHash.get(a));

    if (argv.dry_run || argv["dry-run"]) {
      log(chalk.cyan("\n--dry-run: would cherry-pick (oldest → newest):"));
      for (const h of bottomToTop) {
        const subj = await gitRaw(["show", "--format=%s", "-s", h]);
        log(`- ${chalk.dim(`(${h.slice(0, 7)})`)} ${subj}`);
      }
      return;
    }

    if (argv["version-file"] && !argv["current-version"]) {
      const currentVersionFromPkg = await getPkgVersion(argv["version-file"]);
      argv["current-version"] = currentVersionFromPkg;
    }

    let computedNextVersion = argv["current-version"];
    if (argv["semantic-versioning"]) {
      if (!argv["current-version"]) {
        throw new Error(
          " --semantic-versioning requires --current-version X.Y.Z (or pass --version-file)",
        );
      }

      // Bump is based on the commits you are about to apply (selected).
      const bump = await computeSemanticBumpForCommits(bottomToTop, gitRaw);

      computedNextVersion = bump
        ? incrementVersion(argv["current-version"], bump)
        : argv["current-version"];

      log("");
      log(chalk.magenta("Semantic Versioning"));
      log(
        `  Current: ${chalk.bold(argv["current-version"])}  ` +
          `Detected bump: ${chalk.bold(bump || "none")}  ` +
          `Next: ${chalk.bold(computedNextVersion)}`,
      );
    }

    if (argv["create-release"]) {
      if (!argv["semantic-versioning"] || !argv["current-version"]) {
        throw new Error(
          " --create-release requires --semantic-versioning and --current-version X.Y.Z",
        );
      }
      if (!computedNextVersion) {
        throw new Error("Unable to determine release version. Check semantic-versioning inputs.");
      }

      const releaseBranch = `release/${computedNextVersion}`;
      await ensureBranchDoesNotExistLocally(releaseBranch);
      const startPoint = argv.main; // e.g., 'origin/main' or a local ref

      const changelogBody = await buildChangelogBody({
        version: computedNextVersion,
        hashes: bottomToTop,
        gitRawFn: gitRaw,
      });

      await fsPromises.writeFile("RELEASE_CHANGELOG.md", changelogBody, "utf8");
      log(chalk.gray(`✅ Generated changelog for ${releaseBranch} → RELEASE_CHANGELOG.md`));

      log(chalk.cyan(`\nCreating ${chalk.bold(releaseBranch)} from ${chalk.bold(startPoint)}...`));

      await git.checkoutBranch(releaseBranch, startPoint);

      log(chalk.green(`✓ Ready on ${chalk.bold(releaseBranch)}. Cherry-picking will apply here.`));
    } else {
      // otherwise we stay on the current branch
      log(chalk.bold(`Base branch: ${currentBranch}`));
    }

    log(
      chalk.cyan(
        `\nCherry-picking ${bottomToTop.length} commit(s) onto ${currentBranch} (oldest → newest)...\n`,
      ),
    );

    const stats = await cherryPickSequential(bottomToTop);

    log(chalk.gray(`\nSummary → applied: ${stats.applied}, skipped: ${stats.skipped}`));

    if (stats.applied === 0) {
      err(
        chalk.yellow("\nNo commits were cherry-picked (all were skipped or unresolved). Aborting."),
      );
      // Abort any leftover state just in case
      try {
        await gitRaw(["cherry-pick", "--abort"]);
      } catch {}
      throw new Error("Nothing cherry-picked");
    }

    if (argv["push-release"]) {
      const baseBranchForGh = stripOrigin(argv.main); // 'origin/main' -> 'main'
      const prTitle = `Release ${computedNextVersion}`;
      const releaseBranch = `release/${computedNextVersion}`;

      const onBranch = await gitRaw(["rev-parse", "--abbrev-ref", "HEAD"]);
      if (!onBranch.startsWith(releaseBranch)) {
        throw new Error(`Version update should happen on a release branch. Current: ${onBranch}`);
      }

      log(chalk.cyan(`\nUpdating ${argv["version-file"]} version → ${computedNextVersion} ...`));
      await setPkgVersion(argv["version-file"], computedNextVersion);
      await git.add([argv["version-file"]]);
      const msg = argv["version-commit-message"].replace("{{version}}", computedNextVersion);
      await git.raw(["commit", "--no-verify", "-m", msg]);

      log(chalk.green(`✓ package.json updated and committed: ${msg}`));

      await git.push(["-u", "origin", releaseBranch, "--no-verify"]);

      const ghArgs = [
        "pr",
        "create",
        "--base",
        baseBranchForGh,
        "--head",
        releaseBranch,
        "--title",
        prTitle,
        "--body-file",
        "RELEASE_CHANGELOG.md",
      ];
      if (argv["draft-pr"]) {
        ghArgs.push("--draft");
      }

      await runGh(ghArgs);
      log(chalk.gray(`Pushed ${onBranch} with version bump.`));
    }

    const finalBranch = argv["create-release"]
      ? await gitRaw(["rev-parse", "--abbrev-ref", "HEAD"]) // should be release/*
      : currentBranch;

    log(chalk.green(`\n✅ Done on ${finalBranch}`));
  } catch (e) {
    err(chalk.red(`\n❌ Error: ${e.message || e}`));
    process.exit(1);
  }
}

main();

/**
 * Utils
 */

async function ensureBranchDoesNotExistLocally(branchName) {
  const branches = await git.branchLocal();
  if (branches.all.includes(branchName)) {
    throw new Error(
      `Release branch "${branchName}" already exists locally. ` +
        `Please delete it or choose a different version.`,
    );
  }
}

async function buildChangelogBody({ version, hashes, gitRawFn }) {
  const today = new Date().toISOString().slice(0, 10);
  const header = version ? `## Release ${version} — ${today}` : `## Release — ${today}`;

  const breakings = [];
  const features = [];
  const fixes = [];
  const others = [];

  for (const h of hashes) {
    const msg = await gitRawFn(["show", "--format=%B", "-s", h]);
    const level = classifySingleCommit(msg);

    const subject = msg.split(/\r?\n/)[0].trim(); // first line of commit message
    const shaDisplay = shortSha(h);

    switch (level) {
      case "major":
        breakings.push(`${shaDisplay} ${subject}`);
        break;
      case "minor":
        features.push(`${shaDisplay} ${subject}`);
        break;
      case "patch":
        fixes.push(`${shaDisplay} ${subject}`);
        break;
      default:
        others.push(`${shaDisplay} ${subject}`);
        break;
    }
  }

  const sections = [];
  if (breakings.length) {
    sections.push(`### ✨ Breaking Changes\n${breakings.join("\n")}`);
  }
  if (features.length) {
    sections.push(`### ✨ Features\n${features.join("\n")}`);
  }
  if (fixes.length) {
    sections.push(`### 🐛 Fixes\n${fixes.join("\n")}`);
  }
  if (others.length) {
    sections.push(`### 🧹 Others\n${others.join("\n")}`);
  }

  return `${header}\n\n${sections.join("\n\n")}\n`;
}
function shortSha(sha) {
  return String(sha).slice(0, 7);
}

function stripOrigin(ref) {
  return ref.startsWith("origin/") ? ref.slice("origin/".length) : ref;
}

async function runGh(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("gh", args, { stdio: "inherit" });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`gh exited ${code}`))));
  });
}
async function readJson(filePath) {
  const raw = await fsPromises.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  const text = JSON.stringify(data, null, 2) + "\n";
  await fsPromises.writeFile(filePath, text, "utf8");
}

/** Read package.json version; throw if missing */
async function getPkgVersion(pkgPath) {
  const pkg = await readJson(pkgPath);
  const v = pkg && pkg.version;
  if (!v) {
    throw new Error(`No "version" field found in ${pkgPath}`);
  }
  return v;
}

/** Update package.json version in-place */
async function setPkgVersion(pkgPath, nextVersion) {
  const pkg = await readJson(pkgPath);
  pkg.version = nextVersion;
  await writeJson(pkgPath, pkg);
}
