import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type McpPlugin from '../main';
import { registerMarkdownGuide } from './obsidian-markdown';
import { registerCanvasGuide } from './json-canvas';
import { registerBasesGuide } from './obsidian-bases';

export function registerPrompts(mcp: McpServer, plugin: McpPlugin): void {
    if (!plugin.settings.enablePrompts) return;

    if (plugin.settings.enableMarkdownGuide) {
        registerMarkdownGuide(mcp);
    }
    if (plugin.settings.enableCanvasGuide) {
        registerCanvasGuide(mcp);
    }
    if (plugin.settings.enableBasesGuide) {
        registerBasesGuide(mcp);
    }
}
