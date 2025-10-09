#!/usr/bin/env node
import chalk from 'chalk'
import { promises as fsPromises } from 'fs'
import inquirer from 'inquirer'
import { spawn } from 'node:child_process'
import simpleGit from 'simple-git'
import yargs from 'yargs'

import { hideBin } from 'yargs/helpers'

const git = simpleGit()

const argv = yargs(hideBin(process.argv))
    .scriptName('cherrypick-interactive')
    .usage('$0 [options]')
    .option('dev', {
        type: 'string',
        default: 'origin/dev',
        describe: 'Source branch (contains commits you want).'
    })
    .option('main', {
        type: 'string',
        default: 'origin/main',
        describe: 'Comparison branch (commits present here will be filtered out).'
    })
    .option('since', {
        type: 'string',
        default: '1 week ago',
        describe: 'Time window passed to git --since (e.g. "2 weeks ago", "1 month ago").'
    })
    .option('no-fetch', {
        type: 'boolean',
        default: false,
        describe: "Skip 'git fetch --prune'."
    })
    .option('all-yes', {
        type: 'boolean',
        default: false,
        describe: 'Non-interactive: cherry-pick ALL missing commits (oldest → newest).'
    })
    .option('dry-run', {
        type: 'boolean',
        default: false,
        describe: 'Print what would be cherry-picked and exit.'
    })
    .option('semantic-versioning', {
        type: 'boolean',
        default: false,
        describe: 'Compute next semantic version from selected (or missing) commits.'
    })
    .option('current-version', {
        type: 'string',
        describe: 'Current version (X.Y.Z). Required when --semantic-versioning is set.'
    })
    .option('create-release', {
        type: 'boolean',
        default: false,
        describe: 'Create a release branch from --main named release/<computed-version> before cherry-picking.'
    })
    .option('push-release', {
        type: 'boolean',
        default: true,
        describe: 'After creating the release branch, push and set upstream (origin).'
    })
    .option('draft-pr', {
        type: 'boolean',
        default: false,
        describe: 'Create the release PR as a draft.'
    })
    .option('version-file', {
        type: 'string',
        describe: 'Path to package.json (read current version; optional replacement for --current-version)'
    })
    .option('version-commit-message', {
        type: 'string',
        default: 'chore(release): bump version to {{version}}',
        describe: 'Commit message template for version bump. Use {{version}} placeholder.'
    })
    .help()
    .alias('h', 'help')
    .alias('v', 'version').argv

const log = (...a) => console.log(...a)
const err = (...a) => console.error(...a)

async function gitRaw(args) {
    const out = await git.raw(args)
    return out.trim()
}

async function getSubjects(branch) {
    const out = await gitRaw(['log', '--no-merges', '--pretty=%s', branch])
    if (!out) {
        return new Set()
    }
    return new Set(out.split('\n').filter(Boolean))
}

async function getDevCommits(branch, since) {
    const out = await gitRaw(['log', '--no-merges', '--since=' + since, '--pretty=%H %s', branch])

    if (!out) {
        return []
    }
    return out.split('\n').map((line) => {
        const firstSpace = line.indexOf(' ')
        const hash = line.slice(0, firstSpace)
        const subject = line.slice(firstSpace + 1)
        return { hash, subject }
    })
}

function filterMissing(devCommits, mainSubjects) {
    return devCommits.filter(({ subject }) => !mainSubjects.has(subject))
}

async function selectCommitsInteractive(missing) {
    const choices = [
        new inquirer.Separator(chalk.gray('── Newest commits ──')),
        ...missing.map(({ hash, subject }, idx) => {
            // display-only trim to avoid accidental leading spaces
            const displaySubject = subject.replace(/^[\s\u00A0]+/, '')
            return {
                name: `${chalk.dim(`(${hash.slice(0, 7)})`)} ${displaySubject}`,
                value: hash,
                short: displaySubject,
                idx // we keep index for oldest→newest ordering later
            }
        }),
        new inquirer.Separator(chalk.gray('── Oldest commits ──'))
    ]

    const { selected } = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'selected',
            message: `Select commits to cherry-pick (${missing.length} missing):`,
            choices,
            pageSize: Math.min(20, Math.max(8, missing.length))
        }
    ])

    return selected
}

async function cherryPickSequential(hashes) {
    for (const hash of hashes) {
        try {
            await gitRaw(['cherry-pick', hash])
            const subject = await gitRaw(['show', '--format=%s', '-s', hash])
            log(`${chalk.green('✓')} cherry-picked ${chalk.dim(`(${hash.slice(0, 7)})`)} ${subject}`)
        } catch (e) {
            err(chalk.red(`✖ Cherry-pick failed on ${hash}`))
            err(chalk.yellow('Resolve conflicts, then run:'))
            err(chalk.yellow('  git add -A && git cherry-pick --continue'))
            err(chalk.yellow('Or abort:'))
            err(chalk.yellow('  git cherry-pick --abort'))
            throw e
        }
    }
}

/**
 * Semantic version bumping
 * @returns {Promise<void>}
 */
function parseVersion(v) {
    const m = String(v || '')
        .trim()
        .match(/^(\d+)\.(\d+)\.(\d+)$/)
    if (!m) {
        throw new Error(`Invalid --current-version "${v}". Expected X.Y.Z`)
    }
    return { major: +m[1], minor: +m[2], patch: +m[3] }
}

function incrementVersion(version, bump) {
    const cur = parseVersion(version)
    if (bump === 'major') {
        return `${cur.major + 1}.0.0`
    }
    if (bump === 'minor') {
        return `${cur.major}.${cur.minor + 1}.0`
    }
    if (bump === 'patch') {
        return `${cur.major}.${cur.minor}.${cur.patch + 1}`
    }
    return `${cur.major}.${cur.minor}.${cur.patch}`
}

function normalizeMessage(msg) {
    // normalize whitespace; keep case-insensitive matching
    return (msg || '').replace(/\r\n/g, '\n')
}

// Returns "major" | "minor" | "patch" | null for a single commit message
function classifySingleCommit(messageBody) {
    const body = normalizeMessage(messageBody)

    // Major
    if (/\bBREAKING[- _]CHANGE(?:\([^)]+\))?\s*:?/i.test(body)) {
        return 'major'
    }

    // Minor
    if (/(^|\n)\s*(\*?\s*)?feat(?:\([^)]+\))?\s*:?/i.test(body)) {
        return 'minor'
    }

    // Patch
    if (/(^|\n)\s*(\*?\s*)?(fix|perf)(?:\([^)]+\))?\s*:?/i.test(body)) {
        return 'patch'
    }

    return null
}

// Given many commits, collapse to a single bump level
function collapseBumps(levels) {
    if (levels.includes('major')) {
        return 'major'
    }
    if (levels.includes('minor')) {
        return 'minor'
    }
    if (levels.includes('patch')) {
        return 'patch'
    }
    return null
}

// Fetch full commit messages (%B) for SHAs and compute bump
async function computeSemanticBumpForCommits(hashes, gitRawFn) {
    if (!hashes.length) {
        return null
    }

    const levels = []
    for (const h of hashes) {
        const msg = await gitRawFn(['show', '--format=%B', '-s', h])
        const level = classifySingleCommit(msg)
        if (level) {
            levels.push(level)
        }
        if (level === 'major') {
            break
        } // early exit if major is found
    }
    return collapseBumps(levels)
}
async function main() {
    try {
        if (!argv['no-fetch']) {
            log(chalk.gray('Fetching remotes (git fetch --prune)...'))
            await git.fetch(['--prune'])
        }

        const currentBranch = (await gitRaw(['rev-parse', '--abbrev-ref', 'HEAD'])) || 'HEAD'

        log(chalk.gray(`Comparing subjects since ${argv.since}`))
        log(chalk.gray(`Dev:  ${argv.dev}`))
        log(chalk.gray(`Main: ${argv.main}`))

        const [devCommits, mainSubjects] = await Promise.all([getDevCommits(argv.dev, argv.since), getSubjects(argv.main)])

        const missing = filterMissing(devCommits, mainSubjects)

        if (missing.length === 0) {
            log(chalk.green('✅ No missing commits found in the selected window.'))
            return
        }

        const indexByHash = new Map(missing.map((c, i) => [c.hash, i])) // 0=newest, larger=older

        let selected
        if (argv['all-yes']) {
            selected = missing.map((m) => m.hash)
        } else {
            selected = await selectCommitsInteractive(missing)
            if (!selected.length) {
                log(chalk.yellow('No commits selected. Exiting.'))
                return
            }
        }

        const bottomToTop = [...selected].sort((a, b) => indexByHash.get(b) - indexByHash.get(a))

        if (argv.dry_run || argv['dry-run']) {
            log(chalk.cyan('\n--dry-run: would cherry-pick (oldest → newest):'))
            for (const h of bottomToTop) {
                const subj = await gitRaw(['show', '--format=%s', '-s', h])
                log(`- ${chalk.dim(`(${h.slice(0, 7)})`)} ${subj}`)
            }
            return
        }

        if (argv['version-file'] && !argv['current-version']) {
            const currentVersionFromPkg = await getPkgVersion(argv['version-file'])
            argv['current-version'] = currentVersionFromPkg
        }

        let computedNextVersion = argv['current-version']
        if (argv['semantic-versioning']) {
            if (!argv['current-version']) {
                throw new Error(' --semantic-versioning requires --current-version X.Y.Z (or pass --version-file)')
            }

            // Bump is based on the commits you are about to apply (selected).
            const bump = await computeSemanticBumpForCommits(bottomToTop, gitRaw)

            computedNextVersion = bump ? incrementVersion(argv['current-version'], bump) : argv['current-version']

            log('')
            log(chalk.magenta('Semantic Versioning'))
            log(
                `  Current: ${chalk.bold(argv['current-version'])}  ` +
                `Detected bump: ${chalk.bold(bump || 'none')}  ` +
                `Next: ${chalk.bold(computedNextVersion)}`
            )
        }

        if (argv['create-release']) {
            if (!argv['semantic-versioning'] || !argv['current-version']) {
                throw new Error(' --create-release requires --semantic-versioning and --current-version X.Y.Z')
            }
            if (!computedNextVersion) {
                throw new Error('Unable to determine release version. Check semantic-versioning inputs.')
            }

            const releaseBranch = `release/${computedNextVersion}`
            await ensureBranchDoesNotExistLocally(releaseBranch)
            const startPoint = argv.main // e.g., 'origin/main' or a local ref

            const changelogBody = await buildChangelogBody({
                version: computedNextVersion,
                hashes: bottomToTop,
                gitRawFn: gitRaw
            })

            await fsPromises.writeFile('RELEASE_CHANGELOG.md', changelogBody, 'utf8')
            log(chalk.gray(`✅ Generated changelog for ${releaseBranch} → RELEASE_CHANGELOG.md`))

            log(chalk.cyan(`\nCreating ${chalk.bold(releaseBranch)} from ${chalk.bold(startPoint)}...`))

            await git.checkoutBranch(releaseBranch, startPoint)

            log(chalk.green(`✓ Ready on ${chalk.bold(releaseBranch)}. Cherry-picking will apply here.`))
        } else {
            // otherwise we stay on the current branch
            log(chalk.bold(`Base branch: ${currentBranch}`))
        }

        log(chalk.cyan(`\nCherry-picking ${bottomToTop.length} commit(s) onto ${currentBranch} (oldest → newest)...\n`))

        await cherryPickSequential(bottomToTop)

        if (argv['push-release']) {
            const baseBranchForGh = stripOrigin(argv.main) // 'origin/main' -> 'main'
            const prTitle = `Release ${computedNextVersion}`
            const releaseBranch = `release/${computedNextVersion}`

            const onBranch = await gitRaw(['rev-parse', '--abbrev-ref', 'HEAD'])
            if (!onBranch.startsWith(releaseBranch)) {
                throw new Error(`Version update should happen on a release branch. Current: ${onBranch}`)
            }

            log(chalk.cyan(`\nUpdating ${argv['version-file']} version → ${computedNextVersion} ...`))
            await setPkgVersion(argv['version-file'], computedNextVersion)
            await git.add([argv['version-file']])
            const msg = argv['version-commit-message'].replace('{{version}}', computedNextVersion)
            await git.raw(['commit', '--no-verify', '-m', msg]);

            log(chalk.green(`✓ package.json updated and committed: ${msg}`))

            await git.push(['-u', 'origin', releaseBranch, '--no-verify'])

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
                'RELEASE_CHANGELOG.md'
            ]
            if (argv['draft-pr']) {
                ghArgs.push('--draft')
            }

            await runGh(ghArgs)
            log(chalk.gray(`Pushed ${onBranch} with version bump.`))
        }

        const finalBranch = argv['create-release']
            ? await gitRaw(['rev-parse', '--abbrev-ref', 'HEAD']) // should be release/*
            : currentBranch

        log(chalk.green(`\n✅ Done on ${finalBranch}`))
    } catch (e) {
        err(chalk.red(`\n❌ Error: ${e.message || e}`))
        process.exit(1)
    }
}

main()

/**
 * Utils
 */

async function ensureBranchDoesNotExistLocally(branchName) {
    const branches = await git.branchLocal()
    if (branches.all.includes(branchName)) {
        throw new Error(
            `Release branch "${branchName}" already exists locally. ` + `Please delete it or choose a different version.`
        )
    }
}

async function buildChangelogBody({ version, hashes, gitRawFn }) {
    const today = new Date().toISOString().slice(0, 10)
    const header = version ? `## Release ${version} — ${today}` : `## Release — ${today}`

    const breakings = []
    const features = []
    const fixes = []
    const others = []

    for (const h of hashes) {
        const msg = await gitRawFn(['show', '--format=%B', '-s', h])
        const level = classifySingleCommit(msg)

        const subject = msg.split(/\r?\n/)[0].trim() // first line of commit message
        const shaDisplay = shortSha(h)

        switch (level) {
            case 'major':
                breakings.push(`${shaDisplay} ${subject}`)
                break
            case 'minor':
                features.push(`${shaDisplay} ${subject}`)
                break
            case 'patch':
                fixes.push(`${shaDisplay} ${subject}`)
                break
            default:
                others.push(`${shaDisplay} ${subject}`)
                break
        }
    }

    const sections = []
    if (breakings.length) {
        sections.push(`### ✨ Breaking Changes\n${breakings.join('\n')}`)
    }
    if (features.length) {
        sections.push(`### ✨ Features\n${features.join('\n')}`)
    }
    if (fixes.length) {
        sections.push(`### 🐛 Fixes\n${fixes.join('\n')}`)
    }
    if (others.length) {
        sections.push(`### 🧹 Others\n${others.join('\n')}`)
    }

    return `${header}\n\n${sections.join('\n\n')}\n`
}
function shortSha(sha) {
    return String(sha).slice(0, 7)
}

function stripOrigin(ref) {
    return ref.startsWith('origin/') ? ref.slice('origin/'.length) : ref
}

async function runGh(args) {
    return new Promise((resolve, reject) => {
        const p = spawn('gh', args, { stdio: 'inherit' })
        p.on('error', reject)
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`gh exited ${code}`))))
    })
}
async function readJson(filePath) {
    const raw = await fsPromises.readFile(filePath, 'utf8')
    return JSON.parse(raw)
}

async function writeJson(filePath, data) {
    const text = JSON.stringify(data, null, 2) + '\n'
    await fsPromises.writeFile(filePath, text, 'utf8')
}

/** Read package.json version; throw if missing */
async function getPkgVersion(pkgPath) {
    const pkg = await readJson(pkgPath)
    const v = pkg && pkg.version
    if (!v) {
        throw new Error(`No "version" field found in ${pkgPath}`)
    }
    return v
}

/** Update package.json version in-place */
async function setPkgVersion(pkgPath, nextVersion) {
    const pkg = await readJson(pkgPath)
    pkg.version = nextVersion
    await writeJson(pkgPath, pkg)
}
