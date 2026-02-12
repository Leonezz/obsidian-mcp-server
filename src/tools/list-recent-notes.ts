import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import moment from 'moment';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { MAX_RECENT_NOTES, READ_ONLY_ANNOTATIONS } from './constants';

const outputSchema = {
    notes: z.array(z.object({
        path: z.string(),
        name: z.string(),
        modifiedAt: z.string(),
        sizeBytes: z.number(),
    })),
};

export function registerListRecentNotes(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, _logger: McpLogger): void {
    mcp.registerTool('list_recent_notes', {
        description: 'List the most recently modified markdown notes in the vault, sorted newest-first.',
        annotations: READ_ONLY_ANNOTATIONS,
        outputSchema,
        inputSchema: {
            count: z.number().int().min(1).max(MAX_RECENT_NOTES).default(10)
                .describe(`Number of recent notes to return (default: 10, max: ${MAX_RECENT_NOTES})`),
        },
    }, tracker.track('list_recent_notes', async ({ count }) => {
        const files = plugin.app.vault.getFiles()
            .filter(f => f.extension === 'md' && plugin.security.isAllowed(f));

        const sorted = [...files].sort((a, b) => b.stat.mtime - a.stat.mtime);
        const limited = sorted.slice(0, count);

        const notes = limited.map(f => ({
            path: f.path,
            name: f.name,
            modifiedAt: moment(f.stat.mtime).format(),
            sizeBytes: f.stat.size,
        }));

        return {
            structuredContent: { notes },
            content: [{ type: 'text' as const, text: JSON.stringify(notes, null, 2) }],
        };
    }));
}
