import { TFile } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { ACCESS_DENIED_MSG, MAX_APPEND_LENGTH, WRITE_ANNOTATIONS } from './constants';

export function registerAppendNote(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('append_note', {
        description: 'Append text to an existing note. Adds content to the end (or beginning with mode "prepend") without replacing the note.',
        annotations: WRITE_ANNOTATIONS,
        inputSchema: {
            path: z.string().describe("Vault-relative path (e.g. 'Notes/Meeting.md')"),
            content: z.string()
                .max(MAX_APPEND_LENGTH, `Content exceeds maximum length of ${MAX_APPEND_LENGTH} characters`)
                .describe('Content to append (or prepend)'),
            mode: z.enum(['append', 'prepend']).default('append')
                .describe('Whether to add content at the end (append) or beginning (prepend) of the note'),
        },
    }, tracker.track('append_note', async ({ path, content, mode }) => {
        if (!plugin.security.isAllowed(path)) {
            logger.warning('append_note: access denied', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        if (!plugin.security.isAllowed(file)) {
            logger.warning('append_note: access denied by tag rule', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const existing = await plugin.app.vault.read(file);
        const newContent = mode === 'prepend'
            ? content + '\n' + existing
            : existing + '\n' + content;
        await plugin.app.vault.modify(file, newContent);
        const verb = mode === 'prepend' ? 'Prepended to' : 'Appended to';
        return { content: [{ type: 'text', text: `${verb} ${path}` }] };
    }));
}
