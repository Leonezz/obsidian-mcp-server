import { TFile } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDailyNote, createDailyNote, getAllDailyNotes } from 'obsidian-daily-notes-interface';
import moment from 'moment';
import type McpPlugin from '../main';
import { ACCESS_DENIED_MSG, MAX_APPEND_LENGTH } from './constants';

export function registerAppendDailyNote(mcp: McpServer, plugin: McpPlugin): void {
    mcp.registerTool('append_daily_note', {
        description: "Append text to today's daily note.",
        inputSchema: {
            text: z.string()
                .max(MAX_APPEND_LENGTH, `Text exceeds maximum length of ${MAX_APPEND_LENGTH} characters`)
                .describe('Text to append'),
        },
    }, async ({ text }) => {
        const dailyNotes = getAllDailyNotes();
        const now = moment();
        let file = getDailyNote(now, dailyNotes);
        if (!file) {
            file = await createDailyNote(now);
        }
        if (!(file instanceof TFile)) {
            return { content: [{ type: 'text', text: 'Failed to resolve daily note.' }], isError: true };
        }
        if (!plugin.security.isAllowed(file)) {
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const existing = await plugin.app.vault.read(file);
        await plugin.app.vault.modify(file, existing + '\n' + text);
        return { content: [{ type: 'text', text: `Appended to ${file.path}` }] };
    });
}
