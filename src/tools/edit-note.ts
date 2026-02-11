import { TFile } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import { ACCESS_DENIED_MSG, MAX_EDIT_LENGTH } from './constants';

export function registerEditNote(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker): void {
    mcp.registerTool('edit_note', {
        description: 'Replace the entire content of an existing note.',
        inputSchema: {
            path: z.string().describe("Vault-relative path of the note to edit (e.g. 'Notes/Meeting.md')"),
            content: z.string()
                .max(MAX_EDIT_LENGTH, `Content exceeds maximum length of ${MAX_EDIT_LENGTH} characters`)
                .describe('New content to replace the existing content'),
        },
    }, tracker.track('edit_note', async ({ path, content }) => {
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
        await plugin.app.vault.modify(file, content);
        return { content: [{ type: 'text', text: `Updated ${path}` }] };
    }));
}
