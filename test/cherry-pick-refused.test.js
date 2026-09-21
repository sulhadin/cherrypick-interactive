import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
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

describe('Session file location', () => {
    it('never touches the working tree', async () => {
        const dir = await makeRepo();

        const { code } = await runCli(CI_ARGS, dir);
        assert.equal(code, 0);

        assert.equal(await fileExists(join(dir, '.cherrypick-session.json')), false);
        const { stdout: status } = await git(dir, 'status', '--porcelain');
        assert.equal(status.trim(), '', 'working tree must be clean after a run');

        await rm(dir, { recursive: true, force: true });
    });

    it('--undo reads the session from the git dir', async () => {
        const dir = await makeRepo();
        const { stdout: head } = await git(dir, 'rev-parse', 'HEAD');
        await writeFile(
            join(dir, '.git', 'cherrypick-session.json'),
            JSON.stringify({ branch: 'main', checkpoint: head.trim(), timestamp: 'now', commits: [] }),
        );

        // The confirm prompt has no stdin here, so the run ends there; what matters is
        // that the session was found rather than reported missing.
        const { stdout, stderr } = await runCli(['--undo'], dir);
        assert.ok(!(stdout + stderr).includes('No active session'), 'session in .git/ must be found');

        await rm(dir, { recursive: true, force: true });
    });
});
