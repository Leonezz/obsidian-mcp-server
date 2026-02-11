import { TFile } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import { ACCESS_DENIED_MSG } from './constants';

export function registerReadNote(mcp: McpServer, plugin: McpPlugin): void {
    mcp.registerTool('read_note', {
        description: 'Read a note by path.',
        inputSchema: {
            path: z.string().describe("Vault-relative path (e.g. 'Notes/Meeting.md')"),
        },
    }, async ({ path }) => {
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
        const content = await plugin.app.vault.read(file);
        return { content: [{ type: 'text', text: content }] };
    });
}
