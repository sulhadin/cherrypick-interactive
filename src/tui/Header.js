import { Text, Box } from 'ink';
import { html } from './html.js';

export function Header({ devBranch, mainBranch, commitCount, since }) {
    return html`
        <${Box} borderStyle="single" borderColor="cyan" paddingX=${1}>
            <${Text} color="cyan">${devBranch} → ${mainBranch}</${Text}>
            <${Text}>  │  </${Text}>
            <${Text} color="yellow">${commitCount} missing</${Text}>
            <${Text}>  │  </${Text}>
            <${Text} color="gray">Since: ${since}</${Text}>
        </${Box}>
    `;
}
