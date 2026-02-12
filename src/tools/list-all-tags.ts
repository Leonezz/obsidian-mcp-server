import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { READ_ONLY_ANNOTATIONS } from './constants';

const outputSchema = {
    tags: z.record(z.number()),
};

export function registerListAllTags(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, _logger: McpLogger): void {
    mcp.registerTool('list_all_tags', {
        description: 'List all hashtags used in the vault with their usage count.',
        annotations: READ_ONLY_ANNOTATIONS,
        outputSchema,
    }, tracker.track('list_all_tags', async () => {
        // @ts-expect-error getTags() exists on metadataCache but not in type defs
        const tags: Record<string, number> = plugin.app.metadataCache.getTags();
        const filteredTags: Record<string, number> = {};
        for (const t in tags) {
            if (plugin.security.isTagAllowed(t)) {
                filteredTags[t] = tags[t];
            }
        }
        return {
            structuredContent: { tags: filteredTags },
            content: [{ type: 'text' as const, text: JSON.stringify(filteredTags, null, 2) }],
        };
    }));
}
