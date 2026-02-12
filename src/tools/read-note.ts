import { TFile } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { generateNoteAnnotations } from '../annotations';
import { ACCESS_DENIED_MSG, READ_ONLY_ANNOTATIONS } from './constants';

export function registerReadNote(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('read_note', {
        description: 'Read a note by path.',
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
            path: z.string().describe("Vault-relative path (e.g. 'Notes/Meeting.md')"),
        },
    }, tracker.track('read_note', async ({ path }) => {
        if (!plugin.security.isAllowed(path)) {
            logger.warning('read_note: access denied', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            logger.warning('read_note: file not found', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        if (!plugin.security.isAllowed(file)) {
            logger.warning('read_note: access denied by tag rule', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const content = await plugin.app.vault.read(file);
        const annotations = generateNoteAnnotations(plugin, file, content);
        return { content: [{ type: 'text' as const, text: content }, ...annotations] };
    }));
}
