import { TFile } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import { ACCESS_DENIED_MSG } from './constants';

export function registerDeleteNote(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker): void {
    mcp.registerTool('delete_note', {
        description: 'Delete a note by path.',
        inputSchema: {
            path: z.string().describe("Vault-relative path of the note to delete (e.g. 'Notes/OldNote.md')"),
        },
    }, tracker.track('delete_note', async ({ path }) => {
        if (!plugin.security.isAllowed(path)) {
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        if (!plugin.security.isAllowed(file)) {
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        await plugin.app.vault.delete(file);
        return { content: [{ type: 'text', text: `Deleted ${path}` }] };
    }));
}
