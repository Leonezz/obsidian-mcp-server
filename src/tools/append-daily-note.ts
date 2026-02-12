import { TFile } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDailyNote, createDailyNote, getAllDailyNotes } from 'obsidian-daily-notes-interface';
import moment from 'moment';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { ACCESS_DENIED_MSG, MAX_APPEND_LENGTH, WRITE_ANNOTATIONS } from './constants';

export function registerAppendDailyNote(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('append_daily_note', {
        description: "Append text to today's daily note.",
        annotations: WRITE_ANNOTATIONS,
        inputSchema: {
            text: z.string()
                .max(MAX_APPEND_LENGTH, `Text exceeds maximum length of ${MAX_APPEND_LENGTH} characters`)
                .describe('Text to append'),
        },
    }, tracker.track('append_daily_note', async ({ text }) => {
        const dailyNotes = getAllDailyNotes();
        const now = moment();
        let file = getDailyNote(now, dailyNotes);
        if (!file) {
            file = await createDailyNote(now);
        }
        if (!(file instanceof TFile)) {
            logger.error('append_daily_note: failed to resolve daily note');
            return { content: [{ type: 'text', text: 'Failed to resolve daily note.' }], isError: true };
        }
        if (!plugin.security.isAllowed(file)) {
            logger.warning('append_daily_note: access denied', { path: file.path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const existing = await plugin.app.vault.read(file);
        await plugin.app.vault.modify(file, existing + '\n' + text);
        return { content: [{ type: 'text', text: `Appended to ${file.path}` }] };
    }));
}
