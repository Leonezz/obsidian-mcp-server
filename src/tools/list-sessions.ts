import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { READ_ONLY_ANNOTATIONS } from './constants';

export function registerListSessions(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('list_sessions', {
        description: 'List active MCP sessions with client info and per-session tool usage stats.',
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {},
    }, tracker.track('list_sessions', () => {
        const summaries = plugin.mcpServer.getSessionSummaries();
        logger.info('list_sessions', { count: summaries.length });
        return {
            content: [{
                type: 'text' as const,
                text: JSON.stringify(summaries, null, 2),
            }],
        };
    }));
}
