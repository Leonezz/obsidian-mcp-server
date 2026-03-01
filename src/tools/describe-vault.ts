import { TFolder } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { READ_ONLY_ANNOTATIONS } from './constants';

const outputSchema = {
    name: z.string(),
    fileCount: z.number(),
    folderCount: z.number(),
    totalSizeBytes: z.number(),
    fileTypes: z.record(z.string(), z.number()),
    tagCount: z.number(),
};

export function registerDescribeVault(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, _logger: McpLogger): void {
    mcp.registerTool('describe_vault', {
        description: 'Get an overview of the vault: name, file/folder counts, total size, file type breakdown, and tag count.',
        annotations: READ_ONLY_ANNOTATIONS,
        outputSchema,
    }, tracker.track('describe_vault', () => {
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

        const overview = {
            name: plugin.app.vault.getName(),
            fileCount: files.length,
            folderCount,
            totalSizeBytes: totalSize,
            fileTypes,
            tagCount,
        };

        return {
            structuredContent: overview,
            content: [{ type: 'text' as const, text: JSON.stringify(overview, null, 2) }],
        };
    }));
}
