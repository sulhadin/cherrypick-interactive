import { render } from 'ink';
import { createElement } from 'react';
import { App } from './App.js';

/**
 * Restore process.stdin after ink unmount.
 * Ink sets stdin.setRawMode(false) and stdin.unref() on cleanup (App.js),
 * which causes subsequent inquirer prompts to immediately throw
 * ExitPromptError ("Aborted by user") because the event loop stops
 * waiting for stdin input.
 */
function restoreStdin() {
    const { stdin } = process;
    // Strip listeners ink attached so inquirer's readline can own stdin.
    stdin.removeAllListeners('data');
    stdin.removeAllListeners('keypress');
    stdin.removeAllListeners('readable');
    if (typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(false);
    }
    // Keep the event loop alive; ink called unref() on cleanup.
    stdin.ref();
    // Pause so inquirer can re-enter raw mode cleanly on the next prompt.
    stdin.pause();
}

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
            restoreStdin();
            // Fallback: if exited without calling onDone, resolve with empty
            settle([]);
        }).catch(() => {
            restoreStdin();
            settle([]);
        });
    });
}
