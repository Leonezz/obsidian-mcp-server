import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';

export function registerListAllTags(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker): void {
    mcp.registerTool('list_all_tags', {
        description: 'List all hashtags used in the vault with their usage count.',
    }, tracker.track('list_all_tags', async () => {
        // @ts-expect-error getTags() exists on metadataCache but not in type defs
        const tags: Record<string, number> = plugin.app.metadataCache.getTags();
        const filteredTags: Record<string, number> = {};
        for (const t in tags) {
            if (plugin.security.isTagAllowed(t)) {
                filteredTags[t] = tags[t];
            }
        }
        return { content: [{ type: 'text', text: JSON.stringify(filteredTags, null, 2) }] };
    }));
}
