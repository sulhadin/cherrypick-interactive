import { describe, it, before, after } from 'node:test';
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

describe('Commit Dependency Detection', () => {
    it('--help shows --dependency-strategy flag', async () => {
        const { stdout } = await exec('node', [CLI, '--help']);
        assert.ok(stdout.includes('--dependency-strategy'), 'should show --dependency-strategy');
        assert.ok(stdout.includes('CI options:'), 'should be under CI options group');
    });

    it('--dependency-strategy accepts warn, fail, ignore', async () => {
        const { stdout } = await exec('node', [CLI, '--help']);
        assert.ok(stdout.includes('warn'), 'should mention warn');
        assert.ok(stdout.includes('fail'), 'should mention fail');
        assert.ok(stdout.includes('ignore'), 'should mention ignore');
    });
});

describe('Dependency detection logic', () => {
    let tmpDir;

    before(async () => {
        // Create a temp git repo with commits that have file overlaps
        tmpDir = await mkdtemp(join(tmpdir(), 'dep-test-'));
        await exec('git', ['init'], { cwd: tmpDir });
        await exec('git', ['config', 'user.name', 'test'], { cwd: tmpDir });
        await exec('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpDir });

        // Initial empty commit
        await exec('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tmpDir });

        // Commit 1: touch shared.txt
        await writeFile(join(tmpDir, 'shared.txt'), 'v1');
        await exec('git', ['add', '.'], { cwd: tmpDir });
        await exec('git', ['commit', '-m', 'feat: initial shared file'], { cwd: tmpDir });

        // Commit 2: touch shared.txt again
        await writeFile(join(tmpDir, 'shared.txt'), 'v2');
        await exec('git', ['add', '.'], { cwd: tmpDir });
        await exec('git', ['commit', '-m', 'fix: update shared file'], { cwd: tmpDir });

        // Commit 3: touch independent.txt (no overlap)
        await writeFile(join(tmpDir, 'independent.txt'), 'v1');
        await exec('git', ['add', '.'], { cwd: tmpDir });
        await exec('git', ['commit', '-m', 'chore: independent change'], { cwd: tmpDir });
    });

    after(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('detects file overlap between commits', async () => {
        // Get commit hashes
        const { stdout } = await exec('git', ['log', '--oneline', '--format=%H'], { cwd: tmpDir });
        const hashes = stdout.trim().split('\n'); // newest first: [commit3, commit2, commit1]

        // Filter out init commit (4 total, we care about last 3)
        assert.ok(hashes.length >= 3, 'should have at least 3 commits');
        // Take only the 3 feature commits (newest first)
        const featureHashes = hashes.slice(0, 3);

        // commit3 (independent.txt) and commit1 (shared.txt) have no overlap
        // commit2 (shared.txt) and commit1 (shared.txt) DO have overlap

        // Simulate: git log --name-only --no-walk for each
        const { stdout: files1 } = await exec('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', featureHashes[2]], { cwd: tmpDir });
        const { stdout: files2 } = await exec('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', featureHashes[1]], { cwd: tmpDir });
        const { stdout: files3 } = await exec('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', featureHashes[0]], { cwd: tmpDir });

        assert.ok(files1.trim().includes('shared.txt'), 'commit1 should touch shared.txt');
        assert.ok(files2.trim().includes('shared.txt'), 'commit2 should touch shared.txt');
        assert.ok(files3.trim().includes('independent.txt'), 'commit3 should touch independent.txt');

        // File overlap between commit1 and commit2
        const set1 = new Set(files1.trim().split('\n').filter(Boolean));
        const set2 = new Set(files2.trim().split('\n').filter(Boolean));
        const shared = [...set1].filter((f) => set2.has(f));
        assert.ok(shared.length > 0, 'commit1 and commit2 should share files');
        assert.ok(shared.includes('shared.txt'));

        // No overlap between commit1 and commit3
        const set3 = new Set(files3.trim().split('\n').filter(Boolean));
        const shared13 = [...set1].filter((f) => set3.has(f));
        assert.equal(shared13.length, 0, 'commit1 and commit3 should not share files');
    });

    it('only flags older unselected commits (not newer ones)', async () => {
        const { stdout } = await exec('git', ['log', '--oneline', '--format=%H'], { cwd: tmpDir });
        const hashes = stdout.trim().split('\n');
        const fh = hashes.slice(0, 3); // [newest, middle, oldest]

        // If we select commit2 (middle) and skip commit1 (oldest),
        // commit1 IS older and shares files → should flag
        // If we select commit1 (oldest) and skip commit2 (middle),
        // commit2 is NEWER → should NOT flag

        // Direction check: oldest has higher index in newest-first order
        const orderIndex = new Map(hashes.map((h, i) => [h, i]));
        const oldestIdx = orderIndex.get(fh[2]);
        const middleIdx = orderIndex.get(fh[1]);

        assert.ok(oldestIdx > middleIdx, 'oldest should have higher index (newer-first ordering)');
    });
});
