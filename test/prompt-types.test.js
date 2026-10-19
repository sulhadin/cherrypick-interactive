import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inquirer from 'inquirer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'cli.js');

describe('Inquirer prompt types', () => {
    // inquirer silently turns an unknown type into a free-text input, so a stale
    // `type: 'list'` drops every choice and resolves to '' on Enter instead of failing.
    it('every prompt in cli.js uses a type inquirer registers', async () => {
        const source = await readFile(CLI, 'utf8');
        const prompts = [...source.matchAll(/type:\s*'(\w+)',\s*name:/g)].map((m) => ({
            type: m[1],
            line: source.slice(0, m.index).split('\n').length,
        }));
        assert.ok(prompts.length > 0, 'should find prompt definitions in cli.js');

        const known = Object.keys(inquirer.prompt.prompts);
        const unknown = prompts.filter(({ type }) => !known.includes(type));
        assert.deepEqual(
            unknown,
            [],
            `unknown prompt types: ${unknown.map(({ type, line }) => `'${type}' at cli.js:${line}`).join(', ')}`,
        );
    });
});
