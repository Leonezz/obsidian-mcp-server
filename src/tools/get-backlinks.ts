import { TFile } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { ACCESS_DENIED_MSG, MAX_BACKLINKS, MAX_BACKLINK_CONTEXT_LENGTH, READ_ONLY_ANNOTATIONS } from './constants';

interface BacklinkEntry {
    source: string;
    context: string;
}

const outputSchema = {
    backlinks: z.array(z.object({
        source: z.string(),
        context: z.string(),
    })),
    count: z.number(),
};

export function registerGetBacklinks(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('get_backlinks', {
        description: 'Get incoming links (backlinks) to a note — which other notes link to it.',
        annotations: READ_ONLY_ANNOTATIONS,
        outputSchema,
        inputSchema: {
            path: z.string().describe("Vault-relative path (e.g. 'Concepts/UART.md')"),
        },
    }, tracker.track('get_backlinks', async ({ path }) => {
        if (!plugin.security.isAllowed(path)) {
            logger.warning('get_backlinks: access denied', { path });
            return { content: [{ type: 'text' as const, text: ACCESS_DENIED_MSG }], isError: true };
        }
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            return { content: [{ type: 'text' as const, text: ACCESS_DENIED_MSG }], isError: true };
        }
        if (!plugin.security.isAllowed(file)) {
            logger.warning('get_backlinks: access denied by tag rule', { path });
            return { content: [{ type: 'text' as const, text: ACCESS_DENIED_MSG }], isError: true };
        }

        const resolvedLinks = plugin.app.metadataCache.resolvedLinks ?? {};
        const backlinks: BacklinkEntry[] = [];

        for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
            if (backlinks.length >= MAX_BACKLINKS) break;
            if (!(path in targets)) continue;
            if (!plugin.security.isAllowed(sourcePath)) continue;

            const sourceFile = plugin.app.vault.getAbstractFileByPath(sourcePath);
            if (!(sourceFile instanceof TFile)) continue;
            if (!plugin.security.isAllowed(sourceFile)) continue;

            let context = '';
            try {
                const content = await plugin.app.vault.read(sourceFile);
                const targetName = file.basename ?? file.name.replace(/\.md$/, '');
                const lines = content.split('\n');
                for (const line of lines) {
                    if (line.includes(`[[${targetName}]]`) || line.includes(`[[${targetName}|`)) {
                        context = line.trim();
                        if (context.length > MAX_BACKLINK_CONTEXT_LENGTH) {
                            context = context.substring(0, MAX_BACKLINK_CONTEXT_LENGTH) + '...';
                        }
                        break;
                    }
                }
            } catch (err) {
                logger.warning('get_backlinks: failed to read source file for context', { sourcePath, error: String(err) });
            }

            backlinks.push({ source: sourcePath, context });
        }

        const result = { backlinks, count: backlinks.length };
        return {
            structuredContent: result,
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
    }));
}
