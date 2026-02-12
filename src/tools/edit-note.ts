import { TFile } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { ACCESS_DENIED_MSG, MAX_EDIT_LENGTH, WRITE_IDEMPOTENT_ANNOTATIONS } from './constants';

export function registerEditNote(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('edit_note', {
        description: 'Replace the entire content of an existing note.',
        annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
        inputSchema: {
            path: z.string().describe("Vault-relative path of the note to edit (e.g. 'Notes/Meeting.md')"),
            content: z.string()
                .max(MAX_EDIT_LENGTH, `Content exceeds maximum length of ${MAX_EDIT_LENGTH} characters`)
                .describe('New content to replace the existing content'),
        },
    }, tracker.track('edit_note', async ({ path, content }) => {
        if (!plugin.security.isAllowed(path)) {
            logger.warning('edit_note: access denied', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        if (!plugin.security.isAllowed(file)) {
            logger.warning('edit_note: access denied by tag rule', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        await plugin.app.vault.modify(file, content);
        return { content: [{ type: 'text', text: `Updated ${path}` }] };
    }));
}
