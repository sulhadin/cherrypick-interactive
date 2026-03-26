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
        let resolved = false;
        const settle = (val) => {
            if (!resolved) {
                resolved = true;
                resolve(val);
            }
        };

        const { unmount, waitUntilExit } = render(
            createElement(App, {
                commits,
                gitRawFn,
                devBranch,
                mainBranch,
                since,
                onDone: (selectedHashes) => {
                    settle(selectedHashes);
                },
            }),
        );

        waitUntilExit().then(() => {
            // Restore stdin so subsequent prompts (inquirer) work correctly.
            // Ink pauses stdin on unmount which causes inquirer to immediately
            // throw ExitPromptError ("Aborted by user").
            if (process.stdin.isPaused()) {
                process.stdin.resume();
            }
            // Fallback: if exited without calling onDone, resolve with empty
            settle([]);
        }).catch(() => {
            if (process.stdin.isPaused()) {
                process.stdin.resume();
            }
            settle([]);
        });
    });
}
