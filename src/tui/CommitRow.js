import { Text, Box, Spacer } from 'ink';
import { html } from './html.js';

export function CommitRow({ hash, subject, date, isSelected, isCursor }) {
    const checkbox = isSelected ? '☑' : '☐';
    const checkColor = isSelected ? 'green' : 'gray';
    const cursor = isCursor ? '>' : ' ';
    const cursorColor = isCursor ? 'cyan' : undefined;
    const subjectColor = isCursor ? 'white' : 'gray';

    return html`
        <${Box}>
            <${Text} color=${cursorColor}>${cursor} </${Text}>
            <${Text} color=${checkColor}>${checkbox} </${Text}>
            <${Text} color="dim">${hash.slice(0, 7)}  </${Text}>
            <${Text} color=${subjectColor} wrap="truncate">${subject}</${Text}>
            <${Spacer} />
            <${Text} color="dim">${date}</${Text}>
        </${Box}>
    `;
}
