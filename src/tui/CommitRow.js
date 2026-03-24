import { Text, Box } from 'ink';
import { html } from './html.js';

export function CommitRow({ hash, subject, date, isSelected, isCursor }) {
    const checkbox = isSelected ? '☑' : '☐';
    const checkColor = isSelected ? 'green' : 'gray';
    const cursor = isCursor ? '>' : ' ';

    let subjectColor = 'gray';
    let hashColor = 'dim';
    let dateColor = 'dim';
    if (isCursor) {
        subjectColor = 'white';
        hashColor = 'cyan';
        dateColor = 'gray';
    } else if (isSelected) {
        subjectColor = 'green';
        hashColor = 'green';
        dateColor = 'green';
    }

    return html`
        <${Box}>
            <${Text} color=${isCursor ? 'cyan' : undefined}>${cursor} </${Text}>
            <${Text} color=${checkColor}>${checkbox} </${Text}>
            <${Text} color=${hashColor}>${hash.slice(0, 7)}  </${Text}>
            <${Text} color=${subjectColor}>${subject}</${Text}>
            <${Text} color=${dateColor}>${date ? `  (${date})` : ''}</${Text}>
        </${Box}>
    `;
}
