import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'cli.js');

const git = (cwd, ...args) => exec('git', args, { cwd });

async function runCli(args, cwd, env) {
    try {
        const { stdout, stderr } = await exec('node', [CLI, ...args], { cwd, env, timeout: 15000 });
        return { output: stdout + stderr, code: 0 };
    } catch (e) {
        return { output: (e.stdout || '') + (e.stderr || ''), code: e.code || 1 };
    }
}

// main: base; feat: base -> "feat: one"
async function makeRepo() {
    const dir = await mkdtemp(join(tmpdir(), 'cp-git-env-'));
    await git(dir, 'init', '-q', '-b', 'main');
    await git(dir, 'config', 'user.name', 'Config User');
    await git(dir, 'config', 'user.email', 'config@example.com');
    await writeFile(join(dir, 'a.txt'), 'base\n');
    await git(dir, 'add', 'a.txt');
    await git(dir, 'commit', '-qm', 'base');
    await git(dir, 'checkout', '-qb', 'feat');
    await writeFile(join(dir, 'b.txt'), 'one\n');
    await git(dir, 'add', 'b.txt');
    await git(dir, 'commit', '-qm', 'feat: one');
    await git(dir, 'checkout', '-q', 'main');
    return dir;
}

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

describe('git child environment', () => {
    // simple-git 4 strips GIT_*, EDITOR, SSH_ASKPASS, ... from the environment it hands to git.
    it("runs git with the caller's GIT_* and editor variables", async () => {
        const dir = await makeRepo();
        const env = {
            ...process.env,
            GIT_COMMITTER_NAME: 'Env Committer',
            GIT_COMMITTER_EMAIL: 'env@example.com',
            GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
            GIT_EDITOR: 'true',
            VISUAL: 'true',
        };

        const { output, code } = await runCli(CI_ARGS, dir, env);
        assert.equal(code, 0, `should succeed, got:\n${output}`);

        const { stdout: committer } = await git(dir, 'log', '-1', '--format=%cn <%ce>', 'main');
        assert.equal(committer.trim(), 'Env Committer <env@example.com>', 'should commit as the GIT_COMMITTER_* identity');

        await rm(dir, { recursive: true, force: true });
    });
});
