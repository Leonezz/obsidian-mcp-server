import { TFolder } from 'obsidian';
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

export function registerListFolder(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('list_folder', {
        description: 'List files and folders inside a specific directory.',
        annotations: READ_ONLY_ANNOTATIONS,
        outputSchema,
        inputSchema: {
            path: z.string().default('/').describe('Directory path (default: root)'),
        },
    }, tracker.track('list_folder', async ({ path }) => {
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
        const children: FileInfo[] = folder.children
            .filter(c => plugin.security.isAllowed(c.path))
            .map(c => ({
                name: c.name,
                path: c.path,
                type: c instanceof TFolder ? 'folder' as const : 'file' as const,
            }));
        return {
            structuredContent: { items: children },
            content: [{ type: 'text' as const, text: JSON.stringify(children, null, 2) }],
        };
    }));
}
