import { TFile, TFolder } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDailyNote, createDailyNote, getAllDailyNotes } from 'obsidian-daily-notes-interface';
import { getTagsFromCache } from './utils';
import type McpPlugin from './main';
import type { FileInfo, SearchResult, ActiveFileResult } from './types';

// @ts-expect-error Obsidian provides moment globally on window
const moment: typeof import('moment') = window.moment;

const ACCESS_DENIED_MSG = 'Access denied or resource not found.';
const MAX_SEARCH_RESULTS = 100;
const MAX_APPEND_LENGTH = 50000;

export function registerTools(mcp: McpServer, plugin: McpPlugin): void {
    mcp.tool(
        'get_active_file',
        'Get the content and metadata of the currently active note.',
        {},
        async () => {
            const activeFile = plugin.app.workspace.getActiveFile();
            if (!activeFile || !plugin.security.isAllowed(activeFile)) {
                return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }] };
            }
            const content = await plugin.app.vault.read(activeFile);
            const metadata = plugin.app.metadataCache.getFileCache(activeFile);
            const result: ActiveFileResult = {
                path: activeFile.path,
                frontmatter: metadata?.frontmatter ?? {},
                content,
            };
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        },
    );

    mcp.tool(
        'read_note',
        'Read a note by path.',
        { path: z.string().describe("Vault-relative path (e.g. 'Notes/Meeting.md')") },
        async ({ path }) => {
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
            const content = await plugin.app.vault.read(file);
            return { content: [{ type: 'text', text: content }] };
        },
    );

    mcp.tool(
        'append_daily_note',
        "Append text to today's daily note.",
        {
            text: z.string()
                .max(MAX_APPEND_LENGTH, `Text exceeds maximum length of ${MAX_APPEND_LENGTH} characters`)
                .describe('Text to append'),
        },
        async ({ text }) => {
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
        },
    );

    mcp.tool(
        'list_folder',
        'List files and folders inside a specific directory.',
        { path: z.string().default('/').describe('Directory path (default: root)') },
        async ({ path }) => {
            if (!plugin.security.isAllowed(path)) {
                return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
            }
            const folder = path === '/'
                ? plugin.app.vault.getRoot()
                : plugin.app.vault.getAbstractFileByPath(path);
            if (!(folder instanceof TFolder)) {
                return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
            }
            const children: FileInfo[] = folder.children
                .filter(c => plugin.security.isAllowed(c.path))
                .map(c => ({
                    name: c.name,
                    path: c.path,
                    type: c instanceof TFolder ? 'folder' : 'file',
                }));
            return { content: [{ type: 'text', text: JSON.stringify(children, null, 2) }] };
        },
    );

    mcp.tool(
        'list_all_tags',
        'List all hashtags used in the vault with their usage count.',
        {},
        async () => {
            // @ts-expect-error getTags() exists on metadataCache but not in type defs
            const tags: Record<string, number> = plugin.app.metadataCache.getTags();
            const filteredTags: Record<string, number> = {};
            for (const t in tags) {
                if (plugin.security.isTagAllowed(t)) {
                    filteredTags[t] = tags[t];
                }
            }
            return { content: [{ type: 'text', text: JSON.stringify(filteredTags, null, 2) }] };
        },
    );

    mcp.tool(
        'search_notes',
        'Search for notes by time range and tags. Returns a list of file paths.',
        {
            start_date: z.string().optional().describe('ISO date string (YYYY-MM-DD). Filter notes modified after this date.'),
            end_date: z.string().optional().describe('ISO date string. Filter notes modified before this date.'),
            tags: z.array(z.string()).optional().describe("List of tags to filter by (e.g. ['#work'])"),
        },
        async ({ start_date, end_date, tags }) => {
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
                tags: plugin.app.metadataCache.getFileCache(f)?.tags?.map(t => t.tag),
            }));

            const limited = results.slice(0, MAX_SEARCH_RESULTS);
            const suffix = results.length > MAX_SEARCH_RESULTS
                ? `\n...(and ${results.length - MAX_SEARCH_RESULTS} more)`
                : '';
            return {
                content: [{ type: 'text', text: JSON.stringify(limited, null, 2) + suffix }],
            };
        },
    );
}
