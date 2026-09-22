import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
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

const FETCH_LOG = 'Fetching remotes';
const DRY_RUN_ARGS = [
    '--dry-run',
    '--all-yes',
    '--dev',
    'feat',
    '--main',
    'main',
    '--since',
    '1 year ago',
];

describe('--no-fetch', () => {
    let dir;
    let remote;

    before(async () => {
        dir = await mkdtemp(join(tmpdir(), 'cp-fetch-'));
        remote = await mkdtemp(join(tmpdir(), 'cp-fetch-remote-'));
        await git(remote, 'init', '-q', '--bare');
        await git(dir, 'init', '-q', '-b', 'main');
        await git(dir, 'config', 'user.name', 'test');
        await git(dir, 'config', 'user.email', 'test@test.com');
        await git(dir, 'remote', 'add', 'origin', remote);
        await writeFile(join(dir, 'package.json'), '{"version":"1.0.0"}\n');
        await git(dir, 'add', 'package.json');
        await git(dir, 'commit', '-qm', 'base');
        await git(dir, 'checkout', '-qb', 'feat');
        await writeFile(join(dir, 'b.txt'), 'one\n');
        await git(dir, 'add', 'b.txt');
        await git(dir, 'commit', '-qm', 'feat one');
        await git(dir, 'checkout', '-q', 'main');
    });

    after(async () => {
        await rm(dir, { recursive: true, force: true });
        await rm(remote, { recursive: true, force: true });
    });

    it('fetches by default', async () => {
        const { output, code } = await runCli(DRY_RUN_ARGS, dir);
        assert.equal(code, 0, output);
        assert.ok(output.includes(FETCH_LOG), `should fetch, got:\n${output}`);
    });

    it('skips the fetch when --no-fetch is passed', async () => {
        const { output, code } = await runCli(['--no-fetch', ...DRY_RUN_ARGS], dir);
        assert.equal(code, 0, output);
        assert.ok(!output.includes(FETCH_LOG), `should not fetch, got:\n${output}`);
    });

    it('skips the fetch for a profile saved with the legacy "no-fetch" key', async () => {
        await writeFile(
            join(dir, '.cherrypickrc.json'),
            JSON.stringify({ profiles: { legacy: { 'no-fetch': true } } }),
        );
        const { output, code } = await runCli(['--profile', 'legacy', ...DRY_RUN_ARGS], dir);
        assert.equal(code, 0, output);
        assert.ok(!output.includes(FETCH_LOG), `should not fetch, got:\n${output}`);
    });

    it('lets an explicit --no-fetch override a profile that fetches', async () => {
        await writeFile(
            join(dir, '.cherrypickrc.json'),
            JSON.stringify({ profiles: { fetching: { fetch: true } } }),
        );
        const { output, code } = await runCli(
            ['--profile', 'fetching', '--no-fetch', ...DRY_RUN_ARGS],
            dir,
        );
        assert.equal(code, 0, output);
        assert.ok(!output.includes(FETCH_LOG), `should not fetch, got:\n${output}`);
    });
});
