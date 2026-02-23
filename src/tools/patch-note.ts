import { TFile } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { ACCESS_DENIED_MSG, MAX_EDIT_LENGTH, WRITE_IDEMPOTENT_ANNOTATIONS } from './constants';

export function registerPatchNote(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('patch_note', {
        description: 'Perform a find-and-replace edit on a note. Replaces the first occurrence of old_string with new_string without rewriting the entire note.',
        annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
        inputSchema: {
            path: z.string().describe("Vault-relative path (e.g. 'Notes/project.md')"),
            old_string: z.string().min(1).describe('Exact text to find in the note'),
            new_string: z.string()
                .max(MAX_EDIT_LENGTH, `Replacement exceeds maximum length of ${MAX_EDIT_LENGTH} characters`)
                .describe('Text to replace it with'),
        },
    }, tracker.track('patch_note', async ({ path, old_string, new_string }) => {
        if (!plugin.security.isAllowed(path)) {
            logger.warning('patch_note: access denied', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        if (!plugin.security.isAllowed(file)) {
            logger.warning('patch_note: access denied by tag rule', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }

        const content = await plugin.app.vault.read(file);

        const firstIndex = content.indexOf(old_string);
        if (firstIndex === -1) {
            return { content: [{ type: 'text', text: `old_string not found in ${path}` }], isError: true };
        }

        const secondIndex = content.indexOf(old_string, firstIndex + old_string.length);
        if (secondIndex !== -1) {
            return { content: [{ type: 'text', text: `old_string matches multiple locations in ${path}. Provide more context to make the match unique.` }], isError: true };
        }

        const newContent = content.substring(0, firstIndex) + new_string + content.substring(firstIndex + old_string.length);
        await plugin.app.vault.modify(file, newContent);
        return { content: [{ type: 'text', text: `Patched ${path}` }] };
    }));
}
