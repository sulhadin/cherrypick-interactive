import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, access } from 'node:fs/promises';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'cli.js');
const SRC_TUI = join(__dirname, '..', 'src', 'tui');

describe('TUI Dashboard', () => {
    it('--help shows --no-tui flag in UI options group', async () => {
        const { stdout } = await exec('node', [CLI, '--help']);
        assert.ok(stdout.includes('--no-tui'), 'should show --no-tui flag');
        assert.ok(stdout.includes('UI options:'), 'should be in UI options group');
    });

    it('TUI component files exist', async () => {
        const files = ['App.js', 'Header.js', 'CommitList.js', 'CommitRow.js', 'Preview.js', 'KeyBar.js', 'html.js', 'index.js'];
        for (const file of files) {
            const path = join(SRC_TUI, file);
            try {
                await access(path);
            } catch {
                assert.fail(`Missing TUI component: src/tui/${file}`);
            }
        }
    });

    it('TUI index.js exports renderCommitSelector', async () => {
        const source = await readFile(join(SRC_TUI, 'index.js'), 'utf8');
        assert.ok(source.includes('export function renderCommitSelector'), 'should export renderCommitSelector');
    });

    it('App.js handles all required keyboard shortcuts', async () => {
        const source = await readFile(join(SRC_TUI, 'App.js'), 'utf8');
        // Navigation
        assert.ok(source.includes('upArrow') || source.includes("'k'"), 'should handle up navigation');
        assert.ok(source.includes('downArrow') || source.includes("'j'"), 'should handle down navigation');
        // Toggle
        assert.ok(source.includes("' '"), 'should handle space for toggle');
        // Select all / deselect
        assert.ok(source.includes("'a'"), 'should handle a for select all');
        assert.ok(source.includes("'n'"), 'should handle n for deselect');
        // Search
        assert.ok(source.includes("'/'"), 'should handle / for search');
        // Diff
        assert.ok(source.includes("'d'"), 'should handle d for diff');
        // Confirm
        assert.ok(source.includes('key.return'), 'should handle enter for confirm');
        // Quit
        assert.ok(source.includes("'q'"), 'should handle q for quit');
    });

    it('App.js prompts before quit when selections exist', async () => {
        const source = await readFile(join(SRC_TUI, 'App.js'), 'utf8');
        assert.ok(source.includes('confirmQuit'), 'should have quit confirmation state');
        assert.ok(source.includes('selected.size > 0'), 'should check for selections before quit');
    });

    it('App.js supports search/filter', async () => {
        const source = await readFile(join(SRC_TUI, 'App.js'), 'utf8');
        assert.ok(source.includes('filterText'), 'should have filter text state');
        assert.ok(source.includes('isSearching'), 'should have searching state');
    });

    it('App.js supports diff overlay with Esc to return', async () => {
        const source = await readFile(join(SRC_TUI, 'App.js'), 'utf8');
        assert.ok(source.includes('showDiff'), 'should have diff overlay state');
        assert.ok(source.includes('key.escape'), 'should handle Esc to return from diff');
    });

    it('html.js binds htm to ink createElement', async () => {
        const source = await readFile(join(SRC_TUI, 'html.js'), 'utf8');
        assert.ok(source.includes('createElement'), 'should import createElement');
        assert.ok(source.includes('htm'), 'should import htm');
    });
});

describe('TUI fallback detection', () => {
    it('shouldUseTui logic exists in cli.js', async () => {
        const source = await readFile(CLI, 'utf8');
        assert.ok(source.includes('function shouldUseTui'), 'should have shouldUseTui function');
    });

    it('checks isTTY for terminal detection', async () => {
        const source = await readFile(CLI, 'utf8');
        assert.ok(source.includes('process.stdout.isTTY'), 'should check isTTY');
    });

    it('checks CI environment variable', async () => {
        const source = await readFile(CLI, 'utf8');
        assert.ok(source.includes("process.env.CI"), 'should check CI env var');
    });

    it('checks minimum terminal size', async () => {
        const source = await readFile(CLI, 'utf8');
        assert.ok(source.includes('MIN_TUI_ROWS'), 'should check minimum rows');
        assert.ok(source.includes('MIN_TUI_COLS'), 'should check minimum cols');
    });

    it('falls back on Windows', async () => {
        const source = await readFile(CLI, 'utf8');
        assert.ok(source.includes("process.platform === 'win32'"), 'should check for Windows');
    });

    it('--no-tui disables TUI', async () => {
        const source = await readFile(CLI, 'utf8');
        assert.ok(source.includes("argv['no-tui']"), 'should check --no-tui flag');
    });
});
