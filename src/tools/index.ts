import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type McpPlugin from '../main';
import { registerGetActiveFile } from './get-active-file';
import { registerReadNote } from './read-note';
import { registerAppendDailyNote } from './append-daily-note';
import { registerListFolder } from './list-folder';
import { registerListAllTags } from './list-all-tags';
import { registerSearchNotes } from './search-notes';

export function registerTools(mcp: McpServer, plugin: McpPlugin): void {
    registerGetActiveFile(mcp, plugin);
    registerReadNote(mcp, plugin);
    registerAppendDailyNote(mcp, plugin);
    registerListFolder(mcp, plugin);
    registerListAllTags(mcp, plugin);
    registerSearchNotes(mcp, plugin);
}
