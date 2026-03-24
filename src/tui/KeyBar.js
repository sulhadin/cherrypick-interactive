import { Text, Box } from 'ink';
import { html } from './html.js';

function Key({ k, label }) {
    return html`<${Text}><${Text} color="cyan" bold>[${k}]</${Text}><${Text} color="gray"> ${label}  </${Text}></${Text}>`;
}

export function KeyBar({ isSearching, selectedCount }) {
    if (isSearching) {
        return html`
            <${Box} paddingX=${1}>
                <${Key} k="Esc" label="cancel" />
                <${Key} k="Enter" label="confirm filter" />
            </${Box}>
        `;
    }

    return html`
        <${Box} paddingX=${1} flexWrap="wrap">
            <${Key} k="space" label="toggle" />
            <${Key} k="a" label="all" />
            <${Key} k="n" label="none" />
            <${Key} k="/" label="search" />
            <${Key} k="d" label="diff" />
            <${Key} k="p" label="preview" />
            <${Text}><${Text} color="green" bold>[enter]</${Text}><${Text} color="gray"> confirm (${selectedCount})  </${Text}></${Text}>
            <${Text}><${Text} color="red" bold>[q]</${Text}><${Text} color="gray"> quit</${Text}></${Text}>
        </${Box}>
    `;
}
