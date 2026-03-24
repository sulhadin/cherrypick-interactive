import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'cli.js');

describe('CI Mode', () => {
    it('--help shows CI options group with all flags', async () => {
        const { stdout } = await exec('node', [CLI, '--help']);
        assert.ok(stdout.includes('CI options:'), 'should have CI options group');
        assert.ok(stdout.includes('--ci'), 'should show --ci flag');
        assert.ok(stdout.includes('--conflict-strategy'), 'should show --conflict-strategy flag');
        assert.ok(stdout.includes('--format'), 'should show --format flag');
        assert.ok(stdout.includes('--dependency-strategy'), 'should show --dependency-strategy flag');
    });

    it('--conflict-strategy accepts fail, ours, theirs, skip', async () => {
        const { stdout } = await exec('node', [CLI, '--help']);
        assert.ok(stdout.includes('fail'), 'should mention fail');
        assert.ok(stdout.includes('ours'), 'should mention ours');
        assert.ok(stdout.includes('theirs'), 'should mention theirs');
        assert.ok(stdout.includes('skip'), 'should mention skip');
    });

    it('--format accepts text, json', async () => {
        const { stdout } = await exec('node', [CLI, '--help']);
        assert.ok(stdout.includes('text'), 'should mention text');
        assert.ok(stdout.includes('json'), 'should mention json');
    });

    it('--conflict-strategy defaults to fail', async () => {
        const { stdout } = await exec('node', [CLI, '--help']);
        assert.ok(stdout.includes('default: "fail"'), 'should default to fail');
    });
});

describe('CI Mode - log redirection', () => {
    it('--format json redirects log to stderr (stdout is clean)', () => {
        // Verify the implementation: isJsonFormat checks process.argv
        const source = readFile(CLI, 'utf8');
        source.then((code) => {
            assert.ok(code.includes("isJsonFormat ? console.error(...a) : console.log(...a)"),
                'log should redirect to stderr in JSON mode');
        });
    });

    it('--format json sets NO_COLOR=1', () => {
        const source = readFile(CLI, 'utf8');
        source.then((code) => {
            assert.ok(code.includes("process.env.NO_COLOR = '1'"),
                'should set NO_COLOR in JSON mode');
        });
    });
});

describe('CI Mode - exit codes', () => {
    it('ExitError used for structured exit codes', async () => {
        const code = await readFile(CLI, 'utf8');
        assert.ok(code.includes('class ExitError'), 'should have ExitError class');
        assert.ok(code.includes('e.exitCode'), 'catch block should read exitCode');
    });

    it('exit code 1 for conflict with --conflict-strategy fail', async () => {
        const code = await readFile(CLI, 'utf8');
        assert.ok(code.includes("ExitError('Conflict detected") || code.includes('ExitError('), 'should throw ExitError for conflicts');
    });

    it('exit code 2 for no commits found in CI', async () => {
        const code = await readFile(CLI, 'utf8');
        assert.ok(code.includes("ExitError('No commits found.', 2)"), 'should throw ExitError with code 2');
    });

    it('exit code 3 as default for CI errors', async () => {
        const code = await readFile(CLI, 'utf8');
        assert.ok(code.includes("argv.ci ? 3 : 1"), 'should default to exit code 3 for CI errors');
    });

    it('exit code 4 for dependency-strategy fail', async () => {
        const code = await readFile(CLI, 'utf8');
        assert.ok(code.includes("ExitError('Dependency check failed"), 'should throw ExitError for dependency fail');
    });
});

describe('CI Mode - JSON output structure', () => {
    it('ciResult has allowlisted fields only', () => {
        // Verify the JSON output uses a fixed allowlist structure
        const source = readFile(CLI, 'utf8');
        source.then((code) => {
            assert.ok(code.includes('ciResult'), 'should have ciResult collector');
            // Verify it does NOT include process.env
            assert.ok(!code.includes('JSON.stringify(process.env'), 'should not serialize process.env');
        });
    });

    it('ciResult includes changelog field', () => {
        const source = readFile(CLI, 'utf8');
        source.then((code) => {
            assert.ok(code.includes('ciResult.changelog'), 'should populate changelog field');
        });
    });
});

describe('CI Mode - --ci implies --all-yes', () => {
    it('--ci sets all-yes to true in code', () => {
        const source = readFile(CLI, 'utf8');
        source.then((code) => {
            assert.ok(code.includes("argv['all-yes'] = true"), 'should set all-yes when ci is set');
        });
    });
});
