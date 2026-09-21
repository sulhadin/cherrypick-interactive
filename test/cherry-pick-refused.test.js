import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile, readFile, access, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'cli.js');

const git = (cwd, ...args) => exec('git', args, { cwd });

async function runCli(args, cwd) {
    try {
        const { stdout, stderr } = await exec('node', [CLI, ...args], { cwd, timeout: 15000 });
        return { stdout, stderr, code: 0 };
    } catch (e) {
        return { stdout: e.stdout || '', stderr: e.stderr || '', code: e.code || 1 };
    }
}

async function fileExists(path) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

// main: base; feat: base -> "feat one" -> "feat two"
async function makeRepo() {
    const dir = await mkdtemp(join(tmpdir(), 'cp-refused-'));
    await git(dir, 'init', '-q', '-b', 'main');
    await git(dir, 'config', 'user.name', 'test');
    await git(dir, 'config', 'user.email', 'test@test.com');
    await writeFile(join(dir, 'a.txt'), 'base\n');
    await git(dir, 'add', 'a.txt');
    await git(dir, 'commit', '-qm', 'base');
    await git(dir, 'checkout', '-qb', 'feat');
    await writeFile(join(dir, 'b.txt'), 'one\n');
    await git(dir, 'add', 'b.txt');
    await git(dir, 'commit', '-qm', 'feat one');
    await writeFile(join(dir, 'c.txt'), 'two\n');
    await git(dir, 'add', 'c.txt');
    await git(dir, 'commit', '-qm', 'feat two');
    await git(dir, 'checkout', '-q', 'main');
    return dir;
}

// Picks straight onto the current branch: no release branch, no push, no remote needed.
const CI_ARGS = [
    '--ci',
    '--dev',
    'feat',
    '--main',
    'main',
    '--since',
    '1 year ago',
    '--current-version',
    '1.0.0',
    '--no-create-release',
    '--no-push-release',
];

describe('git refuses to start a cherry-pick', () => {
    it('fails loudly with the git error instead of counting the commit as skipped', async () => {
        const dir = await makeRepo();
        // A staged, unrelated file makes git refuse every cherry-pick before it starts.
        await writeFile(join(dir, 'staged.txt'), 'x\n');
        await git(dir, 'add', 'staged.txt');

        const { stdout, stderr, code } = await runCli(CI_ARGS, dir);
        const output = stdout + stderr;

        assert.notEqual(code, 0, 'should exit non-zero');
        assert.ok(output.includes('failed before starting'), `should name the failure, got:\n${output}`);
        assert.ok(
            output.includes('local changes would be overwritten'),
            `should surface git's own message, got:\n${output}`,
        );
        assert.ok(!output.includes('skipped: 2'), 'must not report the refused commits as skipped');

        const { stdout: count } = await git(dir, 'rev-list', '--count', 'main');
        assert.equal(count.trim(), '1', 'main must be untouched');

        await rm(dir, { recursive: true, force: true });
    });

    it('applies every commit when the index is clean', async () => {
        const dir = await makeRepo();

        const { stdout, stderr, code } = await runCli(CI_ARGS, dir);
        assert.equal(code, 0, `should succeed, got:\n${stdout}${stderr}`);
        assert.ok((stdout + stderr).includes('applied: 2, skipped: 0'));

        await rm(dir, { recursive: true, force: true });
    });
});

describe('Release branch without push', () => {
    it('still bumps the version on the release branch', async () => {
        const dir = await makeRepo();
        // ensureReleaseBranchFresh queries origin, so the repo needs one even without a push.
        const remote = await mkdtemp(join(tmpdir(), 'cp-remote-'));
        await git(remote, 'init', '-q', '--bare');
        await git(dir, 'remote', 'add', 'origin', remote);
        await writeFile(join(dir, 'package.json'), '{ "version": "1.0.0" }\n');
        await git(dir, 'add', 'package.json');
        await git(dir, 'commit', '-qm', 'add package.json');

        const { stdout, stderr, code } = await runCli(
            ['--ci', '--dev', 'feat', '--main', 'main', '--since', '1 year ago', '--no-push-release'],
            dir,
        );
        assert.equal(code, 0, `should succeed, got:\n${stdout}${stderr}`);

        const { stdout: branch } = await git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
        assert.equal(branch.trim(), 'release/1.1.0');
        const { stdout: subject } = await git(dir, 'log', '-1', '--format=%s');
        assert.equal(subject.trim(), 'chore(release): bump version to 1.1.0');
        const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
        assert.equal(pkg.version, '1.1.0');
        const { stdout: pushed } = await git(dir, 'ls-remote', '--heads', 'origin', 'release/*');
        assert.equal(pushed.trim(), '', 'must not push');

        await rm(dir, { recursive: true, force: true });
        await rm(remote, { recursive: true, force: true });
    });
});

describe('Release branch with push', () => {
    it('hands gh a PR body outside the repo and leaves the worktree clean', async () => {
        const dir = await makeRepo();
        const remote = await mkdtemp(join(tmpdir(), 'cp-remote-'));
        await git(remote, 'init', '-q', '--bare');
        await git(dir, 'remote', 'add', 'origin', remote);
        await writeFile(join(dir, 'package.json'), '{ "version": "1.0.0" }\n');
        // A committed changelog is what a real repo ends up with once one leaks into a release.
        await writeFile(join(dir, 'RELEASE_CHANGELOG.md'), '## Release 0.9.0\n');
        await git(dir, 'add', 'package.json', 'RELEASE_CHANGELOG.md');
        await git(dir, 'commit', '-qm', 'add package.json');

        // Fake gh: records the --body-file path and its contents.
        const bin = await mkdtemp(join(tmpdir(), 'cp-bin-'));
        const record = join(bin, 'record.json');
        await writeFile(
            join(bin, 'gh'),
            `#!/bin/sh
[ "$1" = "--version" ] && exit 0
while [ $# -gt 0 ]; do
  [ "$1" = "--body-file" ] && { printf '{"path":"%s","body":%s}' "$2" "$(node -p 'JSON.stringify(require("fs").readFileSync(process.argv[1],"utf8"))' "$2")" > "${record}"; }
  shift
done
exit 0
`,
        );
        await chmod(join(bin, 'gh'), 0o755);

        const { stdout, stderr, code } = await exec(
            'node',
            [CLI, '--ci', '--dev', 'feat', '--main', 'main', '--since', '1 year ago'],
            { cwd: dir, timeout: 15000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } },
        ).then((r) => ({ ...r, code: 0 }), (e) => ({ stdout: e.stdout || '', stderr: e.stderr || '', code: e.code || 1 }));
        assert.equal(code, 0, `should succeed, got:\n${stdout}${stderr}`);

        const { path, body } = JSON.parse(await readFile(record, 'utf8'));
        const bodyFile = resolve(dir, path);
        assert.ok(!bodyFile.startsWith(dir), `PR body must not be written into the repo, got ${bodyFile}`);
        assert.ok(body.includes('## Release 1.1.0'), 'PR body must be the generated changelog');
        assert.equal(await fileExists(bodyFile), false, 'temp body file must be removed');

        const { stdout: status } = await git(dir, 'status', '--porcelain');
        assert.equal(status.trim(), '', 'working tree must be clean after a run');
        assert.equal(await readFile(join(dir, 'RELEASE_CHANGELOG.md'), 'utf8'), '## Release 0.9.0\n', 'committed changelog must be untouched');
        const { stdout: pushed } = await git(dir, 'ls-remote', '--heads', 'origin', 'release/1.1.0');
        assert.ok(pushed.trim(), 'release branch must be pushed');

        await rm(dir, { recursive: true, force: true });
        await rm(remote, { recursive: true, force: true });
        await rm(bin, { recursive: true, force: true });
    });
});

describe('Working tree hygiene', () => {
    it('leaves nothing behind in the repo after a run', async () => {
        const dir = await makeRepo();

        const { code } = await runCli(CI_ARGS, dir);
        assert.equal(code, 0);

        assert.equal(await fileExists(join(dir, '.cherrypick-session.json')), false);
        const { stdout: status } = await git(dir, 'status', '--porcelain');
        assert.equal(status.trim(), '', 'working tree must be clean after a run');

        await rm(dir, { recursive: true, force: true });
    });
});
