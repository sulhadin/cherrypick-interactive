import { Text, Box } from 'ink';
import { html } from './html.js';

export function Header({ devBranch, mainBranch, commitCount, since }) {
    return html`
        <${Box} paddingX=${1}>
            <${Text} color="cyan" bold>${devBranch} → ${mainBranch}</${Text}>
            <${Text} color="gray">  |  </${Text}>
            <${Text} color="yellow">${commitCount} missing</${Text}>
            <${Text} color="gray">  |  </${Text}>
            <${Text} color="gray">Since: ${since}</${Text}>
        </${Box}>
    `;
}
