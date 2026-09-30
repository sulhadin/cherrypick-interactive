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
        return { output: (e.stdout || '') + (e.stderr || ''), code: e.code || 1, killed: e.killed };
    }
}

const NON_BUMPING = ['chore(deps): bump chalk', 'refactor: split the prompt helpers'];

// origin/main is at 1.0.0; by default origin/dev adds only commits that are not feat, fix, perf or breaking.
async function makeRepo({ existingReleaseBranch, subjects = NON_BUMPING } = {}) {
    const remote = await mkdtemp(join(tmpdir(), 'cp-other-bump-remote-'));
    const dir = await mkdtemp(join(tmpdir(), 'cp-other-bump-'));
    await git(remote, 'init', '-q', '--bare', '-b', 'main');

    await git(dir, 'init', '-q', '-b', 'main');
    await git(dir, 'config', 'user.name', 'test');
    await git(dir, 'config', 'user.email', 'test@test.com');
    await git(dir, 'remote', 'add', 'origin', remote);
    await writeFile(join(dir, 'package.json'), '{\n  "version": "1.0.0"\n}\n');
    await git(dir, 'add', 'package.json');
    await git(dir, 'commit', '-qm', 'base');
    await git(dir, 'push', '-q', 'origin', 'main');
    if (existingReleaseBranch) {
        await git(dir, 'push', '-q', 'origin', `main:refs/heads/${existingReleaseBranch}`);
    }

    await git(dir, 'checkout', '-qb', 'dev');
    for (const [i, subject] of subjects.entries()) {
        const file = `${i}.txt`;
        await writeFile(join(dir, file), `${file}\n`);
        await git(dir, 'add', file);
        await git(dir, 'commit', '-qm', subject);
    }
    await git(dir, 'push', '-q', 'origin', 'dev');

    return {
        dir,
        cleanup: () => Promise.all([dir, remote].map((d) => rm(d, { recursive: true, force: true }))),
    };
}

const ARGS = ['--ci', '--dev', 'origin/dev', '--main', 'origin/main', '--since', '1 year ago', '--no-push-release'];

const currentBranch = async (dir) => (await git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim();
const pkgVersion = async (dir) => JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).version;

describe('--other-bump', () => {
    it('refuses to cut a release that would reuse the current version', async () => {
        const { dir, cleanup } = await makeRepo();

        const { output, code } = await runCli(ARGS, dir);
        assert.notEqual(code, 0, `should fail, got:\n${output}`);
        assert.match(output, /No version bump detected/);
        assert.match(output, /--other-bump patch/);
        assert.equal(await currentBranch(dir), 'dev', 'should stop before creating release/1.0.0');
        const { stdout: log } = await git(dir, 'log', '--format=%s', 'origin/dev..HEAD');
        assert.equal(log.trim(), '', 'should not cherry-pick anything');

        await cleanup();
    });

    it('releases non-bumping commits as a patch with --other-bump patch', async () => {
        const { dir, cleanup } = await makeRepo();

        const { output, code } = await runCli([...ARGS, '--other-bump', 'patch'], dir);
        assert.equal(code, 0, `should succeed, got:\n${output}`);
        assert.equal(await currentBranch(dir), 'release/1.0.1');
        assert.equal(await pkgVersion(dir), '1.0.1');

        await cleanup();
    });

    it('does not lower a feat commit to a patch', async () => {
        const { dir, cleanup } = await makeRepo({ subjects: [...NON_BUMPING, 'feat: add a flag'] });

        const { output, code } = await runCli([...ARGS, '--other-bump', 'patch'], dir);
        assert.equal(code, 0, `should succeed, got:\n${output}`);
        assert.equal(await currentBranch(dir), 'release/1.1.0');

        await cleanup();
    });

    it('never bumps commits matched by --ignore-semver', async () => {
        const { dir, cleanup } = await makeRepo();

        const { output, code } = await runCli(
            [...ARGS, '--other-bump', 'patch', '--ignore-semver', '^chore\\(deps\\),^refactor'],
            dir,
        );
        assert.notEqual(code, 0, `should fail, got:\n${output}`);
        assert.match(output, /No version bump detected/);
        assert.equal(await currentBranch(dir), 'dev');

        await cleanup();
    });

    it('cherry-picks without a version change when --no-create-release is passed', async () => {
        const { dir, cleanup } = await makeRepo();
        await git(dir, 'checkout', '-q', 'main');

        const { output, code } = await runCli([...ARGS, '--no-create-release'], dir);
        assert.equal(code, 0, `should succeed, got:\n${output}`);
        assert.equal(await pkgVersion(dir), '1.0.0');

        await cleanup();
    });
});

describe('Existing release branch in CI', () => {
    it('fails instead of waiting on the override prompt', async () => {
        const { dir, cleanup } = await makeRepo({ existingReleaseBranch: 'release/1.0.1' });

        const { output, code, killed } = await runCli([...ARGS, '--other-bump', 'patch'], dir);
        assert.ok(!killed, `should not hang, got:\n${output}`);
        assert.notEqual(code, 0, `should fail, got:\n${output}`);
        assert.match(output, /Release branch "release\/1\.0\.1" already exists on origin/);
        const { stdout: heads } = await git(dir, 'ls-remote', '--heads', 'origin', 'release/1.0.1');
        assert.ok(heads.trim(), 'should leave the existing release branch alone');

        await cleanup();
    });
});
