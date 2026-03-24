import { Text, Box } from 'ink';
import { html } from './html.js';

export function KeyBar({ isSearching, selectedCount }) {
    if (isSearching) {
        return html`
            <${Box} paddingX=${1}>
                <${Text} color="yellow">[Esc] cancel search  [Enter] confirm filter</${Text}>
            </${Box}>
        `;
    }

    return html`
        <${Box} paddingX=${1}>
            <${Text} color="dim">
                [space] toggle  [a] all  [n] none  [/] search  [d] diff  [enter] confirm (${selectedCount})  [q] quit
            </${Text}>
        </${Box}>
    `;
}
