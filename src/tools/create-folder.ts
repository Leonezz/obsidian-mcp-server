import { TFolder } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { ACCESS_DENIED_MSG, WRITE_ANNOTATIONS } from './constants';

export function registerCreateFolder(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('create_folder', {
        description: 'Create a new folder at the specified path. Creates intermediate folders if needed (like mkdir -p).',
        annotations: WRITE_ANNOTATIONS,
        inputSchema: {
            path: z.string().describe("Vault-relative folder path (e.g. 'Projects/SerialMan/Research')"),
        },
    }, tracker.track('create_folder', async ({ path }) => {
        if (!plugin.security.isAllowed(path)) {
            logger.warning('create_folder: access denied', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const existing = plugin.app.vault.getAbstractFileByPath(path);
        if (existing instanceof TFolder) {
            return { content: [{ type: 'text', text: `Folder already exists at ${path}` }] };
        }
        if (existing) {
            return { content: [{ type: 'text', text: `A file already exists at ${path}` }], isError: true };
        }
        await plugin.app.vault.createFolder(path);
        return { content: [{ type: 'text', text: `Created folder ${path}` }] };
    }));
}
