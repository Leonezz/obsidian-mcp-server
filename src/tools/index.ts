import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type McpPlugin from '../main';
import { registerGetActiveFile } from './get-active-file';
import { registerReadNote } from './read-note';
import { registerAppendDailyNote } from './append-daily-note';
import { registerListFolder } from './list-folder';
import { registerListAllTags } from './list-all-tags';
import { registerSearchNotes } from './search-notes';
import { registerDescribeVault } from './describe-vault';
import { registerCreateNote } from './create-note';
import { registerEditNote } from './edit-note';
import { registerDeleteNote } from './delete-note';
import { registerGetNoteMetadata } from './get-note-metadata';
import { registerListRecentNotes } from './list-recent-notes';
import { registerSearchContent } from './search-content';

export function registerTools(mcp: McpServer, plugin: McpPlugin): void {
    const tracker = plugin.statsTracker;
    registerGetActiveFile(mcp, plugin, tracker);
    registerReadNote(mcp, plugin, tracker);
    registerAppendDailyNote(mcp, plugin, tracker);
    registerListFolder(mcp, plugin, tracker);
    registerListAllTags(mcp, plugin, tracker);
    registerSearchNotes(mcp, plugin, tracker);
    registerDescribeVault(mcp, plugin, tracker);
    registerCreateNote(mcp, plugin, tracker);
    registerEditNote(mcp, plugin, tracker);
    registerDeleteNote(mcp, plugin, tracker);
    registerGetNoteMetadata(mcp, plugin, tracker);
    registerListRecentNotes(mcp, plugin, tracker);
    registerSearchContent(mcp, plugin, tracker);
}
