import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'cli.js');

const git = (cwd, ...args) => exec('git', args, { cwd });

async function runCli(args, cwd) {
    try {
        const { stdout, stderr } = await exec('node', [CLI, ...args], { cwd, timeout: 15000 });
        return { output: stdout + stderr, code: 0 };
    } catch (e) {
        return { output: (e.stdout || '') + (e.stderr || ''), code: e.code || 1 };
    }
}

async function configureUser(dir) {
    await git(dir, 'config', 'user.name', 'test');
    await git(dir, 'config', 'user.email', 'test@test.com');
}

// origin/main is at 1.1.0 (a release merged elsewhere); the local checkout is on dev and still sees 1.0.0.
async function makeStaleCheckout() {
    const remote = await mkdtemp(join(tmpdir(), 'cp-version-remote-'));
    const dir = await mkdtemp(join(tmpdir(), 'cp-version-'));
    const other = await mkdtemp(join(tmpdir(), 'cp-version-other-'));
    await git(remote, 'init', '-q', '--bare', '-b', 'main');

    await git(dir, 'init', '-q', '-b', 'main');
    await configureUser(dir);
    await git(dir, 'remote', 'add', 'origin', remote);
    await writeFile(join(dir, 'package.json'), '{ "version": "1.0.0" }\n');
    await git(dir, 'add', 'package.json');
    await git(dir, 'commit', '-qm', 'base');
    await git(dir, 'push', '-q', 'origin', 'main');
    await git(dir, 'checkout', '-qb', 'dev');
    await writeFile(join(dir, 'feature.txt'), 'new\n');
    await git(dir, 'add', 'feature.txt');
    await git(dir, 'commit', '-qm', 'feat: new thing');
    await git(dir, 'push', '-q', 'origin', 'dev');

    await git(other, 'clone', '-q', remote, '.');
    await configureUser(other);
    await writeFile(join(other, 'package.json'), '{ "version": "1.1.0" }\n');
    await git(other, 'commit', '-qam', 'chore(release): bump version to 1.1.0');
    await git(other, 'push', '-q', 'origin', 'main');

    return {
        dir,
        cleanup: () =>
            Promise.all([dir, remote, other].map((d) => rm(d, { recursive: true, force: true }))),
    };
}

describe('current version source', () => {
    it('bumps the version committed on --main, not the stale one in the working tree', async () => {
        const { dir, cleanup } = await makeStaleCheckout();

        const { output, code } = await runCli(
            [
                '--ci',
                '--dev',
                'origin/dev',
                '--main',
                'origin/main',
                '--since',
                '1 year ago',
                '--no-push-release',
            ],
            dir,
        );
        assert.equal(code, 0, `should succeed, got:\n${output}`);

        const { stdout: branch } = await git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
        assert.equal(
            branch.trim(),
            'release/1.2.0',
            `should bump from origin/main"s 1.1.0, got:\n${output}`,
        );
        const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
        assert.equal(pkg.version, '1.2.0');

        await cleanup();
    });
});
