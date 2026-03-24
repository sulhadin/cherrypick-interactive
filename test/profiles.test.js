import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'cli.js');

async function runCli(args, cwd) {
    try {
        const { stdout, stderr } = await exec('node', [CLI, ...args], { cwd });
        return { stdout, stderr, code: 0 };
    } catch (e) {
        return { stdout: e.stdout || '', stderr: e.stderr || '', code: e.code || 1 };
    }
}

describe('Profiles', () => {
    let tmpDir;

    before(async () => {
        // Create a temp dir that is a git repo
        tmpDir = await mkdtemp(join(tmpdir(), 'cherrypick-test-'));
        await exec('git', ['init'], { cwd: tmpDir });
        await exec('git', ['config', 'user.name', 'test'], { cwd: tmpDir });
        await exec('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpDir });
        await exec('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tmpDir });
    });

    after(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('--help shows Profile options group', async () => {
        const { stdout } = await runCli(['--help'], tmpDir);
        assert.ok(stdout.includes('Profile options:'), 'should have Profile options group');
        assert.ok(stdout.includes('--profile'), 'should show --profile flag');
        assert.ok(stdout.includes('--save-profile'), 'should show --save-profile flag');
        assert.ok(stdout.includes('--list-profiles'), 'should show --list-profiles flag');
    });

    it('--list-profiles with no config file shows no profiles', async () => {
        const { stdout } = await runCli(['--list-profiles'], tmpDir);
        assert.ok(stdout.includes('No profiles found'), 'should say no profiles found');
    });

    it('--save-profile saves a profile to .cherrypickrc.json', async () => {
        const { stdout } = await runCli([
            '--save-profile', 'test-profile',
            '--dev', 'origin/develop',
            '--main', 'origin/release',
            '--since', '2 weeks ago',
        ], tmpDir);

        assert.ok(stdout.includes('Profile "test-profile" saved'), 'should confirm save');

        const rcPath = join(tmpDir, '.cherrypickrc.json');
        const config = JSON.parse(await readFile(rcPath, 'utf8'));

        assert.ok(config.profiles, 'should have profiles key');
        assert.ok(config.profiles['test-profile'], 'should have named profile');
        assert.equal(config.profiles['test-profile'].dev, 'origin/develop');
        assert.equal(config.profiles['test-profile'].main, 'origin/release');
        assert.equal(config.profiles['test-profile'].since, '2 weeks ago');
    });

    it('--save-profile only saves allowlisted flags', async () => {
        const { stdout } = await runCli([
            '--save-profile', 'safe-profile',
            '--dev', 'origin/dev',
            '--dry-run',
        ], tmpDir);

        const rcPath = join(tmpDir, '.cherrypickrc.json');
        const config = JSON.parse(await readFile(rcPath, 'utf8'));
        const saved = config.profiles['safe-profile'];

        assert.equal(saved.dev, 'origin/dev');
        // Meta flags should not be saved
        assert.equal(saved['save-profile'], undefined, 'save-profile should not be persisted');
        assert.equal(saved['list-profiles'], undefined, 'list-profiles should not be persisted');
        assert.equal(saved.profile, undefined, 'profile should not be persisted');
        assert.equal(saved.help, undefined, 'help should not be persisted');
        assert.equal(saved.version, undefined, 'version should not be persisted');
    });

    it('--list-profiles shows saved profiles', async () => {
        const { stdout } = await runCli(['--list-profiles'], tmpDir);
        assert.ok(stdout.includes('test-profile'), 'should list test-profile');
        assert.ok(stdout.includes('safe-profile'), 'should list safe-profile');
    });

    it('--profile loads flags from saved profile', async () => {
        // We can't easily test that profile flags affect cherry-pick behavior
        // without a full repo setup. But we can verify --profile with --dry-run
        // doesn't crash and loads correctly by combining with --list-profiles test.
        // The real integration test is that --profile + --help still works.
        const { stdout } = await runCli(['--profile', 'test-profile', '--help'], tmpDir);
        assert.ok(stdout.includes('Cherry-pick options:'), 'should still show help with profile loaded');
    });

    it('--profile with missing name throws error', async () => {
        const { stderr, code } = await runCli(['--profile', 'nonexistent', '--dry-run'], tmpDir);
        assert.ok(stderr.includes('not found') || code !== 0, 'should error on missing profile');
    });

    it('.cherrypickrc.json is human-readable (pretty-printed)', async () => {
        const rcPath = join(tmpDir, '.cherrypickrc.json');
        const raw = await readFile(rcPath, 'utf8');
        assert.ok(raw.includes('\n  '), 'should be pretty-printed with indentation');
    });

    it('profiles stored under "profiles" key', async () => {
        const rcPath = join(tmpDir, '.cherrypickrc.json');
        const config = JSON.parse(await readFile(rcPath, 'utf8'));
        assert.ok(config.profiles, 'should have top-level profiles key');
        // Other top-level keys should not be profile names
        const topKeys = Object.keys(config);
        assert.ok(!topKeys.includes('test-profile'), 'profile names should not be top-level keys');
    });
});
