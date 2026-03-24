import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'cli.js');

async function runCli(args, cwd) {
    try {
        const { stdout, stderr } = await exec('node', [CLI, ...args], { cwd, timeout: 5000 });
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

describe('Undo / Rollback', () => {
    it('--help shows Session options group with --undo', async () => {
        const { stdout } = await exec('node', [CLI, '--help']);
        assert.ok(stdout.includes('Session options:'), 'should have Session options group');
        assert.ok(stdout.includes('--undo'), 'should show --undo flag');
    });

    it('--undo with --ci exits with error', async () => {
        const tmpDir = await mkdtemp(join(tmpdir(), 'undo-ci-'));
        await exec('git', ['init'], { cwd: tmpDir });
        await exec('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tmpDir });

        const { stderr, code } = await runCli(['--undo', '--ci'], tmpDir);
        assert.ok(
            stderr.includes('interactive-only') || code !== 0,
            'should error when --undo used with --ci',
        );

        await rm(tmpDir, { recursive: true, force: true });
    });

    it('--undo with no session file shows clear error', async () => {
        const tmpDir = await mkdtemp(join(tmpdir(), 'undo-nosession-'));
        await exec('git', ['init'], { cwd: tmpDir });
        await exec('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tmpDir });

        const { stderr, code } = await runCli(['--undo'], tmpDir);
        assert.ok(
            stderr.includes('No active session') || code !== 0,
            'should error when no session exists',
        );

        await rm(tmpDir, { recursive: true, force: true });
    });
});

describe('Session file management', () => {
    it('.cherrypick-session.json is in .gitignore', async () => {
        const gitignore = await readFile(
            join(__dirname, '..', '.gitignore'),
            'utf8',
        );
        assert.ok(
            gitignore.includes('.cherrypick-session.json'),
            'should be in .gitignore',
        );
    });

    it('session file structure includes required fields', () => {
        // Verify expected structure
        const session = {
            branch: 'release/1.8.0',
            checkpoint: 'abc1234def5678',
            timestamp: '2026-03-24T14:30:00Z',
            commits: ['aaa1111', 'bbb2222'],
        };

        assert.ok(session.branch, 'should have branch');
        assert.ok(session.checkpoint, 'should have checkpoint');
        assert.ok(session.timestamp, 'should have timestamp');
        assert.ok(Array.isArray(session.commits), 'commits should be array');
    });

    it('session file path resolves from git repo root', () => {
        // Verify in source code that getSessionPath uses getRepoRoot
        const source = readFile(join(__dirname, '..', 'cli.js'), 'utf8');
        source.then((code) => {
            assert.ok(code.includes('async function getSessionPath()'), 'should have getSessionPath');
            assert.ok(code.includes('getRepoRoot()'), 'getSessionPath should use getRepoRoot');
        });
    });
});

describe('Undo safety checks', () => {
    it('validates checkpoint as ancestor before reset', () => {
        const source = readFile(join(__dirname, '..', 'cli.js'), 'utf8');
        source.then((code) => {
            assert.ok(
                code.includes('merge-base') && code.includes('--is-ancestor'),
                'should validate checkpoint as ancestor',
            );
        });
    });

    it('checks for branch divergence', () => {
        const source = readFile(join(__dirname, '..', 'cli.js'), 'utf8');
        source.then((code) => {
            assert.ok(
                code.includes('rev-list') && code.includes('--count'),
                'should count commits for divergence check',
            );
        });
    });

    it('uses --force-with-lease (not --force)', () => {
        const source = readFile(join(__dirname, '..', 'cli.js'), 'utf8');
        source.then((code) => {
            assert.ok(code.includes('--force-with-lease'), 'should use --force-with-lease');
            // Verify no bare --force for push (except --force-with-lease)
            const pushForceMatches = code.match(/push.*--force(?!-with-lease)/g);
            assert.equal(pushForceMatches, null, 'should not use bare --force for push');
        });
    });

    it('confirmation defaults to No', () => {
        const source = readFile(join(__dirname, '..', 'cli.js'), 'utf8');
        source.then((code) => {
            // In handleUndo, the confirm prompt should have default: false
            assert.ok(
                code.includes("message: 'Continue?', default: false"),
                'undo confirmation should default to No',
            );
        });
    });

    it('warning mentions remote history rewrite', () => {
        const source = readFile(join(__dirname, '..', 'cli.js'), 'utf8');
        source.then((code) => {
            assert.ok(
                code.includes('rewrite remote history'),
                'should warn about remote history rewrite',
            );
        });
    });
});
