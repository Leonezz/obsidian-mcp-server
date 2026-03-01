import { TFolder } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type McpPlugin from '../main';

export function registerStaticResources(mcp: McpServer, plugin: McpPlugin): void {
    mcp.registerResource('vault-overview', 'obsidian://vault/overview', {
        description: 'Overview of the Obsidian vault: name, file counts, folder structure, and tag summary.',
        mimeType: 'application/json',
    }, () => {
        const allFiles = plugin.app.vault.getFiles();
        const files = allFiles.filter(f => plugin.security.isAllowed(f));

        let totalSize = 0;
        const fileTypes: Record<string, number> = {};
        for (const f of files) {
            totalSize += f.stat.size;
            const ext = f.extension ?? f.path.split('.').pop() ?? 'unknown';
            fileTypes[ext] = (fileTypes[ext] ?? 0) + 1;
        }

        const root = plugin.app.vault.getRoot();
        const topFolders = root.children
            .filter((c): c is TFolder => c instanceof TFolder)
            .map(f => f.name)
            .sort();

        // @ts-expect-error getTags() exists on metadataCache but not in type defs
        const tags: Record<string, number> = plugin.app.metadataCache.getTags();
        const tagCount = Object.keys(tags).filter(t => plugin.security.isTagAllowed(t)).length;

        const overview = {
            name: plugin.app.vault.getName(),
            fileCount: files.length,
            totalSizeBytes: totalSize,
            fileTypes,
            topFolders,
            tagCount,
        };

        return {
            contents: [{
                uri: 'obsidian://vault/overview',
                mimeType: 'application/json',
                text: JSON.stringify(overview, null, 2),
            }],
        };
    });
}
