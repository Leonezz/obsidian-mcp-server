import { TFile } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { ACCESS_DENIED_MSG, DESTRUCTIVE_ANNOTATIONS } from './constants';

export function registerDeleteNote(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('delete_note', {
        description: 'Delete a note by path.',
        annotations: DESTRUCTIVE_ANNOTATIONS,
        inputSchema: {
            path: z.string().describe("Vault-relative path of the note to delete (e.g. 'Notes/OldNote.md')"),
        },
    }, tracker.track('delete_note', async ({ path }) => {
        if (!plugin.security.isAllowed(path)) {
            logger.warning('delete_note: access denied', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        if (!plugin.security.isAllowed(file)) {
            logger.warning('delete_note: access denied by tag rule', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        await plugin.app.fileManager.trashFile(file);
        return { content: [{ type: 'text', text: `Deleted ${path}` }] };
    }));
}
