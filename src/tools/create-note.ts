import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { ACCESS_DENIED_MSG, MAX_CREATE_LENGTH, WRITE_ANNOTATIONS } from './constants';

export function registerCreateNote(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('create_note', {
        description: 'Create a new note at the specified path. Fails if a file already exists at that path.',
        annotations: WRITE_ANNOTATIONS,
        inputSchema: {
            path: z.string().describe("Vault-relative path for the new note (e.g. 'Notes/NewNote.md')"),
            content: z.string()
                .max(MAX_CREATE_LENGTH, `Content exceeds maximum length of ${MAX_CREATE_LENGTH} characters`)
                .describe('Content of the note'),
        },
    }, tracker.track('create_note', async ({ path, content }) => {
        if (!plugin.security.isAllowed(path)) {
            logger.warning('create_note: access denied', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const existing = plugin.app.vault.getAbstractFileByPath(path);
        if (existing) {
            return { content: [{ type: 'text', text: `File already exists at ${path}` }], isError: true };
        }
        const parentDir = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : null;
        if (parentDir) {
            try {
                await plugin.app.vault.createFolder(parentDir);
            } catch {
                // folder may already exist — safe to ignore
            }
        }
        await plugin.app.vault.create(path, content);
        return { content: [{ type: 'text', text: `Created ${path}` }] };
    }));
}
