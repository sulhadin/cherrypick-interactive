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
// Any other versionFile sits next to a package.json at 9.0.0, so reading the wrong file shows up as release/9.1.0.
async function makeStaleCheckout(versionFile = 'package.json') {
    const remote = await mkdtemp(join(tmpdir(), 'cp-version-remote-'));
    const dir = await mkdtemp(join(tmpdir(), 'cp-version-'));
    const other = await mkdtemp(join(tmpdir(), 'cp-version-other-'));
    await git(remote, 'init', '-q', '--bare', '-b', 'main');

    await git(dir, 'init', '-q', '-b', 'main');
    await configureUser(dir);
    await git(dir, 'remote', 'add', 'origin', remote);
    await writeFile(join(dir, versionFile), '{ "version": "1.0.0" }\n');
    if (versionFile !== 'package.json') {
        await writeFile(join(dir, 'package.json'), '{ "version": "9.0.0" }\n');
    }
    await git(dir, 'add', '.');
    await git(dir, 'commit', '-qm', 'base');
    await git(dir, 'push', '-q', 'origin', 'main');
    await git(dir, 'checkout', '-qb', 'dev');
    await writeFile(join(dir, 'feature.txt'), 'new\n');
    await git(dir, 'add', 'feature.txt');
    await git(dir, 'commit', '-qm', 'feat: new thing');
    await git(dir, 'push', '-q', 'origin', 'dev');

    await git(other, 'clone', '-q', remote, '.');
    await configureUser(other);
    await writeFile(join(other, versionFile), '{ "version": "1.1.0" }\n');
    await git(other, 'commit', '-qam', 'chore(release): bump version to 1.1.0');
    await git(other, 'push', '-q', 'origin', 'main');

    return {
        dir,
        cleanup: () =>
            Promise.all([dir, remote, other].map((d) => rm(d, { recursive: true, force: true }))),
    };
}

const CI_ARGS = ['--ci', '--dev', 'origin/dev', '--main', 'origin/main', '--since', '1 year ago', '--no-push-release'];

async function currentBranch(dir) {
    const { stdout } = await git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
    return stdout.trim();
}

describe('current version source', () => {
    it('bumps the version committed on --main, not the stale one in the working tree', async () => {
        const { dir, cleanup } = await makeStaleCheckout();

        const { output, code } = await runCli(CI_ARGS, dir);
        assert.equal(code, 0, `should succeed, got:\n${output}`);

        assert.equal(
            await currentBranch(dir),
            'release/1.2.0',
            `should bump from origin/main"s 1.1.0, got:\n${output}`,
        );
        const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
        assert.equal(pkg.version, '1.2.0');
        assert.ok(output.includes('Source:  package.json @ origin/main'), `should name the file it read, got:\n${output}`);

        await cleanup();
    });

    it('reads only the --version-file from a profile, never package.json', async () => {
        const { dir, cleanup } = await makeStaleCheckout('version.json');
        await writeFile(
            join(dir, '.cherrypickrc.json'),
            JSON.stringify({ profiles: { default: { 'version-file': './version.json' } } }),
        );

        const { output, code } = await runCli([...CI_ARGS, '--profile'], dir);
        assert.equal(code, 0, `should succeed, got:\n${output}`);

        assert.equal(await currentBranch(dir), 'release/1.2.0', `should bump version.json's 1.1.0, got:\n${output}`);
        const versionFile = JSON.parse(await readFile(join(dir, 'version.json'), 'utf8'));
        assert.equal(versionFile.version, '1.2.0');
        const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
        assert.equal(pkg.version, '9.0.0', 'package.json should be left alone');
        assert.ok(output.includes('Source:  version.json @ origin/main'), `should name the file it read, got:\n${output}`);
        assert.ok(output.includes('✓ ./version.json updated and committed'), `should name the file it wrote, got:\n${output}`);

        await cleanup();
    });

    it('fails in CI when the --version-file is not on --main', async () => {
        const { dir, cleanup } = await makeStaleCheckout();

        const { output, code } = await runCli([...CI_ARGS, '--version-file', './version.json'], dir);
        assert.equal(code, 3, `should exit with the CI error code, got:\n${output}`);
        assert.ok(output.includes('Version file version.json not found on origin/main'), `got:\n${output}`);
        assert.equal(await currentBranch(dir), 'dev', 'should not cut a release branch');

        await cleanup();
    });

    it('names --current-version as the source when it is passed', async () => {
        const { dir, cleanup } = await makeStaleCheckout();

        const { output, code } = await runCli([...CI_ARGS, '--current-version', '3.0.0'], dir);
        assert.equal(code, 0, `should succeed, got:\n${output}`);

        assert.equal(await currentBranch(dir), 'release/3.1.0');
        assert.ok(output.includes('Source:  --current-version'), `should name --current-version, got:\n${output}`);

        await cleanup();
    });
});
