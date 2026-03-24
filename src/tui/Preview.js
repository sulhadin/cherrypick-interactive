import { Text, Box } from 'ink';
import { html } from './html.js';

export function Preview({ previewText, hash }) {
    if (!hash) {
        return html`<${Box} paddingX=${1}><${Text} color="dim">No commit highlighted</${Text}></${Box}>`;
    }

    return html`
        <${Box} flexDirection="column" paddingX=${1}>
            <${Text} color="cyan">── Preview (${hash.slice(0, 7)}) ──</${Text}>
            <${Text} color="gray">${previewText || 'Loading...'}</${Text}>
        </${Box}>
    `;
}
