import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type McpPlugin from '../main';

export function registerListAllTags(mcp: McpServer, plugin: McpPlugin): void {
    mcp.registerTool('list_all_tags', {
        description: 'List all hashtags used in the vault with their usage count.',
    }, async () => {
        // @ts-expect-error getTags() exists on metadataCache but not in type defs
        const tags: Record<string, number> = plugin.app.metadataCache.getTags();
        const filteredTags: Record<string, number> = {};
        for (const t in tags) {
            if (plugin.security.isTagAllowed(t)) {
                filteredTags[t] = tags[t];
            }
        }
        return { content: [{ type: 'text', text: JSON.stringify(filteredTags, null, 2) }] };
    });
}
