import { TFile } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { getMimeType, isImageMime } from '../utils';
import { ACCESS_DENIED_MSG, READ_ONLY_ANNOTATIONS } from './constants';

export function registerReadAttachment(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('read_attachment', {
        description: 'Read a binary attachment (image, PDF, etc.) from the vault. Images are returned as base64 image content that AI models can see. Non-image files return metadata only.',
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
            path: z.string().describe("Vault-relative path to the attachment (e.g. 'Attachments/diagram.png')"),
        },
    }, tracker.track('read_attachment', async ({ path }) => {
        if (!plugin.security.isAllowed(path)) {
            logger.warning('read_attachment: access denied', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            logger.warning('read_attachment: file not found', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        if (!plugin.security.isAllowed(file)) {
            logger.warning('read_attachment: access denied by tag rule', { path });
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const ext = file.extension;
        const mimeType = getMimeType(ext);
        const arrayBuffer = await plugin.app.vault.readBinary(file);
        const base64 = Buffer.from(arrayBuffer).toString('base64');

        if (isImageMime(mimeType)) {
            return {
                content: [{
                    type: 'image' as const,
                    data: base64,
                    mimeType,
                }],
            };
        }
        return {
            content: [{
                type: 'text' as const,
                text: JSON.stringify({ path, mimeType, sizeBytes: arrayBuffer.byteLength }),
            }],
        };
    }));
}
