import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import moment from 'moment';
import { getTagsFromCache } from '../utils';
import type McpPlugin from '../main';
import type { SearchResult } from '../types';
import { MAX_SEARCH_RESULTS } from './constants';

export function registerSearchNotes(mcp: McpServer, plugin: McpPlugin): void {
    mcp.registerTool('search_notes', {
        description: 'Search for notes by time range and tags. Returns a list of file paths.',
        inputSchema: {
            start_date: z.string().optional().describe('ISO date string (YYYY-MM-DD). Filter notes modified after this date.'),
            end_date: z.string().optional().describe('ISO date string. Filter notes modified before this date.'),
            tags: z.array(z.string()).optional().describe("List of tags to filter by (e.g. ['#work'])"),
        },
    }, async ({ start_date, end_date, tags }) => {
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

        const results: SearchResult[] = files.map(f => ({
            path: f.path,
            mtime: moment(f.stat.mtime).format(),
            tags: getTagsFromCache(plugin.app.metadataCache.getFileCache(f)),
        }));

        const limited = results.slice(0, MAX_SEARCH_RESULTS);
        const suffix = results.length > MAX_SEARCH_RESULTS
            ? `\n...(and ${results.length - MAX_SEARCH_RESULTS} more)`
            : '';
        return {
            content: [{ type: 'text', text: JSON.stringify(limited, null, 2) + suffix }],
        };
    });
}
