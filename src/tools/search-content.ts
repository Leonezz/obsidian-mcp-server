import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { ACCESS_DENIED_MSG, MAX_CONTENT_SEARCH_RESULTS, MAX_SNIPPET_LENGTH, READ_ONLY_ANNOTATIONS } from './constants';
import { normalizePath } from '../utils';

const outputSchema = {
    results: z.array(z.object({
        path: z.string(),
        matches: z.array(z.object({
            line: z.number(),
            text: z.string(),
        })),
    })),
    truncated: z.boolean(),
};

export function registerSearchContent(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('search_content', {
        description: 'Search for text content across all notes. Returns matching files with line-number snippets. Case-insensitive by default; set regex=true to use a regular expression pattern. Optionally restrict to a folder.',
        annotations: READ_ONLY_ANNOTATIONS,
        outputSchema,
        inputSchema: {
            query: z.string().min(1).describe('Text to search for (case-insensitive), or a regex pattern when regex=true'),
            regex: z.boolean().default(false).describe('Treat query as a regular expression pattern'),
            folder: z.string().optional().describe("Restrict search to notes under this folder (e.g. 'Projects/')"),
        },
    }, tracker.track('search_content', async ({ query, regex, folder }) => {
        let pattern: RegExp | null = null;
        if (regex) {
            try {
                pattern = new RegExp(query, 'i');
            } catch (err) {
                return { content: [{ type: 'text' as const, text: `Invalid regex: ${String(err)}` }], isError: true };
            }
        }

        if (folder && !plugin.security.isAllowed(folder)) {
            logger.warning('search_content: access denied on folder', { folder });
            return { content: [{ type: 'text' as const, text: ACCESS_DENIED_MSG }], isError: true };
        }

        const normalizedFolder = folder ? normalizePath(folder) : null;
        const files = plugin.app.vault.getFiles()
            .filter(f => {
                if (f.extension !== 'md') return false;
                if (!plugin.security.isAllowed(f)) return false;
                if (normalizedFolder && !normalizePath(f.path).startsWith(normalizedFolder)) return false;
                return true;
            });

        const queryLower = query.toLowerCase();
        const results: Array<{ path: string; matches: Array<{ line: number; text: string }> }> = [];

        for (const file of files) {
            if (results.length >= MAX_CONTENT_SEARCH_RESULTS) break;

            const content = await plugin.app.vault.read(file);
            const lines = content.split('\n');
            const matches: Array<{ line: number; text: string }> = [];

            for (let i = 0; i < lines.length; i++) {
                const isMatch = pattern
                    ? pattern.test(lines[i])
                    : lines[i].toLowerCase().includes(queryLower);

                if (isMatch) {
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

        const truncated = results.length >= MAX_CONTENT_SEARCH_RESULTS;
        if (truncated) {
            logger.info('search_content: results truncated', { returned: MAX_CONTENT_SEARCH_RESULTS });
        }

        const structured = { results, truncated };
        const suffix = truncated
            ? `\n...(results limited to ${MAX_CONTENT_SEARCH_RESULTS} files)`
            : '';

        return {
            structuredContent: structured,
            content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) + suffix }],
        };
    }));
}
