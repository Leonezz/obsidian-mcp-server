import { TFile, TFolder } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import type { FileInfo } from '../types';
import { ACCESS_DENIED_MSG, READ_ONLY_ANNOTATIONS } from './constants';

const outputSchema = {
    items: z.array(z.object({
        name: z.string(),
        path: z.string(),
        type: z.enum(['file', 'folder']),
    })),
};

function collectChildren(
    folder: TFolder,
    security: { isAllowed: (p: string) => boolean },
    recursive: boolean,
    maxDepth: number,
    currentDepth: number,
): FileInfo[] {
    const items: FileInfo[] = [];
    for (const child of folder.children) {
        if (!security.isAllowed(child.path)) continue;
        const isFolder = child instanceof TFolder;
        items.push({
            name: child.name,
            path: child.path,
            type: isFolder ? 'folder' as const : 'file' as const,
        });
        if (recursive && isFolder && currentDepth < maxDepth) {
            items.push(...collectChildren(child as TFolder, security, recursive, maxDepth, currentDepth + 1));
        }
    }
    return items;
}

export function registerListFolder(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('list_folder', {
        description: 'List files and folders inside a specific directory. Supports sorting, file type filtering, and recursive listing.',
        annotations: READ_ONLY_ANNOTATIONS,
        outputSchema,
        inputSchema: {
            path: z.string().default('/').describe('Directory path (default: root)'),
            sort_by: z.enum(['name', 'modified', 'created', 'size']).optional().describe('Sort results by this field'),
            sort_order: z.enum(['asc', 'desc']).default('asc').describe('Sort direction (default: asc)'),
            file_types: z.array(z.string()).optional().describe("Filter to files with these extensions (e.g. ['.md']). Folders are always included."),
            recursive: z.boolean().default(false).describe('List contents of subdirectories recursively'),
            depth: z.number().int().min(1).optional().describe('Max recursion depth (only when recursive=true). Default: unlimited.'),
        },
    }, tracker.track('list_folder', async ({ path, sort_by, sort_order, file_types, recursive, depth }) => {
        if (!plugin.security.isAllowed(path)) {
            logger.warning('list_folder: access denied', { path });
            return { content: [{ type: 'text' as const, text: ACCESS_DENIED_MSG }], isError: true };
        }
        const folder = path === '/'
            ? plugin.app.vault.getRoot()
            : plugin.app.vault.getAbstractFileByPath(path);
        if (!(folder instanceof TFolder)) {
            return { content: [{ type: 'text' as const, text: ACCESS_DENIED_MSG }], isError: true };
        }

        const maxDepth = recursive ? (depth ?? Infinity) : 1;
        let items = collectChildren(folder, plugin.security, recursive, maxDepth, 1);

        // Filter by file types (folders always pass)
        if (file_types && file_types.length > 0) {
            items = items.filter(item =>
                item.type === 'folder' || file_types.some(ext => item.name.endsWith(ext)),
            );
        }

        // Sort
        if (sort_by) {
            items.sort((a, b) => {
                let cmp = 0;
                if (sort_by === 'name') {
                    cmp = a.name.localeCompare(b.name);
                } else {
                    // For modified/created/size, look up file stats
                    const aFile = plugin.app.vault.getAbstractFileByPath(a.path);
                    const bFile = plugin.app.vault.getAbstractFileByPath(b.path);
                    const aStat = aFile instanceof TFile ? aFile.stat : null;
                    const bStat = bFile instanceof TFile ? bFile.stat : null;
                    if (sort_by === 'modified') {
                        cmp = (aStat?.mtime ?? 0) - (bStat?.mtime ?? 0);
                    } else if (sort_by === 'created') {
                        cmp = (aStat?.ctime ?? 0) - (bStat?.ctime ?? 0);
                    } else if (sort_by === 'size') {
                        cmp = (aStat?.size ?? 0) - (bStat?.size ?? 0);
                    }
                }
                return sort_order === 'desc' ? -cmp : cmp;
            });
        }

        return {
            structuredContent: { items },
            content: [{ type: 'text' as const, text: JSON.stringify(items, null, 2) }],
        };
    }));
}
