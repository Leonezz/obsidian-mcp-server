import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import moment from 'moment';
import { getTagsFromCache } from '../utils';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { MAX_SEARCH_RESULTS, READ_ONLY_ANNOTATIONS } from './constants';

const outputSchema = {
    results: z.array(z.object({
        path: z.string(),
        mtime: z.string(),
        tags: z.array(z.string()),
    })),
    truncated: z.boolean(),
    total: z.number(),
};

export function registerSearchNotes(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('search_notes', {
        description: 'Search for notes by time range, tags, and/or frontmatter fields. Returns a list of file paths.',
        annotations: READ_ONLY_ANNOTATIONS,
        outputSchema,
        inputSchema: {
            start_date: z.string().optional().describe('ISO date string (YYYY-MM-DD). Filter notes modified after this date.'),
            end_date: z.string().optional().describe('ISO date string. Filter notes modified before this date.'),
            tags: z.array(z.string()).optional().describe("List of tags to filter by (e.g. ['#work'])"),
            frontmatter: z.record(z.string(), z.string()).optional().describe("Filter by frontmatter fields (e.g. {\"status\": \"draft\", \"priority\": \"high\"}). All fields must match (AND logic)."),
        },
    }, tracker.track('search_notes', async ({ start_date, end_date, tags, frontmatter }) => {
        let files = plugin.app.vault.getFiles();
        files = files.filter(f => plugin.security.isAllowed(f));

        if (start_date) {
            const start = moment(start_date).valueOf();
            files = files.filter(f => f.stat.mtime >= start);
        }
        if (end_date) {
            const end = moment(end_date).valueOf();
            files = files.filter(f => f.stat.mtime <= end);
        }

        if (tags && tags.length > 0) {
            files = files.filter(f => {
                const cache = plugin.app.metadataCache.getFileCache(f);
                const fileTags = getTagsFromCache(cache);
                return tags.every(requiredTag =>
                    fileTags.some(ft => ft.startsWith(requiredTag)),
                );
            });
        }

        if (frontmatter && Object.keys(frontmatter).length > 0) {
            files = files.filter(f => {
                const cache = plugin.app.metadataCache.getFileCache(f);
                const fm = cache?.frontmatter;
                if (!fm) return false;
                return Object.entries(frontmatter).every(([key, value]) =>
                    String(fm[key] ?? '') === value,
                );
            });
        }

        const allResults = files.map(f => ({
            path: f.path,
            mtime: moment(f.stat.mtime).format(),
            tags: getTagsFromCache(plugin.app.metadataCache.getFileCache(f)),
        }));

        const limited = allResults.slice(0, MAX_SEARCH_RESULTS);
        const truncated = allResults.length > MAX_SEARCH_RESULTS;
        if (truncated) {
            logger.info('search_notes: results truncated', { total: allResults.length, returned: MAX_SEARCH_RESULTS });
        }

        const structured = { results: limited, truncated, total: allResults.length };
        const suffix = truncated ? `\n...(and ${allResults.length - MAX_SEARCH_RESULTS} more)` : '';
        return {
            structuredContent: structured,
            content: [{ type: 'text' as const, text: JSON.stringify(limited, null, 2) + suffix }],
        };
    }));
}
