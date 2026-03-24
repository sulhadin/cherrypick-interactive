import { render } from 'ink';
import { createElement } from 'react';
import { App } from './App.js';

/**
 * Render the TUI commit selector.
 * @param {Array<{hash: string, subject: string}>} commits
 * @param {Function} gitRawFn
 * @param {{ devBranch: string, mainBranch: string, since: string }} options
 * @returns {Promise<string[]>} selected commit hashes
 */
export function renderCommitSelector(commits, gitRawFn, { devBranch, mainBranch, since }) {
    return new Promise((resolve) => {
        const { unmount, waitUntilExit } = render(
            createElement(App, {
                commits,
                gitRawFn,
                devBranch,
                mainBranch,
                since,
                onDone: (selectedHashes) => {
                    resolve(selectedHashes);
                },
            }),
        );

        waitUntilExit().then(() => {
            // Fallback: if exited without calling onDone, resolve with empty
            resolve([]);
        }).catch(() => {
            resolve([]);
        });
    });
}
