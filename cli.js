#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { promises as fsPromises, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import inquirer from 'inquirer';
import semver from 'semver';
import simpleGit from 'simple-git';
import isSafeRegex from 'safe-regex2';
import updateNotifier from 'update-notifier';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const git = simpleGit();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));

const notifier = updateNotifier({
    pkg,
});

// Only print if a *real* newer version exists
const upd = notifier.update;
if (upd && semver.valid(upd.latest) && semver.valid(pkg.version) && semver.gt(upd.latest, pkg.version)) {
    const name = pkg.name || 'cherrypick-interactive';
    console.log('');
    console.log(chalk.yellow('⚠️  A new version is available'));
    console.log(chalk.gray(`  ${name}: ${chalk.red(pkg.version)} → ${chalk.green(upd.latest)}`));

    // Skip interactive prompt in CI or non-TTY
    if (process.stdout.isTTY && !process.env.CI) {
        const { shouldUpdate } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'shouldUpdate',
                message: `Update to ${upd.latest} now?`,
                default: false,
            },
        ]);
        if (shouldUpdate) {
            const { execSync } = await import('node:child_process');
            console.log(chalk.cyan(`\nUpdating ${name}...`));
            try {
                execSync(`npm i -g ${name}@${upd.latest}`, { stdio: 'inherit' });
                console.log(chalk.green(`✓ Updated to ${upd.latest}. Please re-run the command.\n`));
                process.exit(0);
            } catch {
                console.error(chalk.red('Update failed. Please update manually:'));
                console.error(chalk.cyan(`  npm i -g ${name}\n`));
            }
        }
    } else {
        console.log(chalk.cyan(`  Update with: ${chalk.bold(`npm i -g ${name}`)}\n`));
    }
}

const argv = yargs(hideBin(process.argv))
    .scriptName('cherrypick-interactive')
    .usage('$0 [options]')
    // ── Cherry-pick options ──
    .option('dev', {
        type: 'string',
        default: 'origin/dev',
        describe: 'Source branch (contains commits you want).',
        group: 'Cherry-pick options:',
    })
    .option('main', {
        type: 'string',
        default: 'origin/main',
        describe: 'Comparison branch (commits present here will be filtered out).',
        group: 'Cherry-pick options:',
    })
    .option('since', {
        type: 'string',
        default: '1 week ago',
        describe: 'Time window passed to git --since (e.g. "2 weeks ago", "1 month ago").',
        group: 'Cherry-pick options:',
    })
    .option('no-fetch', {
        type: 'boolean',
        default: false,
        describe: "Skip 'git fetch --prune'.",
        group: 'Cherry-pick options:',
    })
    .option('all-yes', {
        type: 'boolean',
        default: false,
        describe: 'Non-interactive: cherry-pick ALL missing commits (oldest → newest).',
        group: 'Cherry-pick options:',
    })
    .option('ignore-commits', {
        type: 'string',
        describe:
            'Comma-separated regex patterns. If a commit message matches any, it will be omitted from the commit list.',
        group: 'Cherry-pick options:',
    })

    // ── Version options ──
    .option('semantic-versioning', {
        type: 'boolean',
        default: true,
        describe: 'Compute next semantic version from selected (or missing) commits.',
        group: 'Version options:',
    })
    .option('current-version', {
        type: 'string',
        describe: 'Current version (X.Y.Z). Required when --semantic-versioning is set.',
        group: 'Version options:',
    })
    .option('version-file', {
        type: 'string',
        default: './package.json',
        describe: 'Path to package.json (read current version; optional replacement for --current-version)',
        group: 'Version options:',
    })
    .option('version-commit-message', {
        type: 'string',
        default: 'chore(release): bump version to {{version}}',
        describe: 'Commit message template for version bump. Use {{version}} placeholder.',
        group: 'Version options:',
    })
    .option('ignore-semver', {
        type: 'string',
        describe:
            'Comma-separated regex patterns. If a commit message matches any, it will be treated as a chore for semantic versioning.',
        group: 'Version options:',
    })

    // ── Release options ──
    .option('create-release', {
        type: 'boolean',
        default: true,
        describe: 'Create a release branch from --main named release/<computed-version> before cherry-picking.',
        group: 'Release options:',
    })
    .option('push-release', {
        type: 'boolean',
        default: true,
        describe: 'After creating the release branch, push and set upstream (origin).',
        group: 'Release options:',
    })
    .option('draft-pr', {
        type: 'boolean',
        default: false,
        describe: 'Create the release PR as a draft.',
        group: 'Release options:',
    })

    // ── CI options ──
    .option('ci', {
        type: 'boolean',
        default: false,
        describe: 'Enable CI mode (fully non-interactive).',
        group: 'CI options:',
    })
    .option('conflict-strategy', {
        type: 'string',
        default: 'fail',
        describe: 'How to handle conflicts: fail, ours, theirs, skip.',
        choices: ['fail', 'ours', 'theirs', 'skip'],
        group: 'CI options:',
    })
    .option('format', {
        type: 'string',
        default: 'text',
        describe: 'Output format: text or json. JSON goes to stdout, logs to stderr.',
        choices: ['text', 'json'],
        group: 'CI options:',
    })
    .option('dependency-strategy', {
        type: 'string',
        default: 'warn',
        describe: 'How to handle detected dependencies: warn, fail, ignore.',
        choices: ['warn', 'fail', 'ignore'],
        group: 'CI options:',
    })

    // ── Tracker options ──
    .option('tracker', {
        type: 'string',
        describe: 'Built-in preset: clickup, jira, linear. Sets ticket-pattern automatically.',
        choices: ['clickup', 'jira', 'linear'],
        group: 'Tracker options:',
    })
    .option('ticket-pattern', {
        type: 'string',
        describe: 'Custom regex to capture ticket ID from commit message (must have one capture group).',
        group: 'Tracker options:',
    })
    .option('tracker-url', {
        type: 'string',
        describe: 'URL template with {{id}} placeholder (required when using tracker).',
        group: 'Tracker options:',
    })

    // ── Profile options ──
    .option('profile', {
        type: 'string',
        describe: 'Load a named profile from .cherrypickrc.json.',
        group: 'Profile options:',
    })
    .option('save-profile', {
        type: 'string',
        describe: 'Save current CLI flags as a named profile.',
        group: 'Profile options:',
    })
    .option('list-profiles', {
        type: 'boolean',
        default: false,
        describe: 'List available profiles and exit.',
        group: 'Profile options:',
    })

    // ── Session options ──
    .option('undo', {
        type: 'boolean',
        default: false,
        describe: 'Reset current release branch to pre-cherry-pick state.',
        group: 'Session options:',
    })

    // ── UI options ──
    .option('no-tui', {
        type: 'boolean',
        default: false,
        describe: 'Disable TUI dashboard, use simple inquirer checkbox instead.',
        group: 'UI options:',
    })
    .option('dry-run', {
        type: 'boolean',
        default: false,
        describe: 'Print what would be cherry-picked and exit.',
        group: 'UI options:',
    })

    .wrap(Math.min(120, process.stdout.columns || 120))
    .help()
    .alias('h', 'help')
    .alias('v', 'version').argv;

// When --format json, all log output goes to stderr so stdout is clean JSON
const isJsonFormat = process.argv.some((a, i) =>
    (a === '--format' && process.argv[i + 1] === 'json') || a === '--format=json',
);
if (isJsonFormat) {
    // Disable chalk colors for clean stderr in JSON mode
    process.env.NO_COLOR = '1';
}
const log = (...a) => (isJsonFormat ? console.error(...a) : console.log(...a));
const err = (...a) => console.error(...a);

// CI result collector (populated during execution, output at end)
const ciResult = {
    version: { previous: null, next: null, bump: null },
    branch: null,
    commits: { applied: [], skipped: [], total: 0 },
    changelog: null,
    pr: { url: null },
};

class ExitError extends Error {
    constructor(message, exitCode = 1) {
        super(message);
        this.exitCode = exitCode;
    }
}

async function gitRaw(args) {
    const out = await git.raw(args);
    return out.trim();
}

async function getSubjects(branch) {
    const out = await gitRaw(['log', '--no-merges', '--pretty=%s', branch]);
    if (!out) {
        return new Set();
    }
    return new Set(out.split('\n').filter(Boolean));
}

async function getDevCommits(branch, since) {
    const SEP = '|||';
    const out = await gitRaw(['log', '--no-merges', `--since=${since}`, `--pretty=%H${SEP}%ar${SEP}%s`, branch]);

    if (!out) {
        return [];
    }
    return out.split('\n').map((line) => {
        const [hash, date, ...rest] = line.split(SEP);
        const subject = rest.join(SEP);
        return { hash, subject, date: date || '' };
    });
}

function filterMissing(devCommits, mainSubjects) {
    return devCommits.filter(({ subject }) => !mainSubjects.has(subject));
}

async function selectCommitsInteractive(missing) {
    const choices = [
        new inquirer.Separator(chalk.gray('── Newest commits ──')),
        ...missing.map(({ hash, subject }, idx) => {
            // display-only trim to avoid accidental leading spaces
            const displaySubject = subject.replace(/^[\s\u00A0]+/, '');
            return {
                name: `${chalk.dim(`(${hash.slice(0, 7)})`)} ${displaySubject}`,
                value: hash,
                short: displaySubject,
                idx, // we keep index for oldest→newest ordering later
            };
        }),
        new inquirer.Separator(chalk.gray('── Oldest commits ──')),
    ];
    const termHeight = process.stdout.rows || 24; // fallback for non-TTY environments

    const { selected } = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'selected',
            message: `Select commits to cherry-pick (${missing.length} missing):`,
            choices,
            pageSize: Math.max(10, Math.min(termHeight - 5, missing.length)),
        },
    ]);

    return selected;
}

async function handleCherryPickConflict(hash) {
    if (!(await isCherryPickInProgress())) {
        return 'skipped';
    }

    const strategy = argv['conflict-strategy'] || 'fail';

    // CI mode: auto-resolve based on strategy
    if (argv.ci) {
        err(chalk.red(`\n✖ Cherry-pick has conflicts on ${hash} (${shortSha(hash)}).`));

        if (strategy === 'fail') {
            await gitRaw(['cherry-pick', '--abort']);
            throw new ExitError('Conflict detected with --conflict-strategy fail. Aborting.', 1);
        }

        if (strategy === 'skip') {
            await gitRaw(['cherry-pick', '--skip']);
            log(chalk.yellow(`↷ Skipped commit ${chalk.dim(`(${shortSha(hash)})`)}`));
            return 'skipped';
        }

        if (strategy === 'ours') {
            await gitRaw(['checkout', '--ours', '.']);
            await gitRaw(['add', '.']);
            await gitRaw(['cherry-pick', '--continue']);
            log(chalk.yellow(`⚠ Resolved with --ours: ${chalk.dim(`(${shortSha(hash)})`)}`));
            return 'continued';
        }

        if (strategy === 'theirs') {
            await gitRaw(['checkout', '--theirs', '.']);
            await gitRaw(['add', '.']);
            await gitRaw(['cherry-pick', '--continue']);
            log(chalk.yellow(`⚠ Resolved with --theirs: ${chalk.dim(`(${shortSha(hash)})`)}`));
            return 'continued';
        }
    }

    // Interactive mode
    while (true) {
        err(chalk.red(`\n✖ Cherry-pick has conflicts on ${hash} (${shortSha(hash)}).`));
        await showConflictsList(); // prints conflicted files (if any)

        const { action } = await inquirer.prompt([
            {
                type: 'select',
                name: 'action',
                message: 'Choose how to proceed:',
                choices: [
                    { name: 'Skip this commit', value: 'skip' },
                    { name: 'Resolve conflicts now', value: 'resolve' },
                    { name: 'Revoke and cancel (abort entire sequence)', value: 'abort' },
                ],
            },
        ]);

        if (action === 'skip') {
            await gitRaw(['cherry-pick', '--skip']);
            log(chalk.yellow(`↷ Skipped commit ${chalk.dim(`(${shortSha(hash)})`)}`));
            return 'skipped';
        }

        if (action === 'abort') {
            await gitRaw(['cherry-pick', '--abort']);
            throw new Error('Cherry-pick aborted by user.');
        }

        const res = await conflictsResolutionWizard(hash);
        if (res === 'continued' || res === 'skipped') {
            return res;
        }
    }
}

async function getConflictedFiles() {
    const out = await gitRaw(['diff', '--name-only', '--diff-filter=U']);
    return out ? out.split('\n').filter(Boolean) : [];
}

async function assertNoUnmerged() {
    const files = await getConflictedFiles();
    return files.length === 0;
}

async function isCherryPickInProgress() {
    try {
        const head = await gitRaw(['rev-parse', '-q', '--verify', 'CHERRY_PICK_HEAD']);
        return !!head;
    } catch {
        return false;
    }
}

async function hasStagedChanges() {
    const out = await gitRaw(['diff', '--cached', '--name-only']);
    return !!out;
}

async function isEmptyCherryPick() {
    if (!(await isCherryPickInProgress())) return false;
    const noUnmerged = await assertNoUnmerged();
    if (!noUnmerged) return false;
    const anyStaged = await hasStagedChanges();
    return !anyStaged;
}

async function runBin(bin, args) {
    return new Promise((resolve, reject) => {
        const p = spawn(bin, args, { stdio: 'inherit' });
        p.on('error', reject);
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}`))));
    });
}

async function showConflictsList() {
    const files = await getConflictedFiles();

    if (!files.length) {
        log(chalk.green('No conflicted files reported by git.'));
        return [];
    }
    err(chalk.yellow('Conflicted files:'));
    for (const f of files) {
        err(`  - ${f}`);
    }
    return files;
}

async function resolveSingleFileWizard(file) {
    const { action } = await inquirer.prompt([
        {
            type: 'select',
            name: 'action',
            message: `How to resolve "${file}"?`,
            choices: [
                { name: 'Use ours (current branch)', value: 'ours' },
                { name: 'Use theirs (picked commit)', value: 'theirs' },
                { name: 'Open in editor', value: 'edit' },
                { name: 'Show diff', value: 'diff' },
                { name: 'Mark resolved (stage file)', value: 'stage' },
                { name: 'Back', value: 'back' },
            ],
        },
    ]);

    try {
        if (action === 'ours') {
            await gitRaw(['checkout', '--ours', file]);
            await git.add([file]);
            log(chalk.green(`✓ Applied "ours" and staged: ${file}`));
        } else if (action === 'theirs') {
            await gitRaw(['checkout', '--theirs', file]);
            await git.add([file]);
            log(chalk.green(`✓ Applied "theirs" and staged: ${file}`));
        } else if (action === 'edit') {
            const editor = process.env.EDITOR || 'vi';
            log(chalk.cyan(`Opening ${file} in ${editor}...`));
            await runBin(editor, [file]);
            // user edits and saves, so now they can stage
            const { stageNow } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'stageNow',
                    message: 'File edited. Stage it now?',
                    default: true,
                },
            ]);
            if (stageNow) {
                await git.add([file]);
                log(chalk.green(`✓ Staged: ${file}`));
            }
        } else if (action === 'diff') {
            const d = await gitRaw(['diff', file]);
            err(chalk.gray(`\n--- diff: ${file} ---\n${d}\n--- end diff ---\n`));
        } else if (action === 'stage') {
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
            // If there are no conflicted files, either continue or detect empty pick
            if (await isEmptyCherryPick()) {
                err(chalk.yellow('The previous cherry-pick is now empty.'));
                const { emptyAction } = await inquirer.prompt([
                    {
                        type: 'select',
                        name: 'emptyAction',
                        message: 'No staged changes for this pick. Choose next step:',
                        choices: [
                            { name: 'Skip this commit (recommended)', value: 'skip' },
                            { name: 'Create an empty commit', value: 'empty-commit' },
                            { name: 'Back to conflict menu', value: 'back' },
                        ],
                    },
                ]);

                if (emptyAction === 'skip') {
                    await gitRaw(['cherry-pick', '--skip']);
                    log(chalk.yellow(`↷ Skipped empty pick ${chalk.dim(`(${hash.slice(0, 7)})`)}`));
                    return 'skipped';
                }
                if (emptyAction === 'empty-commit') {
                    const fullMessage = await gitRaw(['show', '--format=%B', '-s', hash]);
                    await gitRaw(['commit', '--allow-empty', '-m', fullMessage]);
                    const subject = await gitRaw(['show', '--format=%s', '-s', 'HEAD']);
                    log(`${chalk.green('✓')} (empty) cherry-picked ${chalk.dim(`(${hash.slice(0, 7)})`)} ${subject}`);
                    return 'continued';
                }
                if (emptyAction === 'back') {
                    // ← FIX #1: really go back to the conflict menu (do NOT try --continue)
                    continue;
                }
                // (re-loop)
            } else {
                try {
                    // Use -C to copy the original commit message
                    await gitRaw(['commit', '-C', hash]);
                    const subject = await gitRaw(['show', '--format=%s', '-s', 'HEAD']);
                    log(`${chalk.green('✓')} cherry-picked ${chalk.dim(`(${hash.slice(0, 7)})`)} ${subject}`);
                    return 'continued';
                } catch (e) {
                    err(chalk.red('`git cherry-pick --continue` failed:'));
                    err(String(e.message || e));
                    // fall back to loop
                }
            }
        }

        const { choice } = await inquirer.prompt([
            {
                type: 'select',
                name: 'choice',
                message: 'Select a file to resolve or a global action:',
                pageSize: Math.min(20, Math.max(8, files.length + 5)),
                choices: [
                    ...files.map((f) => ({ name: f, value: { type: 'file', file: f } })),
                    new inquirer.Separator(chalk.gray('─ Actions ─')),
                    { name: 'Use ours for ALL', value: { type: 'all', action: 'ours-all' } },
                    { name: 'Use theirs for ALL', value: { type: 'all', action: 'theirs-all' } },
                    { name: 'Stage ALL', value: { type: 'all', action: 'stage-all' } },
                    { name: 'Launch mergetool (all)', value: { type: 'all', action: 'mergetool-all' } },
                    {
                        name: 'Try to continue (run --continue)',
                        value: { type: 'global', action: 'continue' },
                    },
                    { name: 'Back to main conflict menu', value: { type: 'global', action: 'back' } },
                ],
            },
        ]);

        if (!choice) {
            continue;
        }

        if (choice.type === 'file') {
            await resolveSingleFileWizard(choice.file);
            continue;
        }

        if (choice.type === 'all') {
            for (const f of files) {
                if (choice.action === 'ours-all') {
                    await gitRaw(['checkout', '--ours', f]);
                    await git.add([f]);
                } else if (choice.action === 'theirs-all') {
                    await gitRaw(['checkout', '--theirs', f]);
                    await git.add([f]);
                } else if (choice.action === 'stage-all') {
                    await git.add([f]);
                } else if (choice.action === 'mergetool-all') {
                    await runBin('git', ['mergetool']);
                    break; // mergetool all opens sequentially; re-loop to re-check state
                }
            }
            continue;
        }

        if (choice.type === 'global' && choice.action === 'continue') {
            if (await assertNoUnmerged()) {
                // If nothing is staged, treat as empty pick and prompt
                if (!(await hasStagedChanges())) {
                    err(chalk.yellow('No staged changes found for this cherry-pick.'));
                    const { emptyAction } = await inquirer.prompt([
                        {
                            type: 'select',
                            name: 'emptyAction',
                            message: 'This pick seems empty. Choose next step:',
                            choices: [
                                { name: 'Skip this commit', value: 'skip' },
                                { name: 'Create empty commit', value: 'empty-commit' },
                                { name: 'Back', value: 'back' },
                            ],
                        },
                    ]);

                    if (emptyAction === 'skip') {
                        await gitRaw(['cherry-pick', '--skip']);
                        log(chalk.yellow(`↷ Skipped empty pick ${chalk.dim(`(${hash.slice(0, 7)})`)}`));
                        return 'skipped';
                    }

                    if (emptyAction === 'empty-commit') {
                        const fullMessage = await gitRaw(['show', '--format=%B', '-s', hash]);
                        await gitRaw(['commit', '--allow-empty', '-m', fullMessage]);
                        const subject = await gitRaw(['show', '--format=%s', '-s', 'HEAD']);
                        log(`${chalk.green('✓')} (empty) cherry-picked ${chalk.dim(`(${hash.slice(0, 7)})`)} ${subject}`);
                        return 'continued';
                    }
                    if (emptyAction === 'back') {
                        // ← FIX #2: actually go back to the conflict menu; do NOT try --continue
                        continue;
                    }
                }

                try {
                    // Use -C to copy the original commit message
                    await gitRaw(['commit', '-C', hash]);
                    const subject = await gitRaw(['show', '--format=%s', '-s', 'HEAD']);
                    log(`${chalk.green('✓')} cherry-picked ${chalk.dim(`(${hash.slice(0, 7)})`)} ${subject}`);
                    return 'continued';
                } catch (e) {
                    err(chalk.red('`--continue` failed. Resolve remaining issues and try again.'));
                }
            } else {
                err(chalk.yellow('There are still unmerged files.'));
            }
        }

        if (choice.type === 'global' && choice.action === 'back') {
            return 'back';
        }
    }
}

async function cherryPickSequential(hashes) {
    const result = { applied: 0, skipped: 0, appliedHashes: [], skippedHashes: [] };

    for (const hash of hashes) {
        try {
            await gitRaw(['cherry-pick', hash]);
            const subject = await gitRaw(['show', '--format=%s', '-s', hash]);
            log(`${chalk.green('✓')} cherry-picked ${chalk.dim(`(${shortSha(hash)})`)} ${subject}`);
            result.applied += 1;
            result.appliedHashes.push(hash);
        } catch (e) {
            try {
                const action = await handleCherryPickConflict(hash);
                if (action === 'skipped') {
                    result.skipped += 1;
                    result.skippedHashes.push(hash);
                    continue;
                }
                if (action === 'continued') {
                    result.applied += 1;
                    result.appliedHashes.push(hash);
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
    const m = String(v || '')
        .trim()
        .match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) {
        throw new Error(`Invalid --current-version "${v}". Expected X.Y.Z`);
    }
    return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function incrementVersion(version, bump) {
    const cur = parseVersion(version);
    if (bump === 'major') {
        return `${cur.major + 1}.0.0`;
    }
    if (bump === 'minor') {
        return `${cur.major}.${cur.minor + 1}.0`;
    }
    if (bump === 'patch') {
        return `${cur.major}.${cur.minor}.${cur.patch + 1}`;
    }
    return `${cur.major}.${cur.minor}.${cur.patch}`;
}

function normalizeMessage(msg) {
    // normalize whitespace; keep case-insensitive matching
    return (msg || '').replace(/\r\n/g, '\n');
}

// Returns "major" | "minor" | "patch" | null for a single commit message
function classifySingleCommit(messageBody) {
    const body = normalizeMessage(messageBody);

    // Major
    if (/\bBREAKING[- _]CHANGE(?:\([^)]+\))?\s*:?/i.test(body)) {
        return 'major';
    }

    // Minor
    if (/(^|\n)\s*(\*?\s*)?feat(?:\([^)]+\))?\s*:?/i.test(body)) {
        return 'minor';
    }

    // Patch
    if (/(^|\n)\s*(\*?\s*)?(fix|perf)(?:\([^)]+\))?\s*:?/i.test(body)) {
        return 'patch';
    }

    return null;
}

// Given many commits, collapse to a single bump level
function collapseBumps(levels) {
    if (levels.includes('major')) {
        return 'major';
    }
    if (levels.includes('minor')) {
        return 'minor';
    }
    if (levels.includes('patch')) {
        return 'patch';
    }
    return null;
}

// Fetch full commit messages (%B) for SHAs and compute bump
async function computeSemanticBumpForCommits(hashes, gitRawFn, semverignore) {
    if (!hashes.length) {
        return null;
    }

    const levels = [];
    const semverIgnorePatterns = parseSemverIgnore(semverignore);

    for (const h of hashes) {
        const msg = await gitRawFn(['show', '--format=%B', '-s', h]);
        const subject = msg.split(/\r?\n/)[0].trim();
        let level = classifySingleCommit(msg);

        // 🔹 Apply --semverignore (treat matched commits as chores). Use full message (subject + body).
        if (semverIgnorePatterns.length > 0 && matchesAnyPattern(msg, semverIgnorePatterns)) {
            level = null;
        }

        if (level) {
            levels.push(level);
            if (level === 'major') break; // early exit if major is found
        }
    }

    return collapseBumps(levels);
}

// ── Profile helpers ──

const RC_FILENAME = '.cherrypickrc.json';

/** Allowlist of flags that can be saved in a profile */
const SAVEABLE_FLAGS = new Set([
    'dev', 'main', 'since', 'no-fetch', 'all-yes', 'ignore-commits',
    'semantic-versioning', 'current-version', 'version-file', 'version-commit-message', 'ignore-semver',
    'create-release', 'push-release', 'draft-pr', 'dry-run',
    'tracker', 'ticket-pattern', 'tracker-url',
    'no-tui',
]);

async function getRepoRoot() {
    return (await gitRaw(['rev-parse', '--show-toplevel'])).trim();
}

async function getRcPath() {
    const root = await getRepoRoot();
    return join(root, RC_FILENAME);
}

async function loadRcConfig() {
    const rcPath = await getRcPath();
    return (await readJson(rcPath)) || {};
}

async function saveRcConfig(config) {
    const rcPath = await getRcPath();
    await writeJson(rcPath, config);
}

async function loadProfile(name) {
    const config = await loadRcConfig();
    const profiles = config.profiles || {};
    if (!profiles[name]) {
        throw new Error(`Profile "${name}" not found in ${RC_FILENAME}. Available: ${Object.keys(profiles).join(', ') || '(none)'}`);
    }
    return profiles[name];
}

async function saveProfile(name, flags) {
    const config = await loadRcConfig();
    config.profiles = config.profiles || {};

    if (config.profiles[name]) {
        const { overwrite } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'overwrite',
                message: `Profile "${name}" already exists. Overwrite?`,
                default: false,
            },
        ]);
        if (!overwrite) {
            log(chalk.yellow('Aborted — profile not saved.'));
            return false;
        }
    }

    const filtered = {};
    for (const [key, value] of Object.entries(flags)) {
        if (SAVEABLE_FLAGS.has(key)) {
            filtered[key] = value;
        }
    }

    config.profiles[name] = filtered;
    await saveRcConfig(config);

    log(chalk.green(`\n✓ Profile "${name}" saved to ${RC_FILENAME}:`));
    log(JSON.stringify(filtered, null, 2));
    return true;
}

async function listProfiles() {
    const config = await loadRcConfig();
    const profiles = config.profiles || {};
    const names = Object.keys(profiles);

    if (names.length === 0) {
        log(chalk.yellow(`No profiles found in ${RC_FILENAME}.`));
        return;
    }

    log(chalk.cyan(`\nProfiles in ${RC_FILENAME}:\n`));
    for (const name of names) {
        const flags = profiles[name];
        const summary = Object.entries(flags)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');
        log(`  ${chalk.bold(name)}  ${chalk.dim(summary)}`);
    }
    log('');
}

function applyProfile(profile, currentArgv) {
    for (const [key, value] of Object.entries(profile)) {
        // CLI flags (explicit) override profile values.
        // yargs sets properties from defaults — we detect explicit CLI flags
        // by checking if the key is in the raw process.argv
        const cliFlag = `--${key}`;
        const wasExplicit = process.argv.some((a) => a === cliFlag || a.startsWith(`${cliFlag}=`));
        if (!wasExplicit) {
            currentArgv[key] = value;
            // Also set camelCase version for yargs compatibility
            const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            if (camel !== key) currentArgv[camel] = value;
        }
    }
}

// ── TUI detection ──

const MIN_TUI_ROWS = 15;
const MIN_TUI_COLS = 60;

function shouldUseTui() {
    // Explicit opt-out
    if (argv['no-tui'] || argv.noTui) return false;
    // CI mode or all-yes: no interactive UI needed
    if (argv.ci || argv['all-yes']) return false;
    // Non-interactive terminal
    if (!process.stdout.isTTY) return false;
    // CI environment variable
    if (process.env.CI === 'true' || process.env.CI === '1') return false;
    // Windows: fallback to inquirer
    if (process.platform === 'win32') return false;
    // Terminal too small
    const rows = process.stdout.rows || 24;
    const cols = process.stdout.columns || 80;
    if (rows < MIN_TUI_ROWS || cols < MIN_TUI_COLS) return false;
    return true;
}

async function selectCommitsWithTuiOrFallback(commits) {
    if (shouldUseTui()) {
        const { renderCommitSelector } = await import('./src/tui/index.js');
        return renderCommitSelector(commits, gitRaw, {
            devBranch: argv.dev,
            mainBranch: argv.main,
            since: argv.since,
        });
    }
    return selectCommitsInteractive(commits);
}

// ── Session helpers (undo/rollback) ──

const SESSION_FILENAME = '.cherrypick-session.json';

async function getSessionPath() {
    const root = await getRepoRoot();
    return join(root, SESSION_FILENAME);
}

async function saveSession({ branch, checkpoint, commits }) {
    const sessionPath = await getSessionPath();
    const data = {
        branch,
        checkpoint,
        timestamp: new Date().toISOString(),
        commits,
    };
    await writeJson(sessionPath, data);
}

async function loadSession() {
    const sessionPath = await getSessionPath();
    return readJson(sessionPath);
}

async function deleteSession() {
    const sessionPath = await getSessionPath();
    try {
        await fsPromises.unlink(sessionPath);
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
    }
}

async function hasRemoteTrackingBranch() {
    try {
        await gitRaw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
        return true;
    } catch {
        return false;
    }
}

async function handleUndo() {
    // --undo + --ci is not allowed
    if (argv.ci) {
        throw new ExitError('--undo is interactive-only and cannot be used with --ci. In CI, re-run the pipeline instead.', 1);
    }

    const session = await loadSession();
    if (!session) {
        throw new ExitError(`No active session to undo. (${SESSION_FILENAME} not found)`, 1);
    }

    const currentBranch = await gitRaw(['rev-parse', '--abbrev-ref', 'HEAD']);

    // Warn if on a different branch
    if (currentBranch !== session.branch) {
        log(chalk.yellow(`⚠ You are on "${currentBranch}" but the session was created on "${session.branch}".`));
        const { switchBranch } = await inquirer.prompt([
            { type: 'confirm', name: 'switchBranch', message: `Switch to ${session.branch}?`, default: true },
        ]);
        if (switchBranch) {
            await gitRaw(['checkout', session.branch]);
        } else {
            log(chalk.yellow('Aborted.'));
            return;
        }
    }

    // Validate checkpoint is an ancestor of current HEAD
    try {
        await gitRaw(['merge-base', '--is-ancestor', session.checkpoint, 'HEAD']);
    } catch {
        throw new ExitError(`Checkpoint ${shortSha(session.checkpoint)} is not an ancestor of current HEAD. Session may be corrupt.`, 1);
    }

    // Divergence check: count commits between checkpoint and HEAD
    const revCount = await gitRaw(['rev-list', '--count', `${session.checkpoint}..HEAD`]);
    const commitsSinceCheckpoint = Number.parseInt(revCount.trim(), 10);
    const expectedCommits = session.commits?.length || 0;

    if (commitsSinceCheckpoint > expectedCommits) {
        throw new ExitError(
            `Branch has diverged: ${commitsSinceCheckpoint} commits since checkpoint, but session recorded ${expectedCommits}. Someone else may have pushed. Aborting to prevent data loss.`,
            1,
        );
    }

    // Confirmation
    log(chalk.yellow(`\n⚠ WARNING: This will rewrite remote history for ${session.branch}.`));
    log(chalk.yellow('  Anyone else working on this branch will be affected.\n'));
    log(`  Checkpoint: ${chalk.dim(shortSha(session.checkpoint))}`);
    log(`  Commits to discard: ${commitsSinceCheckpoint}`);
    log(chalk.gray('  This is an all-or-nothing rollback — individual commits cannot be selectively removed.\n'));

    const { proceed } = await inquirer.prompt([
        { type: 'confirm', name: 'proceed', message: 'Continue?', default: false },
    ]);

    if (!proceed) {
        log(chalk.yellow('Aborted.'));
        return;
    }

    // Reset
    await gitRaw(['reset', '--hard', session.checkpoint]);
    log(chalk.green(`✓ Branch reset to ${shortSha(session.checkpoint)}.`));

    // Force push if remote exists
    if (await hasRemoteTrackingBranch()) {
        await gitRaw(['push', '--force-with-lease']);
        log(chalk.green('✓ Force pushed with --force-with-lease.'));
    } else {
        log(chalk.gray('(No remote tracking branch — skipped push)'));
    }

    // Clean up
    await deleteSession();

    // Summary
    log(chalk.green(`\nBranch ${session.branch} has been reset to ${shortSha(session.checkpoint)}. You can now re-select commits.`));

    // Offer to re-open selection
    const { reopen } = await inquirer.prompt([
        { type: 'confirm', name: 'reopen', message: 'Re-open commit selection?', default: true },
    ]);

    return reopen;
}

// ── Dependency detection helpers ──

const MAX_DEPENDENCY_COMMITS = 200;

/**
 * Batch-fetch changed files for a list of commit hashes in a single git call.
 * Returns Map<hash, Set<filePath>>.
 */
async function batchGetChangedFiles(hashes, gitRawFn) {
    if (hashes.length === 0) return new Map();

    const fileMap = new Map();
    for (const h of hashes) fileMap.set(h, new Set());

    // Single batched call: git log --name-only --pretty=format:COMMIT:%H
    const raw = await gitRawFn([
        'log', '--name-only', '--pretty=format:COMMIT:%H',
        '--no-walk', ...hashes,
    ]);

    let currentHash = null;
    for (const line of raw.split('\n')) {
        if (line.startsWith('COMMIT:')) {
            currentHash = line.slice(7);
        } else if (currentHash && line.trim()) {
            const set = fileMap.get(currentHash);
            if (set) set.add(line.trim());
        }
    }

    return fileMap;
}

/**
 * Detect potential dependencies: selected commits that share files with
 * earlier unselected commits.
 *
 * @param {string[]} selected - selected hashes (oldest→newest order)
 * @param {Array<{hash,subject}>} unselected - unselected commit objects
 * @param {Array<{hash,subject}>} allCommits - all commits in original order (newest→oldest)
 * @param {Function} gitRawFn
 * @returns {Array<{selected, dependency, sharedFiles}>}
 */
async function detectDependencies(selected, unselected, allCommits, gitRawFn) {
    const totalCommits = selected.length + unselected.length;
    if (totalCommits > MAX_DEPENDENCY_COMMITS) {
        log(chalk.yellow(`⚠ Skipping dependency detection: ${totalCommits} commits exceeds limit (${MAX_DEPENDENCY_COMMITS}).`));
        return [];
    }

    const allHashes = [...selected, ...unselected.map((c) => c.hash)];
    const fileMap = await batchGetChangedFiles(allHashes, gitRawFn);

    // Build order index: position in original commit list (newest=0, oldest=N)
    const orderIndex = new Map(allCommits.map((c, i) => [c.hash, i]));

    const results = [];
    const selectedSet = new Set(selected);

    for (const selHash of selected) {
        const selFiles = fileMap.get(selHash) || new Set();
        const selOrder = orderIndex.get(selHash) ?? 0;

        for (const unsel of unselected) {
            const unselOrder = orderIndex.get(unsel.hash) ?? 0;
            // Only check unselected commits that are OLDER (higher index = older in newest-first order)
            if (unselOrder <= selOrder) continue;

            const unselFiles = fileMap.get(unsel.hash) || new Set();
            const shared = [...selFiles].filter((f) => unselFiles.has(f));

            if (shared.length > 0) {
                results.push({
                    selected: selHash,
                    dependency: unsel.hash,
                    sharedFiles: shared,
                });
            }
        }
    }

    return results;
}

// ── Tracker helpers ──

const TRACKER_PRESETS = {
    clickup: '#([a-z0-9]+)',
    jira: '([A-Z]+-\\d+)',
    linear: '\\[([A-Z]+-\\d+)\\]',
};

function parseTrackerConfig(currentArgv) {
    let pattern = currentArgv['ticket-pattern'];
    const url = currentArgv['tracker-url'];
    const preset = currentArgv.tracker;

    // Load from .cherrypickrc.json tracker section if not set via CLI
    // (will be populated after loadRcConfig is called in main)

    if (!pattern && !url && !preset) return null;

    if (preset && !pattern) {
        pattern = TRACKER_PRESETS[preset];
        if (!pattern) {
            throw new Error(`Unknown tracker preset "${preset}". Available: ${Object.keys(TRACKER_PRESETS).join(', ')}`);
        }
    }

    if (pattern && !url) {
        throw new Error('--ticket-pattern requires --tracker-url to be set.');
    }
    if (url && !pattern && !preset) {
        throw new Error('--tracker-url requires --ticket-pattern or --tracker to be set.');
    }

    let compiled;
    try {
        compiled = new RegExp(pattern);
    } catch (e) {
        throw new Error(`Invalid --ticket-pattern regex "${pattern}": ${e.message}`);
    }

    if (!isSafeRegex(compiled)) {
        throw new Error(`Pattern rejected — potential catastrophic backtracking: "${pattern}"`);
    }

    // Validate capture group
    const groups = new RegExp(`${pattern}|`).exec('').length - 1;
    if (groups < 1) {
        throw new Error('Pattern must have one capture group for the ticket ID.');
    }

    return { pattern: compiled, url };
}

function linkifyTicket(subject, trackerConfig) {
    if (!trackerConfig) return subject;
    const { pattern, url } = trackerConfig;
    const match = pattern.exec(subject);
    if (!match) return subject;

    const fullMatch = match[0]; // entire matched text (e.g., "#86c8w62wx")
    const capturedId = match[1]; // capture group (e.g., "86c8w62wx")
    const link = url.replace('{{id}}', capturedId);
    return subject.replace(fullMatch, `[${fullMatch}](${link})`);
}

async function loadTrackerFromRc() {
    try {
        const config = await loadRcConfig();
        return config.tracker || null;
    } catch {
        return null;
    }
}

async function main() {
    try {
        // ── Undo handling (must run before anything else) ──
        if (argv.undo) {
            const shouldReopen = await handleUndo();
            if (!shouldReopen) return;
            argv.undo = false;
            // Fall through to normal flow (re-open selection)
        }

        // ── CI mode: implicitly enable --all-yes ──
        if (argv.ci) {
            argv['all-yes'] = true;
            argv.allYes = true;
        }

        // ── Profile handling (must run before any other logic) ──
        if (argv['list-profiles']) {
            await listProfiles();
            return;
        }

        if (argv['save-profile']) {
            const name = argv['save-profile'];
            await saveProfile(name, argv);
            return;
        }

        if (argv['profile']) {
            const profile = await loadProfile(argv['profile']);
            applyProfile(profile, argv);
        }

        // ── Tracker config (merge CLI flags with .cherrypickrc.json) ──
        if (!argv['ticket-pattern'] && !argv['tracker']) {
            const rcTracker = await loadTrackerFromRc();
            if (rcTracker) {
                if (rcTracker['ticket-pattern'] && !argv['ticket-pattern']) argv['ticket-pattern'] = rcTracker['ticket-pattern'];
                if (rcTracker['tracker-url'] && !argv['tracker-url']) argv['tracker-url'] = rcTracker['tracker-url'];
            }
        }

        // Check if gh CLI is installed when push-release is enabled
        if (argv['push-release']) {
            const ghInstalled = await checkGhCli();
            if (!ghInstalled) {
                err(chalk.yellow('\n⚠️  GitHub CLI (gh) is not installed or not in PATH.'));
                err(chalk.gray('   The --push-release flag requires gh CLI to create pull requests.\n'));
                err(chalk.cyan('   Install it from: https://cli.github.com/'));
                err(chalk.cyan('   Or run without --push-release to skip PR creation.\n'));

                const { proceed } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'proceed',
                        message: 'Continue without creating a PR?',
                        default: false,
                    },
                ]);

                if (!proceed) {
                    log(chalk.yellow('Aborted by user.'));
                    return;
                }

                // Disable push-release if user chooses to continue
                argv['push-release'] = false;
            }
        }

        if (!argv['no-fetch']) {
            log(chalk.gray('Fetching remotes (git fetch --prune)...'));
            await git.fetch(['--prune']);
        }

        const currentBranch = (await gitRaw(['rev-parse', '--abbrev-ref', 'HEAD'])) || 'HEAD';

        log(chalk.gray(`Comparing subjects since ${argv.since}`));
        log(chalk.gray(`Dev:  ${argv.dev}`));
        log(chalk.gray(`Main: ${argv.main}`));

        const [devCommits, mainSubjects] = await Promise.all([getDevCommits(argv.dev, argv.since), getSubjects(argv.main)]);

        const missing = filterMissing(devCommits, mainSubjects);

        // Filter out commits matching --ignore-commits patterns
        const ignoreCommitsPatterns = parseIgnoreCommits(argv['ignore-commits']);
        const filteredMissing =
            ignoreCommitsPatterns.length > 0
                ? missing.filter(({ subject }) => !shouldIgnoreCommit(subject, ignoreCommitsPatterns))
                : missing;

        if (filteredMissing.length === 0) {
            log(chalk.green('✅ No missing commits found in the selected window.'));
            if (argv.ci) throw new ExitError('No commits found.', 2);
            return;
        }

        const semverIgnore = argv['ignore-semver'];
        const indexByHash = new Map(filteredMissing.map((c, i) => [c.hash, i])); // 0=newest, larger=older

        let selected;
        if (argv['all-yes']) {
            selected = filteredMissing.map((m) => m.hash);
        } else {
            selected = await selectCommitsWithTuiOrFallback(filteredMissing);
            if (!selected.length) {
                log(chalk.yellow('No commits selected. Exiting.'));
                return;
            }
        }

        let bottomToTop = [...selected].sort((a, b) => indexByHash.get(b) - indexByHash.get(a));

        // ── Dependency detection ──
        const depStrategy = argv['dependency-strategy'] || 'warn';
        if (depStrategy !== 'ignore') {
            const selectedSet = new Set(selected);
            const unselected = filteredMissing.filter((c) => !selectedSet.has(c.hash));

            if (unselected.length > 0) {
                const deps = await detectDependencies(bottomToTop, unselected, filteredMissing, gitRaw);

                if (deps.length > 0) {
                    // Show warnings
                    log(chalk.yellow('\n⚠ Potential dependency detected (file-level heuristic — may be a false positive):\n'));
                    for (const dep of deps) {
                        const selSubj = await gitRaw(['show', '--format=%s', '-s', dep.selected]);
                        const depSubj = await gitRaw(['show', '--format=%s', '-s', dep.dependency]);
                        log(`  Selected:    ${chalk.dim(`(${shortSha(dep.selected)})`)} ${selSubj}`);
                        log(`  Depends on:  ${chalk.dim(`(${shortSha(dep.dependency)})`)} ${depSubj}  ${chalk.red('[NOT SELECTED]')}`);
                        log(`  Shared files: ${chalk.dim(dep.sharedFiles.join(', '))}\n`);
                    }

                    if (argv.ci) {
                        if (depStrategy === 'fail') {
                            throw new ExitError('Dependency check failed (--dependency-strategy fail). Aborting.', 4);
                        }
                        // warn: already logged above, continue
                    } else {
                        const missingHashes = [...new Set(deps.map((d) => d.dependency))];
                        const { choice } = await inquirer.prompt([
                            {
                                type: 'list',
                                name: 'choice',
                                message: 'How would you like to proceed?',
                                choices: [
                                    { name: 'Include missing commits and continue', value: 'include' },
                                    { name: 'Go back to selection', value: 'back' },
                                    { name: 'Continue anyway (may cause conflicts)', value: 'continue' },
                                ],
                            },
                        ]);

                        if (choice === 'include') {
                            log(chalk.cyan('\nCommits to be added:'));
                            for (const h of missingHashes) {
                                const subj = await gitRaw(['show', '--format=%s', '-s', h]);
                                log(`  + ${chalk.dim(`(${shortSha(h)})`)} ${subj}`);
                            }
                            const { confirm } = await inquirer.prompt([
                                { type: 'confirm', name: 'confirm', message: 'Add these commits?', default: true },
                            ]);
                            if (confirm) {
                                selected = [...selected, ...missingHashes];
                                bottomToTop = [...selected].sort((a, b) => indexByHash.get(b) - indexByHash.get(a));
                                log(chalk.green(`✓ ${missingHashes.length} commit(s) added. Total: ${selected.length}`));
                            }
                        } else if (choice === 'back') {
                            selected = await selectCommitsWithTuiOrFallback(filteredMissing);
                            if (!selected.length) {
                                log(chalk.yellow('No commits selected. Exiting.'));
                                return;
                            }
                            bottomToTop = [...selected].sort((a, b) => indexByHash.get(b) - indexByHash.get(a));
                        }
                        // 'continue': proceed as-is
                    }
                }
            }
        }

        // ── Version computation (moved before preview) ──
        if (argv['version-file'] && !argv['current-version']) {
            const currentVersionFromPkg = await getPkgVersion(argv['version-file']);
            argv['current-version'] = currentVersionFromPkg;
        }

        let computedNextVersion = argv['current-version'];
        let detectedBump = null;
        if (argv['semantic-versioning']) {
            if (!argv['current-version']) {
                throw new Error(' --semantic-versioning requires --current-version X.Y.Z (or pass --version-file)');
            }

            detectedBump = await computeSemanticBumpForCommits(bottomToTop, gitRaw, semverIgnore);
            computedNextVersion = detectedBump ? incrementVersion(argv['current-version'], detectedBump) : argv['current-version'];

            log('');
            log(chalk.magenta('Semantic Versioning'));
            log(
                `  Current: ${chalk.bold(argv['current-version'])}  ` +
                `Detected bump: ${chalk.bold(detectedBump || 'none')}  ` +
                `Next: ${chalk.bold(computedNextVersion)}`,
            );
        }

        // ── Changelog preview ──
        let trackerConfig = null;
        try {
            trackerConfig = parseTrackerConfig(argv);
        } catch (e) {
            err(chalk.red(e.message));
        }

        const previewChangelog = await buildChangelogBody({
            version: computedNextVersion,
            hashes: bottomToTop,
            gitRawFn: gitRaw,
            semverIgnore,
            trackerConfig,
        });

        const isDryRun = argv.dry_run || argv['dry-run'];

        // Show preview
        log(chalk.cyan('\n── Changelog Preview ──────────────────'));
        if (computedNextVersion && argv['current-version'] && computedNextVersion !== argv['current-version']) {
            log(chalk.gray(`Previous: ${argv['current-version']} → Next: ${computedNextVersion} (${detectedBump} bump)`));
        }
        log('');
        log(previewChangelog);
        log(chalk.gray(`${bottomToTop.length} commits selected`));
        log(chalk.cyan('──────────────────────────────────────'));

        if (isDryRun) {
            log(chalk.cyan('\n--dry-run: would cherry-pick (oldest → newest):'));
            for (const h of bottomToTop) {
                const subj = await gitRaw(['show', '--format=%s', '-s', h]);
                log(`- ${chalk.dim(`(${h.slice(0, 7)})`)} ${subj}`);
            }
            return;
        }

        // Confirmation (skip in CI)
        if (!argv.ci && !argv['all-yes']) {
            const { proceed } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'proceed',
                    message: 'Proceed with cherry-pick?',
                    default: false,
                },
            ]);
            if (!proceed) {
                log(chalk.yellow('Aborted by user.'));
                return;
            }
        }

        if (argv.ci) {
            err(chalk.gray('[CI] Changelog preview logged. Proceeding automatically.'));
        }

        if (argv['create-release']) {
            if (!argv['semantic-versioning'] || !argv['current-version']) {
                throw new Error(' --create-release requires --semantic-versioning and --current-version X.Y.Z');
            }
            if (!computedNextVersion) {
                throw new Error('Unable to determine release version. Check semantic-versioning inputs.');
            }

            const releaseBranch = `release/${computedNextVersion}`;
            const startPoint = argv.main; // e.g., 'origin/main' or a local ref
            await ensureReleaseBranchFresh(releaseBranch, startPoint);

            await fsPromises.writeFile('RELEASE_CHANGELOG.md', previewChangelog, 'utf8');
            await gitRaw(['reset', 'RELEASE_CHANGELOG.md']);
            log(chalk.gray(`✅ Generated changelog for ${releaseBranch} → RELEASE_CHANGELOG.md`));

            log(chalk.cyan(`\nCreating ${chalk.bold(releaseBranch)} from ${chalk.bold(startPoint)}...`));

            await git.checkoutBranch(releaseBranch, startPoint);

            log(chalk.green(`✓ Ready on ${chalk.bold(releaseBranch)}. Cherry-picking will apply here.`));
        } else {
            // otherwise we stay on the current branch
            log(chalk.bold(`Base branch: ${currentBranch}`));
        }

        // ── Save session checkpoint before cherry-pick ──
        const checkpointHash = await gitRaw(['rev-parse', 'HEAD']);
        const sessionBranch = await gitRaw(['rev-parse', '--abbrev-ref', 'HEAD']);
        await saveSession({
            branch: sessionBranch,
            checkpoint: checkpointHash,
            commits: bottomToTop,
        });

        log(chalk.cyan(`\nCherry-picking ${bottomToTop.length} commit(s) onto ${currentBranch} (oldest → newest)...\n`));

        const stats = await cherryPickSequential(bottomToTop);

        log(chalk.gray(`\nSummary → applied: ${stats.applied}, skipped: ${stats.skipped}`));

        // Populate CI result with cherry-pick stats
        ciResult.commits.applied = stats.appliedHashes;
        ciResult.commits.skipped = stats.skippedHashes;

        if (stats.applied === 0) {
            err(chalk.yellow('\nNo commits were cherry-picked (all were skipped or unresolved). Aborting.'));
            // Abort any leftover state just in case
            try {
                await gitRaw(['cherry-pick', '--abort']);
            } catch {}
            throw new Error('Nothing cherry-picked');
        }

        if (argv['push-release']) {
            const baseBranchForGh = stripOrigin(argv.main); // 'origin/main' -> 'main'
            const prTitle = `Release ${computedNextVersion}`;
            const releaseBranch = `release/${computedNextVersion}`;

            const onBranch = await gitRaw(['rev-parse', '--abbrev-ref', 'HEAD']);
            if (!onBranch.startsWith(releaseBranch)) {
                throw new Error(`Version update should happen on a release branch. Current: ${onBranch}`);
            }

            log(chalk.cyan(`\nUpdating ${argv['version-file']} version → ${computedNextVersion} ...`));
            await setPkgVersion(argv['version-file'], computedNextVersion);
            await git.add([argv['version-file']]);
            const msg = argv['version-commit-message'].replace('{{version}}', computedNextVersion);
            await git.raw(['commit', '--no-verify', '-m', msg]);

            log(chalk.green(`✓ package.json updated and committed: ${msg}`));

            await git.push(['-u', 'origin', releaseBranch, '--no-verify']);

            const ghArgs = [
                'pr',
                'create',
                '--base',
                baseBranchForGh,
                '--head',
                releaseBranch,
                '--title',
                prTitle,
                '--body-file',
                'RELEASE_CHANGELOG.md',
            ];
            if (argv['draft-pr']) {
                ghArgs.push('--draft');
            }

            await runGh(ghArgs);
            log(chalk.gray(`Pushed ${onBranch} with version bump.`));
        }

        const finalBranch = argv['create-release']
            ? await gitRaw(['rev-parse', '--abbrev-ref', 'HEAD']) // should be release/*
            : currentBranch;

        // ── Populate CI result ──
        ciResult.version.previous = argv['current-version'] || null;
        ciResult.version.next = computedNextVersion || null;
        ciResult.version.bump = detectedBump || null;
        ciResult.branch = finalBranch;
        ciResult.commits.total = bottomToTop.length;
        ciResult.changelog = previewChangelog;

        // ── JSON output (--format json) ──
        if (isJsonFormat) {
            console.log(JSON.stringify(ciResult, null, 2));
        }

        // Clean up session on success
        await deleteSession();

        log(chalk.green(`\n✅ Done on ${finalBranch}`));
    } catch (e) {
        err(chalk.red(`\n❌ Error: ${e.message || e}`));

        // Clean up session on error too
        try { await deleteSession(); } catch { /* ignore cleanup errors */ }

        // Output partial JSON result on error
        if (isJsonFormat) {
            console.log(JSON.stringify(ciResult, null, 2));
        }

        const code = e instanceof ExitError ? e.exitCode : (argv.ci ? 3 : 1);
        process.exit(code);
    }
}

main();

/**
 * Utils
 */

async function ensureReleaseBranchFresh(branchName, startPoint) {
    const branches = await git.branchLocal();
    const localExists = branches.all.includes(branchName);
    const remoteRef = await gitRaw(['ls-remote', '--heads', 'origin', branchName]);
    const remoteExists = Boolean(remoteRef);

    if (!localExists && !remoteExists) {
        return;
    }

    const { action } = await inquirer.prompt([
        {
            type: 'select',
            name: 'action',
            message: `Release branch "${branchName}" already exists${localExists ? ' locally' : ''}${
                remoteExists ? ' on origin' : ''
            }. How do you want to proceed? (override, abort)`,
            choices: [
                { name: 'Override (delete existing branch and recreate)', value: 'override' },
                { name: 'Abort', value: 'abort' },
            ],
        },
    ]);

    if (action === 'abort') {
        throw new Error(`Aborted: release branch "${branchName}" already exists.`);
    }

    // Ensure we are not on the branch before deleting local copy
    if (localExists) {
        if (branches.current === branchName) {
            const target = startPoint || 'HEAD';
            log(chalk.gray(`Switching to ${target} before deleting ${branchName}...`));
            await gitRaw(['checkout', target]);
        }
        await gitRaw(['branch', '-D', branchName]);
        log(chalk.yellow(`↷ Deleted existing local branch ${branchName}`));
    }

    if (remoteExists) {
        try {
            await gitRaw(['push', 'origin', '--delete', branchName]);
            log(chalk.yellow(`↷ Deleted existing remote branch origin/${branchName}`));
        } catch (e) {
            err(chalk.red(`Failed to delete remote branch origin/${branchName}: ${e.message || e}`));
            throw e;
        }
    }
}

async function buildChangelogBody({ version, hashes, gitRawFn, semverIgnore, trackerConfig }) {
    const today = new Date().toISOString().slice(0, 10);
    const header = version ? `## Release ${version} — ${today}` : `## Release — ${today}`;
    const semverIgnorePatterns = parseSemverIgnore(semverIgnore);

    const breakings = [];
    const features = [];
    const fixes = [];
    const others = [];

    let linkedCount = 0;

    for (const h of hashes) {
        const msg = await gitRawFn(['show', '--format=%B', '-s', h]);

        const rawSubject = msg.split(/\r?\n/)[0].trim(); // first line of commit message
        const subject = linkifyTicket(rawSubject, trackerConfig);
        if (trackerConfig && subject !== rawSubject) linkedCount++;
        const shaDisplay = shortSha(h);

        // normal classification first
        let level = classifySingleCommit(msg);

        // ⬇ Apply ignore-semver logic
        const matched = matchesAnyPattern(msg, semverIgnorePatterns); // evaluate against full message
        if (matched) {
            level = null; // drop it into "Other"
        }

        switch (level) {
            case 'major':
                breakings.push(`${shaDisplay} ${subject}`);
                break;
            case 'minor':
                features.push(`${shaDisplay} ${subject}`);
                break;
            case 'patch':
                fixes.push(`${shaDisplay} ${subject}`);
                break;
            default:
                others.push(`${shaDisplay} ${subject}`);
                break;
        }
    }

    if (trackerConfig) {
        log(chalk.gray(`Tracker: ${linkedCount} of ${hashes.length} commits had ticket IDs linked.`));
    }

    const sections = [];
    if (breakings.length) {
        sections.push(`### ✨ Breaking Changes\n${breakings.join('\n')}`);
    }
    if (features.length) {
        sections.push(`### ✨ Features\n${features.join('\n')}`);
    }
    if (fixes.length) {
        sections.push(`### 🐛 Fixes\n${fixes.join('\n')}`);
    }
    if (others.length) {
        sections.push(`### 🧹 Others\n${others.join('\n')}`);
    }

    return `${header}\n\n${sections.join('\n\n')}\n`;
}
function shortSha(sha) {
    return String(sha).slice(0, 7);
}

function stripOrigin(ref) {
    return ref.startsWith('origin/') ? ref.slice('origin/'.length) : ref;
}

async function checkGhCli() {
    return new Promise((resolve) => {
        const p = spawn('gh', ['--version'], { stdio: 'pipe' });
        p.on('error', () => resolve(false));
        p.on('close', (code) => resolve(code === 0));
    });
}

async function runGh(args) {
    return new Promise((resolve, reject) => {
        const p = spawn('gh', args, { stdio: 'inherit' });
        p.on('error', reject);
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`gh exited ${code}`))));
    });
}
async function readJson(filePath) {
    try {
        const raw = await fsPromises.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
    }
}

async function writeJson(filePath, data) {
    const text = `${JSON.stringify(data, null, 2)}\n`;
    await fsPromises.writeFile(filePath, text, 'utf8');
}

/** Read package.json version; prompt to create file with 0.0.0 if it does not exist */
async function getPkgVersion(pkgPath) {
    let pkg = await readJson(pkgPath);
    if (!pkg) {
        log(chalk.yellow(`⚠ ${pkgPath} not found.`));
        const { shouldCreate } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'shouldCreate',
                message: `Create ${pkgPath} with version 0.0.0?`,
                default: true,
            },
        ]);
        if (!shouldCreate) {
            throw new Error(`Version file ${pkgPath} does not exist. Aborting.`);
        }
        pkg = { "version": "0.0.0" };
        await writeJson(pkgPath, pkg);
        log(chalk.green(`✓ Created ${pkgPath} with version 0.0.0`));
    }
    const v = pkg.version;
    if (!v) {
        throw new Error(`No "version" field found in ${pkgPath}`);
    }
    return v;
}

/** Update package.json version in-place; create file if it does not exist */
async function setPkgVersion(pkgPath, nextVersion) {
    let pkg = await readJson(pkgPath);
    if (!pkg) {
        pkg = {};
    }
    pkg.version = nextVersion;
    await writeJson(pkgPath, pkg);
}

function parseSemverIgnore(argvValue) {
    if (!argvValue) return [];
    return argvValue
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((pattern) => {
            try {
                const rx = new RegExp(pattern, 'i');
                if (!isSafeRegex(rx)) {
                    err(chalk.red(`Rejected --ignore-semver pattern "${pattern}" — potential catastrophic backtracking`));
                    return null;
                }
                return rx;
            } catch (e) {
                err(chalk.red(`Invalid --ignore-semver pattern "${pattern}": ${e.message || e}`));
                return null;
            }
        })
        .filter(Boolean);
}

function matchesAnyPattern(text, patterns) {
    if (!patterns || patterns.length === 0) return false;

    const matched = patterns.find((rx) => rx.test(text));
    if (matched) {
        log(chalk.cyan(`↷ Semver ignored (pattern: /${matched.source}/i):  ${chalk.dim(`(${text.split('\n')[0]})`)}`));
        return true;
    }

    return false;
}

function parseIgnoreCommits(argvValue) {
    if (!argvValue) return [];
    return argvValue
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((pattern) => {
            try {
                const rx = new RegExp(pattern, 'i');
                if (!isSafeRegex(rx)) {
                    err(chalk.red(`Rejected --ignore-commits pattern "${pattern}" — potential catastrophic backtracking`));
                    return null;
                }
                return rx;
            } catch (e) {
                err(chalk.red(`Invalid --ignore-commits pattern "${pattern}": ${e.message || e}`));
                return null;
            }
        })
        .filter(Boolean);
}

function shouldIgnoreCommit(subject, patterns) {
    if (!patterns || patterns.length === 0) return false;

    const matched = patterns.find((rx) => rx.test(subject));
    if (matched) {
        log(chalk.gray(`↷ Ignoring commit (pattern: /${matched.source}/i): ${chalk.dim(subject.slice(0, 80))}`));
        return true;
    }

    return false;
}
