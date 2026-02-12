import { TFolder } from 'obsidian';
import type McpPlugin from './main';

export function buildInstructions(plugin: McpPlugin): string {
    if (!plugin.settings.enableInstructions) return '';

    const sections: string[] = [];

    const vaultName = plugin.app.vault.getName();
    sections.push(`You are connected to the Obsidian vault "${vaultName}" via the Obsidian MCP Server.`);

    sections.push(
        'Obsidian Markdown Basics:',
        '- Internal links: [[Page Name]] or [[Page Name|Display Text]]',
        '- Embeds: ![[Page Name]] or ![[image.png]]',
        '- Tags: #tag or nested #tag/subtag (also in frontmatter as tags: [tag1, tag2])',
        '- Frontmatter: YAML block between --- at the top of a note',
        '- Callouts: > [!type] Title followed by content',
        '- Headings: # to ###### for levels 1-6',
    );

    sections.push(
        'Tool Usage Guidelines:',
        '- Always read a note before editing it to avoid overwriting content.',
        '- Respect "Access denied" responses — do not retry denied paths.',
        '- Use search_notes or search_content to discover notes before reading them.',
        '- Prefer get_note_metadata over read_note when you only need structure info.',
        '- Use list_all_tags to understand the vault\'s tagging taxonomy.',
    );

    if (plugin.settings.includeVaultStructure) {
        const root = plugin.app.vault.getRoot();
        const topFolders = root.children
            .filter((c): c is TFolder => c instanceof TFolder)
            .map(f => f.name)
            .sort();
        if (topFolders.length > 0) {
            sections.push(`Top-level folders: ${topFolders.join(', ')}`);
        }
    }

    if (plugin.settings.customInstructions.trim()) {
        sections.push(`Custom Instructions:\n${plugin.settings.customInstructions.trim()}`);
    }

    return sections.join('\n\n');
}
