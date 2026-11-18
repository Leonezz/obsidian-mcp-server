import { TFile, normalizePath } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDailyNote, createDailyNote, getAllDailyNotes, getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { moment } from '../moment';
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
            const { folder = '', format = '', template = '' } = getDailyNoteSettings() ?? {};
            const filename = now.format(format);
            // Match the daily-notes interface without calling getNotePath(), which
            // creates parent directories as a side effect.
            const path = normalizePath([folder, filename.endsWith('.md') ? filename : `${filename}.md`]
                .join('/').split('/').filter(part => part !== '.').join('/'));
            if (!plugin.security.isAllowed(path)) {
                logger.warning('append_daily_note: access denied before creation', { path });
                return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
            }
            // A rendered template can introduce blocked tags before the new
            // file's metadata cache is available. Fail closed rather than create
            // a file and discover the denial afterwards.
            if (template && plugin.security.hasTagRules()) {
                return { content: [{ type: 'text', text: 'Cannot safely create a templated daily note while tag restrictions are active. Create it in Obsidian first and wait for indexing.' }], isError: true };
            }
            if (template) {
                const templateFile = plugin.app.metadataCache.getFirstLinkpathDest(normalizePath(template), '');
                if (!plugin.security.isAllowed(template) || (templateFile && !plugin.security.isAllowed(templateFile))) {
                    return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
                }
            }
            file = await createDailyNote(now);
        } else if (plugin.security.hasTagRules() && !plugin.app.metadataCache.getFileCache(file)) {
            return { content: [{ type: 'text', text: 'Daily note metadata is not indexed yet. Try again after Obsidian finishes indexing.' }], isError: true };
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
