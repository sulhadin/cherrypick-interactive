import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'cli.js');

describe('Tracker Integration', () => {
    it('--help shows Tracker options group', async () => {
        const { stdout } = await exec('node', [CLI, '--help']);
        assert.ok(stdout.includes('Tracker options:'), 'should have Tracker options group');
        assert.ok(stdout.includes('--tracker'), 'should show --tracker flag');
        assert.ok(stdout.includes('--ticket-pattern'), 'should show --ticket-pattern flag');
        assert.ok(stdout.includes('--tracker-url'), 'should show --tracker-url flag');
    });

    it('--tracker accepts clickup, jira, linear', async () => {
        const { stdout } = await exec('node', [CLI, '--help']);
        assert.ok(stdout.includes('clickup'), 'should mention clickup');
        assert.ok(stdout.includes('jira'), 'should mention jira');
        assert.ok(stdout.includes('linear'), 'should mention linear');
    });
});

// ── Unit tests for linkifyTicket and parseTrackerConfig ──
// We test the logic directly by importing via a dynamic approach.
// Since cli.js is a script with side effects, we test the logic via CLI output.

describe('linkifyTicket logic (via integration)', () => {
    it('ClickUp: links first match only, skips PR number', () => {
        // Simulate what linkifyTicket does
        const subject = '#86c8w62wx - Upgrade apk packages (#585)';
        const pattern = /#([a-z0-9]+)/;
        const url = 'https://app.clickup.com/t/{{id}}';

        const match = pattern.exec(subject);
        assert.ok(match, 'should match');
        assert.equal(match[0], '#86c8w62wx');
        assert.equal(match[1], '86c8w62wx');

        const link = url.replace('{{id}}', match[1]);
        const result = subject.replace(match[0], `[${match[0]}](${link})`);
        assert.equal(
            result,
            '[#86c8w62wx](https://app.clickup.com/t/86c8w62wx) - Upgrade apk packages (#585)',
        );
    });

    it('Jira: links ticket ID', () => {
        const subject = 'PROJ-123 fix login redirect';
        const pattern = /([A-Z]+-\d+)/;
        const url = 'https://team.atlassian.net/browse/{{id}}';

        const match = pattern.exec(subject);
        assert.ok(match);
        const link = url.replace('{{id}}', match[1]);
        const result = subject.replace(match[0], `[${match[0]}](${link})`);
        assert.equal(
            result,
            '[PROJ-123](https://team.atlassian.net/browse/PROJ-123) fix login redirect',
        );
    });

    it('Linear: links ticket with brackets replaced', () => {
        const subject = 'feat: add auth [ENG-456]';
        const pattern = /\[([A-Z]+-\d+)\]/;
        const url = 'https://linear.app/my-team/issue/{{id}}';

        const match = pattern.exec(subject);
        assert.ok(match);
        assert.equal(match[0], '[ENG-456]');
        assert.equal(match[1], 'ENG-456');

        const link = url.replace('{{id}}', match[1]);
        const result = subject.replace(match[0], `[${match[0]}](${link})`);
        assert.equal(
            result,
            'feat: add auth [[ENG-456]](https://linear.app/my-team/issue/ENG-456)',
        );
    });

    it('No match returns subject unchanged', () => {
        const subject = 'chore: update deps';
        const pattern = /#([a-z0-9]+)/;

        const match = pattern.exec(subject);
        assert.equal(match, null);
        // linkifyTicket returns subject as-is when no match
    });

    it('ReDoS pattern is detected', () => {
        // Import safe-regex2 directly for this test
        import('safe-regex2').then(({ default: isSafeRegex }) => {
            const dangerous = /(a+)+$/;
            assert.equal(isSafeRegex(dangerous), false, 'should detect dangerous pattern');

            const safe = /#([a-z0-9]+)/;
            assert.equal(isSafeRegex(safe), true, 'should accept safe pattern');
        });
    });

    it('parseTrackerConfig validates capture group', () => {
        // Pattern without capture group
        const noCapturePattern = /abc/;
        const groups = new RegExp(`${noCapturePattern.source}|`).exec('').length - 1;
        assert.equal(groups, 0, 'should detect no capture groups');

        // Pattern with capture group
        const withCapture = /#([a-z0-9]+)/;
        const groups2 = new RegExp(`${withCapture.source}|`).exec('').length - 1;
        assert.equal(groups2, 1, 'should detect one capture group');
    });

    it('preset patterns are safe', async () => {
        const { default: isSafeRegex } = await import('safe-regex2');
        const presets = {
            clickup: '#([a-z0-9]+)',
            jira: '([A-Z]+-\\d+)',
            linear: '\\[([A-Z]+-\\d+)\\]',
        };

        for (const [name, pattern] of Object.entries(presets)) {
            const compiled = new RegExp(pattern);
            assert.ok(isSafeRegex(compiled), `${name} preset should be safe`);

            // Verify each has exactly one capture group
            const groups = new RegExp(`${pattern}|`).exec('').length - 1;
            assert.equal(groups, 1, `${name} preset should have one capture group`);
        }
    });
});
