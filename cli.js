#!/usr/bin/env node

import chalk from 'chalk'
import inquirer from 'inquirer'
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

        // Prepare bottom→top ordering support
        const indexByHash = new Map(missing.map((c, i) => [c.hash, i])) // 0=newest, larger=older

        let selected
        if (argv.yes) {
            selected = missing.map((m) => m.hash)
        } else {
            selected = await selectCommitsInteractive(missing)
            if (!selected.length) {
                log(chalk.yellow('No commits selected. Exiting.'))
                return
            }
        }

        // Bottom → Top (oldest → newest)
        const bottomToTop = [...selected].sort((a, b) => indexByHash.get(b) - indexByHash.get(a))

        if (argv.dry_run || argv['dry-run']) {
            log(chalk.cyan('\n--dry-run: would cherry-pick (oldest → newest):'))
            for (const h of bottomToTop) {
                const subj = await gitRaw(['show', '--format=%s', '-s', h])
                log(`- ${chalk.dim(`(${h.slice(0, 7)})`)} ${subj}`)
            }
            return
        }

        log(chalk.cyan(`\nCherry-picking ${bottomToTop.length} commit(s) onto ${currentBranch} (oldest → newest)...\n`))
        await cherryPickSequential(bottomToTop)
        log(chalk.green(`\n✅ Done on ${currentBranch}`))
    } catch (e) {
        err(chalk.red(`\n❌ Error: ${e.message || e}`))
        process.exit(1)
    }
}

main()
