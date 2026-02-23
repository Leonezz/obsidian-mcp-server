import { TFolder } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { ACCESS_DENIED_MSG, MAX_ATTACHMENT_SIZE, WRITE_ANNOTATIONS } from './constants';

export function registerAddAttachment(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('add_attachment', {
        description: 'Save a binary attachment (image, PDF, etc.) to the vault from base64-encoded data. Returns the vault-relative path for embedding as ![[path]].',
        annotations: WRITE_ANNOTATIONS,
        inputSchema: {
            filename: z.string().describe("Filename with extension (e.g. 'diagram.png')"),
            data: z.string().describe('Base64-encoded file content'),
            folder: z.string().optional().describe("Optional vault folder to save into (e.g. 'Attachments'). If omitted, uses Obsidian's configured attachment folder."),
        },
    }, tracker.track('add_attachment', async ({ filename, data, folder }) => {
        if (data.length > MAX_ATTACHMENT_SIZE) {
            return {
                content: [{ type: 'text', text: `Attachment data exceeds maximum size of ${MAX_ATTACHMENT_SIZE} bytes` }],
                isError: true,
            };
        }
        let targetPath: string;
        if (folder) {
            if (!plugin.security.isAllowed(folder)) {
                logger.warning('add_attachment: folder access denied', { folder });
                return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
            }
            const existing = plugin.app.vault.getAbstractFileByPath(folder);
            if (!(existing instanceof TFolder)) {
                try {
                    await plugin.app.vault.createFolder(folder);
                } catch {
                    // folder may already exist or be created concurrently
                }
            }
            targetPath = `${folder}/${filename}`;
        } else {
            targetPath = (plugin.app as any).fileManager.getAvailablePathForAttachment(filename);
        }
        if (!plugin.security.isAllowed(targetPath)) {
            logger.warning('add_attachment: target path access denied', { targetPath });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const buffer = Buffer.from(data, 'base64');
        await plugin.app.vault.createBinary(targetPath, buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
        return { content: [{ type: 'text', text: `Created attachment at ${targetPath}` }] };
    }));
}
