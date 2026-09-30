import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { checkForUpdate, fetchLatestVersion } from '../src/update-check.js';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'cli.js');

function startRegistry(handler) {
    const requests = [];
    const server = createServer((req, res) => {
        requests.push(req.url);
        handler(req, res);
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve({
                url: `http://127.0.0.1:${server.address().port}`,
                requests,
                close: () => {
                    server.closeAllConnections();
                    return new Promise((r) => server.close(r));
                },
            });
        });
    });
}

const respondWith = (status, body) => (_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body);
};

describe('fetchLatestVersion', () => {
    it('reads the latest version from the registry', async () => {
        const registry = await startRegistry(respondWith(200, JSON.stringify({ version: '9.1.0' })));
        assert.equal(await fetchLatestVersion('cherrypick-interactive', { registry: `${registry.url}/` }), '9.1.0');
        assert.deepEqual(registry.requests, ['/cherrypick-interactive/latest']);
        await registry.close();
    });

    for (const [label, handler] of [
        ['a 404', respondWith(404, '{}')],
        ['a body that is not JSON', respondWith(200, '<html>')],
        ['a version that is not semver', respondWith(200, JSON.stringify({ version: 'latest' }))],
        ['no response within the timeout', () => {}],
    ]) {
        it(`returns null on ${label}`, async () => {
            const registry = await startRegistry(handler);
            assert.equal(
                await fetchLatestVersion('cherrypick-interactive', { registry: registry.url, timeoutMs: 200 }),
                null,
            );
            await registry.close();
        });
    }

    it('returns null when the registry is unreachable', async () => {
        const registry = await startRegistry(() => {});
        const { url } = registry;
        await registry.close();
        assert.equal(await fetchLatestVersion('cherrypick-interactive', { registry: url }), null);
    });
});

describe('checkForUpdate', () => {
    function fakes({ latest, confirmed = false, installFails = false }) {
        const calls = { notice: [], confirm: [], install: [] };
        return {
            calls,
            deps: {
                current: '2.2.0',
                fetchLatest: async () => latest,
                confirm: async (v) => {
                    calls.confirm.push(v);
                    return confirmed;
                },
                install: async (v) => {
                    calls.install.push(v);
                    if (installFails) throw new Error('npm failed');
                },
                log: { notice: (current, next) => calls.notice.push([current, next]) },
            },
        };
    }

    it('asks before installing a newer version', async () => {
        const { calls, deps } = fakes({ latest: '2.3.0', confirmed: true });
        assert.equal((await checkForUpdate(deps)).status, 'updated');
        assert.deepEqual(calls.notice, [['2.2.0', '2.3.0']]);
        assert.deepEqual(calls.confirm, ['2.3.0']);
        assert.deepEqual(calls.install, ['2.3.0']);
    });

    it('does not install when the user declines', async () => {
        const { calls, deps } = fakes({ latest: '2.3.0', confirmed: false });
        assert.equal((await checkForUpdate(deps)).status, 'declined');
        assert.deepEqual(calls.install, []);
    });

    it('reports a failed install instead of throwing', async () => {
        const { deps } = fakes({ latest: '2.3.0', confirmed: true, installFails: true });
        assert.equal((await checkForUpdate(deps)).status, 'failed');
    });

    for (const latest of ['2.2.0', '2.1.9', null]) {
        it(`stays quiet when the registry reports ${latest}`, async () => {
            const { calls, deps } = fakes({ latest, confirmed: true });
            assert.equal((await checkForUpdate(deps)).status, 'up-to-date');
            assert.deepEqual(calls, { notice: [], confirm: [], install: [] });
        });
    }
});

describe('Startup update check outside a terminal', () => {
    let registry;
    let dir;

    before(async () => {
        registry = await startRegistry(respondWith(200, JSON.stringify({ version: '99.0.0' })));
        dir = await mkdtemp(join(tmpdir(), 'cherrypick-update-'));
        await exec('git', ['init', '-q'], { cwd: dir });
    });

    after(async () => {
        await registry.close();
        await rm(dir, { recursive: true, force: true });
    });

    async function run(args, envOverrides = {}) {
        const env = { ...process.env, npm_config_registry: registry.url, ...envOverrides };
        for (const key of ['CI', 'CONTINUOUS_INTEGRATION', 'NO_UPDATE_NOTIFIER', 'NODE_ENV']) {
            if (!(key in envOverrides)) delete env[key];
        }
        registry.requests.length = 0;
        const { stdout } = await exec('node', [CLI, ...args], { cwd: dir, env, timeout: 15000 });
        return stdout;
    }

    it('prints the notice and the install command without prompting', async () => {
        const stdout = await run(['--list-profiles']);
        assert.ok(stdout.includes('A new version is available'), `got:\n${stdout}`);
        assert.ok(stdout.includes('Update with: npm i -g cherrypick-interactive'), `got:\n${stdout}`);
        assert.ok(!stdout.includes('Update to 99.0.0 now?'), `got:\n${stdout}`);
    });

    it('skips the check when saving a profile', async () => {
        const stdout = await run(['--save-profile', 'p', '--dev', 'origin/dev']);
        assert.equal(stdout.trim(), '✓ Profile "p" saved in .cherrypickrc.json');
        assert.deepEqual(registry.requests, []);
    });

    for (const [label, args, env] of [
        ['CI is set', ['--list-profiles'], { CI: 'true' }],
        ['CONTINUOUS_INTEGRATION is set', ['--list-profiles'], { CONTINUOUS_INTEGRATION: '1' }],
        ['NO_UPDATE_NOTIFIER is set', ['--list-profiles'], { NO_UPDATE_NOTIFIER: '' }],
        ['NODE_ENV is test', ['--list-profiles'], { NODE_ENV: 'test' }],
        ['--no-update-notifier is passed', ['--list-profiles', '--no-update-notifier'], {}],
        ['--ci is passed', ['--list-profiles', '--ci'], {}],
    ]) {
        it(`skips the check when ${label}`, async () => {
            const stdout = await run(args, env);
            assert.ok(!stdout.includes('A new version is available'), `got:\n${stdout}`);
            assert.deepEqual(registry.requests, []);
        });
    }

    it('still runs the check when CI is "false"', async () => {
        const stdout = await run(['--list-profiles'], { CI: 'false' });
        assert.ok(stdout.includes('A new version is available'), `got:\n${stdout}`);
    });
});
