import { TFolder } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { VaultOverview } from '../types';

export function registerDescribeVault(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker): void {
    mcp.registerTool('describe_vault', {
        description: 'Get an overview of the vault: name, file/folder counts, total size, file type breakdown, and tag count.',
    }, tracker.track('describe_vault', async () => {
        const allFiles = plugin.app.vault.getFiles();
        const files = allFiles.filter(f => plugin.security.isAllowed(f));

        let totalSize = 0;
        const fileTypes: Record<string, number> = {};
        for (const f of files) {
            totalSize += f.stat.size;
            const ext = f.extension ?? f.path.split('.').pop() ?? 'unknown';
            fileTypes[ext] = (fileTypes[ext] ?? 0) + 1;
        }

        let folderCount = 0;
        const countFolders = (folder: TFolder): void => {
            for (const child of folder.children) {
                if (child instanceof TFolder) {
                    folderCount++;
                    countFolders(child);
                }
            }
        };
        countFolders(plugin.app.vault.getRoot());

        // @ts-expect-error getTags() exists on metadataCache but not in type defs
        const tags: Record<string, number> = plugin.app.metadataCache.getTags();
        const tagCount = Object.keys(tags).filter(t => plugin.security.isTagAllowed(t)).length;

        const overview: VaultOverview = {
            name: plugin.app.vault.getName(),
            fileCount: files.length,
            folderCount,
            totalSizeBytes: totalSize,
            fileTypes,
            tagCount,
        };

        return { content: [{ type: 'text', text: JSON.stringify(overview, null, 2) }] };
    }));
}
