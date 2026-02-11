import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { ContentSearchResult } from '../types';
import { MAX_CONTENT_SEARCH_RESULTS, MAX_SNIPPET_LENGTH } from './constants';

export function registerSearchContent(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker): void {
    mcp.registerTool('search_content', {
        description: 'Search for text content across all notes. Returns matching files with line-number snippets. Case-insensitive.',
        inputSchema: {
            query: z.string().min(1).describe('Text to search for (case-insensitive)'),
        },
    }, tracker.track('search_content', async ({ query }) => {
        const files = plugin.app.vault.getFiles()
            .filter(f => f.extension === 'md' && plugin.security.isAllowed(f));

        const queryLower = query.toLowerCase();
        const results: ContentSearchResult[] = [];

        for (const file of files) {
            if (results.length >= MAX_CONTENT_SEARCH_RESULTS) break;

            const content = await plugin.app.vault.read(file);
            const lines = content.split('\n');
            const matches: Array<{ line: number; text: string }> = [];

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(queryLower)) {
                    const snippet = lines[i].length > MAX_SNIPPET_LENGTH
                        ? lines[i].substring(0, MAX_SNIPPET_LENGTH) + '...'
                        : lines[i];
                    matches.push({ line: i + 1, text: snippet });
                }
            }

            if (matches.length > 0) {
                results.push({ path: file.path, matches });
            }
        }

        const suffix = results.length >= MAX_CONTENT_SEARCH_RESULTS
            ? `\n...(results limited to ${MAX_CONTENT_SEARCH_RESULTS} files)`
            : '';

        return {
            content: [{ type: 'text', text: JSON.stringify(results, null, 2) + suffix }],
        };
    }));
}
