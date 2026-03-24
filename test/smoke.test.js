import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'cli.js');

describe('CLI smoke tests', () => {
    it('--help exits 0 and shows grouped options', async () => {
        const { stdout } = await exec('node', [CLI, '--help']);
        assert.ok(stdout.includes('Cherry-pick options:'), 'should have Cherry-pick options group');
        assert.ok(stdout.includes('Version options:'), 'should have Version options group');
        assert.ok(stdout.includes('Release options:'), 'should have Release options group');
        assert.ok(stdout.includes('UI options:'), 'should have UI options group');
    });

    it('--version exits 0 and prints a semver string', async () => {
        const { stdout } = await exec('node', [CLI, '--version']);
        assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/, 'should print semver version');
    });
});
