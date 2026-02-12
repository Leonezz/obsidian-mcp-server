import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import type { ActiveFileResult } from '../types';
import { generateNoteAnnotations } from '../annotations';
import { ACCESS_DENIED_MSG, READ_ONLY_ANNOTATIONS } from './constants';

export function registerGetActiveFile(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('get_active_file', {
        description: 'Get the content and metadata of the currently active note.',
        annotations: READ_ONLY_ANNOTATIONS,
    }, tracker.track('get_active_file', async () => {
        const activeFile = plugin.app.workspace.getActiveFile();
        if (!activeFile || !plugin.security.isAllowed(activeFile)) {
            logger.warning('get_active_file: access denied or no active file');
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }] };
        }
        const content = await plugin.app.vault.read(activeFile);
        const metadata = plugin.app.metadataCache.getFileCache(activeFile);
        const result: ActiveFileResult = {
            path: activeFile.path,
            frontmatter: metadata?.frontmatter ?? {},
            content,
        };
        const annotations = generateNoteAnnotations(plugin, activeFile, content);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }, ...annotations] };
    }));
}
