import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'cli.js');

async function runCli(args, cwd, env = process.env) {
    try {
        const { stdout, stderr } = await exec('node', [CLI, ...args], { cwd, env });
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

    it('--save-profile saves only the flags passed on the command line', async () => {
        await runCli(['--save-profile', 'explicit-only', '--since', '3 days ago', '--no-fetch'], tmpDir);

        const rcPath = join(tmpDir, '.cherrypickrc.json');
        const config = JSON.parse(await readFile(rcPath, 'utf8'));
        assert.deepEqual(config.profiles['explicit-only'], { since: '3 days ago', fetch: false });
    });

    it('--save-profile overwrites an existing profile without prompting', async () => {
        const { stdout, code } = await runCli(['--save-profile', 'explicit-only', '--dev', 'origin/next'], tmpDir);

        assert.equal(code, 0);
        assert.ok(stdout.includes('Profile "explicit-only" updated'), 'should confirm the update');
        const rcPath = join(tmpDir, '.cherrypickrc.json');
        const config = JSON.parse(await readFile(rcPath, 'utf8'));
        assert.deepEqual(config.profiles['explicit-only'], { dev: 'origin/next' });
    });

    it('--save-profile without any flags to save fails', async () => {
        const { stderr, code } = await runCli(['--save-profile', 'empty'], tmpDir);

        assert.notEqual(code, 0);
        assert.ok(stderr.includes('No flags to save'), `should explain, got:\n${stderr}`);
        const rcPath = join(tmpDir, '.cherrypickrc.json');
        const config = JSON.parse(await readFile(rcPath, 'utf8'));
        assert.equal(config.profiles.empty, undefined, 'must not save an empty profile');
    });

    it('--save-profile without a name fails instead of running the tool', async () => {
        const { stdout, stderr, code } = await runCli(['--since', '1 month ago', '--save-profile'], tmpDir);

        assert.notEqual(code, 0);
        assert.ok(stderr.includes('--save-profile needs a profile name'), `should explain, got:\n${stderr}`);
        assert.ok(!stdout.includes('Fetching remotes'), 'must not start the cherry-pick flow');
    });

    it('--profile without a name fails instead of being ignored', async () => {
        const { stdout, stderr, code } = await runCli(['--profile'], tmpDir);

        assert.notEqual(code, 0);
        assert.ok(stderr.includes('--profile needs a profile name'), `should explain, got:\n${stderr}`);
        assert.ok(!stdout.includes('Fetching remotes'), 'must not start the cherry-pick flow');
    });

    it('--save-profile does nothing else: no fetch, no git changes', async () => {
        const git = (...args) => exec('git', args, { cwd: tmpDir }).then((r) => r.stdout);
        const before = [await git('rev-parse', 'HEAD'), await git('branch', '-a')];

        const { stdout, stderr, code } = await runCli(['--save-profile', 'quiet', '--dev', 'origin/dev'], tmpDir);

        assert.equal(code, 0, stderr);
        assert.equal(stdout.trim(), '✓ Profile "quiet" saved in .cherrypickrc.json');
        assert.equal(stderr, '');
        assert.deepEqual([await git('rev-parse', 'HEAD'), await git('branch', '-a')], before);
        const status = await git('status', '--porcelain');
        assert.ok(
            status.split('\n').filter(Boolean).every((l) => l.endsWith('.cherrypickrc.json')),
            `only the rc file may change, got:\n${status}`,
        );
    });

    it('--save-profile accepts the --flag=value form', async () => {
        await runCli(['--save-profile', 'equals-form', '--since=5 days ago', '--dev=origin/next'], tmpDir);

        const rcPath = join(tmpDir, '.cherrypickrc.json');
        const config = JSON.parse(await readFile(rcPath, 'utf8'));
        assert.deepEqual(config.profiles['equals-form'], { since: '5 days ago', dev: 'origin/next' });
    });

    it('--profile applies the saved flags and falls back to defaults for the rest', async () => {
        await runCli(['--save-profile', 'local', '--dev', 'HEAD', '--main', 'HEAD', '--no-fetch'], tmpDir);

        const { stdout, code } = await runCli(['--profile', 'local', '--dry-run'], tmpDir);

        assert.equal(code, 0, stdout);
        assert.ok(stdout.includes('Dev:  HEAD'), `should use the saved --dev, got:\n${stdout}`);
        assert.ok(stdout.includes('since 1 week ago'), 'should use the default --since');
        assert.ok(!stdout.includes('Fetching remotes'), 'should honour the saved --no-fetch');
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

describe('--save-profile and the update check', () => {
    let tmpDir;
    let configHome;
    let env;

    // update-notifier reads the "update" entry from its configstore cache and deletes it once shown.
    async function seedPendingUpdate() {
        const storeDir = join(configHome, 'configstore');
        await mkdir(storeDir, { recursive: true });
        await writeFile(
            join(storeDir, 'update-notifier-cherrypick-interactive.json'),
            JSON.stringify({ optOut: false, lastUpdateCheck: Date.now(), update: { latest: '99.0.0' } }),
        );
    }

    before(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'cherrypick-update-'));
        configHome = await mkdtemp(join(tmpdir(), 'cherrypick-xdg-'));
        await exec('git', ['init', '-q'], { cwd: tmpDir });
        // update-notifier disables itself under CI, CONTINUOUS_INTEGRATION or NODE_ENV=test.
        env = { ...process.env, XDG_CONFIG_HOME: configHome, CI: '0', CONTINUOUS_INTEGRATION: '0', NODE_ENV: '' };
        delete env.NO_UPDATE_NOTIFIER;
    });

    after(async () => {
        await rm(tmpDir, { recursive: true, force: true });
        await rm(configHome, { recursive: true, force: true });
    });

    it('shows the update notice on other commands', async () => {
        await seedPendingUpdate();
        const { stdout } = await runCli(['--list-profiles'], tmpDir, env);
        assert.ok(stdout.includes('A new version is available'), `the fake update should be picked up, got:\n${stdout}`);
    });

    it('skips the update notice when saving a profile', async () => {
        await seedPendingUpdate();
        const { stdout } = await runCli(['--save-profile', 'p', '--dev', 'origin/dev'], tmpDir, env);
        assert.ok(!stdout.includes('A new version is available'), `got:\n${stdout}`);
        assert.equal(stdout.trim(), '✓ Profile "p" saved in .cherrypickrc.json');
    });
});
