import { useState, useEffect, useCallback } from 'react';
import { Text, Box, useInput, useApp } from 'ink';
import { html } from './html.js';
import { Header } from './Header.js';
import { CommitList } from './CommitList.js';
import { Preview } from './Preview.js';
import { KeyBar } from './KeyBar.js';

export function App({ commits, gitRawFn, devBranch, mainBranch, since, onDone }) {
    const { exit } = useApp();
    const [cursorIndex, setCursorIndex] = useState(0);
    const [selected, setSelected] = useState(new Set());
    const [previewText, setPreviewText] = useState('');
    const [filterText, setFilterText] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchInput, setSearchInput] = useState('');
    const [showDiff, setShowDiff] = useState(false);
    const [diffText, setDiffText] = useState('');
    const [confirmQuit, setConfirmQuit] = useState(false);

    const filtered = filterText
        ? commits.filter((c) => c.subject.toLowerCase().includes(filterText.toLowerCase()))
        : commits;

    const currentCommit = filtered[cursorIndex];

    // Load preview for current commit
    useEffect(() => {
        if (!currentCommit) return;
        let cancelled = false;
        gitRawFn(['show', '--stat', '--format=', currentCommit.hash]).then((text) => {
            if (!cancelled) setPreviewText(text.trim());
        }).catch(() => {
            if (!cancelled) setPreviewText('(unable to load preview)');
        });
        return () => { cancelled = true; };
    }, [currentCommit?.hash, gitRawFn]);

    useInput((input, key) => {
        // Confirm quit dialog
        if (confirmQuit) {
            if (input === 'y' || input === 'Y') {
                onDone([]);
                exit();
            } else {
                setConfirmQuit(false);
            }
            return;
        }

        // Diff overlay
        if (showDiff) {
            if (key.escape) setShowDiff(false);
            return;
        }

        // Search mode
        if (isSearching) {
            if (key.escape) {
                setIsSearching(false);
                setSearchInput('');
            } else if (key.return) {
                setFilterText(searchInput);
                setIsSearching(false);
                setCursorIndex(0);
            } else if (key.backspace || key.delete) {
                setSearchInput((s) => s.slice(0, -1));
            } else if (input && !key.ctrl && !key.meta) {
                setSearchInput((s) => s + input);
            }
            return;
        }

        // Navigation
        if (key.upArrow || input === 'k') {
            setCursorIndex((i) => Math.max(0, i - 1));
        } else if (key.downArrow || input === 'j') {
            setCursorIndex((i) => Math.min(filtered.length - 1, i + 1));
        }

        // Toggle selection
        else if (input === ' ') {
            if (currentCommit) {
                setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(currentCommit.hash)) {
                        next.delete(currentCommit.hash);
                    } else {
                        next.add(currentCommit.hash);
                    }
                    return next;
                });
            }
        }

        // Select all
        else if (input === 'a') {
            setSelected(new Set(filtered.map((c) => c.hash)));
        }

        // Deselect all
        else if (input === 'n') {
            setSelected(new Set());
        }

        // Search
        else if (input === '/') {
            setIsSearching(true);
            setSearchInput('');
        }

        // Diff
        else if (input === 'd') {
            if (currentCommit) {
                setShowDiff(true);
                setDiffText('Loading...');
                gitRawFn(['show', '--stat', '-p', currentCommit.hash]).then((text) => {
                    setDiffText(text.trim());
                }).catch(() => {
                    setDiffText('(unable to load diff)');
                });
            }
        }

        // Confirm
        else if (key.return) {
            const selectedHashes = [...selected];
            onDone(selectedHashes);
            exit();
        }

        // Quit
        else if (input === 'q') {
            if (selected.size > 0) {
                setConfirmQuit(true);
            } else {
                onDone([]);
                exit();
            }
        }
    });

    // Confirm quit dialog
    if (confirmQuit) {
        return html`
            <${Box} flexDirection="column" padding=${1}>
                <${Text} color="yellow">You have ${selected.size} commit(s) selected. Quit without cherry-picking?</${Text}>
                <${Text} color="dim">Press y to quit, any other key to cancel.</${Text}>
            </${Box}>
        `;
    }

    // Diff overlay
    if (showDiff) {
        const maxLines = (process.stdout.rows || 24) - 4;
        const lines = diffText.split('\n').slice(0, maxLines).join('\n');
        return html`
            <${Box} flexDirection="column" padding=${1}>
                <${Text} color="cyan">── Full Diff (press Esc to return) ──</${Text}>
                <${Text}>${lines}</${Text}>
            </${Box}>
        `;
    }

    return html`
        <${Box} flexDirection="column">
            <${Header}
                devBranch=${devBranch}
                mainBranch=${mainBranch}
                commitCount=${filtered.length}
                since=${since}
            />
            ${isSearching
                ? html`<${Box} paddingX=${1}><${Text} color="yellow">Search: ${searchInput}_</${Text}></${Box}>`
                : filterText
                    ? html`<${Box} paddingX=${1}><${Text} color="yellow">Filtered: "${filterText}" (${filtered.length} results)</${Text}></${Box}>`
                    : null
            }
            <${CommitList}
                commits=${commits}
                selected=${selected}
                cursorIndex=${cursorIndex}
                filterText=${filterText}
            />
            <${KeyBar}
                isSearching=${isSearching}
                selectedCount=${selected.size}
            />
            <${Preview}
                previewText=${previewText}
                hash=${currentCommit?.hash}
            />
        </${Box}>
    `;
}
