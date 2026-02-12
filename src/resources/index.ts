import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type McpPlugin from '../main';
import { registerStaticResources } from './static';
import { registerTemplateResources } from './templates';

export function registerResources(mcp: McpServer, plugin: McpPlugin): void {
    if (!plugin.settings.enableResources) return;

    registerStaticResources(mcp, plugin);
    registerTemplateResources(mcp, plugin);
}
