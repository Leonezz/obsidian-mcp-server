import { TFile } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import moment from 'moment';
import { getTagsFromCache } from '../utils';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { ACCESS_DENIED_MSG, READ_ONLY_ANNOTATIONS } from './constants';

const outputSchema = {
    path: z.string(),
    name: z.string(),
    createdAt: z.string(),
    modifiedAt: z.string(),
    sizeBytes: z.number(),
    frontmatter: z.record(z.unknown()),
    tags: z.array(z.string()),
    headings: z.array(z.object({ level: z.number(), heading: z.string() })),
    links: z.array(z.string()),
};

export function registerGetNoteMetadata(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('get_note_metadata', {
        description: 'Get metadata of a note (frontmatter, tags, headings, links) without its full content.',
        annotations: READ_ONLY_ANNOTATIONS,
        outputSchema,
        inputSchema: {
            path: z.string().describe("Vault-relative path (e.g. 'Notes/Meeting.md')"),
        },
    }, tracker.track('get_note_metadata', async ({ path }) => {
        if (!plugin.security.isAllowed(path)) {
            logger.warning('get_note_metadata: access denied', { path });
            return { content: [{ type: 'text' as const, text: ACCESS_DENIED_MSG }], isError: true };
        }
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            return { content: [{ type: 'text' as const, text: ACCESS_DENIED_MSG }], isError: true };
        }
        if (!plugin.security.isAllowed(file)) {
            logger.warning('get_note_metadata: access denied by tag rule', { path });
            return { content: [{ type: 'text' as const, text: ACCESS_DENIED_MSG }], isError: true };
        }
        const cache = plugin.app.metadataCache.getFileCache(file);
        const result = {
            path: file.path,
            name: file.name,
            createdAt: moment(file.stat.ctime).format(),
            modifiedAt: moment(file.stat.mtime).format(),
            sizeBytes: file.stat.size,
            frontmatter: cache?.frontmatter ?? {},
            tags: getTagsFromCache(cache),
            headings: (cache?.headings ?? []).map(h => ({ level: h.level, heading: h.heading })),
            links: (cache?.links ?? []).map(l => l.link),
        };
        return {
            structuredContent: result,
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
    }));
}
