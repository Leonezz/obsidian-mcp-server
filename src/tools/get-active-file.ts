import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { ActiveFileResult } from '../types';
import { ACCESS_DENIED_MSG } from './constants';

export function registerGetActiveFile(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker): void {
    mcp.registerTool('get_active_file', {
        description: 'Get the content and metadata of the currently active note.',
    }, tracker.track('get_active_file', async () => {
        const activeFile = plugin.app.workspace.getActiveFile();
        if (!activeFile || !plugin.security.isAllowed(activeFile)) {
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }] };
        }
        const content = await plugin.app.vault.read(activeFile);
        const metadata = plugin.app.metadataCache.getFileCache(activeFile);
        const result: ActiveFileResult = {
            path: activeFile.path,
            frontmatter: metadata?.frontmatter ?? {},
            content,
        };
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }));
}
