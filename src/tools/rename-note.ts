import { TFile } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { ACCESS_DENIED_MSG, WRITE_ANNOTATIONS } from './constants';

export function registerRenameNote(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('rename_note', {
        description: 'Rename or move a note to a new path. Obsidian automatically updates wikilinks if the user has "Automatically update internal links" enabled.',
        annotations: WRITE_ANNOTATIONS,
        inputSchema: {
            path: z.string().describe("Current vault-relative path (e.g. 'Inbox/raw-idea.md')"),
            new_path: z.string().describe("New vault-relative path (e.g. 'Projects/idea-validated.md')"),
        },
    }, tracker.track('rename_note', async ({ path, new_path }) => {
        if (!plugin.security.isAllowed(path)) {
            logger.warning('rename_note: access denied on source', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        if (!plugin.security.isAllowed(new_path)) {
            logger.warning('rename_note: access denied on destination', { new_path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }

        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        if (!plugin.security.isAllowed(file)) {
            logger.warning('rename_note: access denied by tag rule', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }

        const existing = plugin.app.vault.getAbstractFileByPath(new_path);
        if (existing) {
            return { content: [{ type: 'text', text: `A file already exists at ${new_path}` }], isError: true };
        }

        await plugin.app.fileManager.renameFile(file, new_path);
        return { content: [{ type: 'text', text: `Renamed ${path} → ${new_path}` }] };
    }));
}
