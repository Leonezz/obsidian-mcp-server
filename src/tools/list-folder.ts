import { TFolder } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type McpPlugin from '../main';
import type { FileInfo } from '../types';
import { ACCESS_DENIED_MSG } from './constants';

export function registerListFolder(mcp: McpServer, plugin: McpPlugin): void {
    mcp.registerTool('list_folder', {
        description: 'List files and folders inside a specific directory.',
        inputSchema: {
            path: z.string().default('/').describe('Directory path (default: root)'),
        },
    }, async ({ path }) => {
        if (!plugin.security.isAllowed(path)) {
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const folder = path === '/'
            ? plugin.app.vault.getRoot()
            : plugin.app.vault.getAbstractFileByPath(path);
        if (!(folder instanceof TFolder)) {
            return { content: [{ type: 'text', text: ACCESS_DENIED_MSG }], isError: true };
        }
        const children: FileInfo[] = folder.children
            .filter(c => plugin.security.isAllowed(c.path))
            .map(c => ({
                name: c.name,
                path: c.path,
                type: c instanceof TFolder ? 'folder' : 'file',
            }));
        return { content: [{ type: 'text', text: JSON.stringify(children, null, 2) }] };
    });
}
