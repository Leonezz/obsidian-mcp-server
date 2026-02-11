import { TFile } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import moment from 'moment';
import { getTagsFromCache } from '../utils';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { NoteMetadata } from '../types';
import { ACCESS_DENIED_MSG } from './constants';

export function registerGetNoteMetadata(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker): void {
    mcp.registerTool('get_note_metadata', {
        description: 'Get metadata of a note (frontmatter, tags, headings, links) without its full content.',
        inputSchema: {
            path: z.string().describe("Vault-relative path (e.g. 'Notes/Meeting.md')"),
        },
    }, tracker.track('get_note_metadata', async ({ path }) => {
        if (!plugin.security.isAllowed(path)) {
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        if (!plugin.security.isAllowed(file)) {
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const cache = plugin.app.metadataCache.getFileCache(file);
        const result: NoteMetadata = {
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
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }));
}
