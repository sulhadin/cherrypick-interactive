import { Box } from 'ink';
import { html } from './html.js';
import { CommitRow } from './CommitRow.js';

export function CommitList({ commits, selected, cursorIndex }) {
    const maxVisible = Math.max(5, (process.stdout.rows || 24) - 12);
    const start = Math.max(0, cursorIndex - Math.floor(maxVisible / 2));
    const visible = commits.slice(start, start + maxVisible);

    return html`
        <${Box} flexDirection="column">
            ${visible.map(
                (c, i) => html`
                    <${CommitRow}
                        key=${c.hash}
                        hash=${c.hash}
                        subject=${c.subject}
                        isSelected=${selected.has(c.hash)}
                        isCursor=${start + i === cursorIndex}
                    />
                `,
            )}
            ${commits.length > maxVisible
                ? html`<${Box}><${'Text'} color="dim">  ... ${commits.length - maxVisible} more (scroll with ↑↓)</${'Text'}></${Box}>`
                : null}
        </${Box}>
    `;
}
