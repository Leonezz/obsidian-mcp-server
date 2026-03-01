import { TFile, TFolder } from 'obsidian';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { moment } from 'obsidian';
import { getTagsFromCache } from '../utils';
import type McpPlugin from '../main';

export function registerTemplateResources(mcp: McpServer, plugin: McpPlugin): void {
    const maxListed = plugin.settings.maxResourcesListed;

    // obsidian://notes/{path} — read any note
    mcp.registerResource(
        'note',
        new ResourceTemplate('obsidian://notes/{path}', {
            list: () => {
                const files = plugin.app.vault.getFiles()
                    .filter(f => f.extension === 'md' && plugin.security.isAllowed(f))
                    .slice(0, maxListed);
                return {
                    resources: files.map(f => ({
                        uri: `obsidian://notes/${encodeURIComponent(f.path)}`,
                        name: f.name,
                        mimeType: 'text/markdown',
                    })),
                };
            },
            complete: {
                path: (value) => {
                    const files = plugin.app.vault.getFiles()
                        .filter(f => f.extension === 'md' && plugin.security.isAllowed(f))
                        .filter(f => f.path.toLowerCase().startsWith(value.toLowerCase()))
                        .slice(0, 50);
                    return files.map(f => f.path);
                },
            },
        }),
        {
            description: 'Read a note from the vault by its path.',
            mimeType: 'text/markdown',
        },
        async (_uri, variables) => {
            const path = decodeURIComponent(String(variables.path));
            if (!plugin.security.isAllowed(path)) {
                return { contents: [{ uri: _uri.href, text: 'Access denied.' }] };
            }
            const file = plugin.app.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) {
                return { contents: [{ uri: _uri.href, text: 'File not found.' }] };
            }
            if (!plugin.security.isAllowed(file)) {
                return { contents: [{ uri: _uri.href, text: 'Access denied.' }] };
            }
            const content = await plugin.app.vault.read(file);
            return {
                contents: [{
                    uri: _uri.href,
                    mimeType: 'text/markdown',
                    text: content,
                }],
            };
        },
    );

    // obsidian://tags/{tag} — list notes by tag
    mcp.registerResource(
        'tag',
        new ResourceTemplate('obsidian://tags/{tag}', {
            list: () => {
                // @ts-expect-error getTags() exists on metadataCache but not in type defs
                const tags: Record<string, number> = plugin.app.metadataCache.getTags();
                const allowed = Object.keys(tags)
                    .filter(t => plugin.security.isTagAllowed(t))
                    .slice(0, maxListed);
                return {
                    resources: allowed.map(t => ({
                        uri: `obsidian://tags/${encodeURIComponent(t)}`,
                        name: t,
                        mimeType: 'application/json',
                    })),
                };
            },
            complete: {
                tag: (value) => {
                    // @ts-expect-error getTags() exists on metadataCache but not in type defs
                    const tags: Record<string, number> = plugin.app.metadataCache.getTags();
                    return Object.keys(tags)
                        .filter(t => plugin.security.isTagAllowed(t))
                        .filter(t => t.toLowerCase().startsWith(value.toLowerCase()))
                        .slice(0, 50);
                },
            },
        }),
        {
            description: 'List notes that have a specific tag.',
            mimeType: 'application/json',
        },
        (_uri, variables) => {
            const tag = decodeURIComponent(String(variables.tag));
            if (!plugin.security.isTagAllowed(tag)) {
                return { contents: [{ uri: _uri.href, text: 'Access denied.' }] };
            }
            const files = plugin.app.vault.getFiles()
                .filter(f => plugin.security.isAllowed(f))
                .filter(f => {
                    const cache = plugin.app.metadataCache.getFileCache(f);
                    const fileTags = getTagsFromCache(cache);
                    return fileTags.some(ft => ft.startsWith(tag));
                })
                .slice(0, maxListed);

            const results = files.map(f => ({
                path: f.path,
                name: f.name,
                modifiedAt: moment(f.stat.mtime).format(),
            }));

            return {
                contents: [{
                    uri: _uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify(results, null, 2),
                }],
            };
        },
    );

    // obsidian://daily/{date} — access daily notes
    mcp.registerResource(
        'daily-note',
        new ResourceTemplate('obsidian://daily/{date}', {
            list: undefined,
            complete: {
                date: () => {
                    const today = moment();
                    return Array.from({ length: 7 }, (_, i) =>
                        today.clone().subtract(i, 'days').format('YYYY-MM-DD'),
                    );
                },
            },
        }),
        {
            description: 'Read a daily note by date (YYYY-MM-DD format).',
            mimeType: 'text/markdown',
        },
        async (_uri, variables) => {
            const date = String(variables.date);
            const m = moment(date, 'YYYY-MM-DD', true);
            if (!m.isValid()) {
                return { contents: [{ uri: _uri.href, text: 'Invalid date format. Use YYYY-MM-DD.' }] };
            }

            // Find daily note by looking for files matching common daily note patterns
            const files = plugin.app.vault.getFiles()
                .filter(f => f.extension === 'md' && plugin.security.isAllowed(f))
                .filter(f => f.basename === date || f.basename === m.format('YYYY-MM-DD'));

            if (files.length === 0) {
                return { contents: [{ uri: _uri.href, text: `No daily note found for ${date}.` }] };
            }

            const file = files[0];
            const content = await plugin.app.vault.read(file);
            return {
                contents: [{
                    uri: _uri.href,
                    mimeType: 'text/markdown',
                    text: content,
                }],
            };
        },
    );

    // obsidian://folders/{path} — list folder contents
    mcp.registerResource(
        'folder',
        new ResourceTemplate('obsidian://folders/{path}', {
            list: () => {
                const root = plugin.app.vault.getRoot();
                const folders: string[] = [];
                const collectFolders = (folder: TFolder): void => {
                    for (const child of folder.children) {
                        if (child instanceof TFolder && plugin.security.isAllowed(child.path)) {
                            folders.push(child.path);
                            collectFolders(child);
                        }
                    }
                };
                collectFolders(root);
                return {
                    resources: folders.slice(0, maxListed).map(p => ({
                        uri: `obsidian://folders/${encodeURIComponent(p)}`,
                        name: p,
                        mimeType: 'application/json',
                    })),
                };
            },
            complete: {
                path: (value) => {
                    const root = plugin.app.vault.getRoot();
                    const folders: string[] = [];
                    const collectFolders = (folder: TFolder): void => {
                        for (const child of folder.children) {
                            if (child instanceof TFolder && plugin.security.isAllowed(child.path)) {
                                folders.push(child.path);
                                collectFolders(child);
                            }
                        }
                    };
                    collectFolders(root);
                    return folders
                        .filter(p => p.toLowerCase().startsWith(value.toLowerCase()))
                        .slice(0, 50);
                },
            },
        }),
        {
            description: 'List files and subfolders in a vault folder.',
            mimeType: 'application/json',
        },
        (_uri, variables) => {
            const path = decodeURIComponent(String(variables.path));
            if (!plugin.security.isAllowed(path)) {
                return { contents: [{ uri: _uri.href, text: 'Access denied.' }] };
            }
            const folder = plugin.app.vault.getAbstractFileByPath(path);
            if (!(folder instanceof TFolder)) {
                return { contents: [{ uri: _uri.href, text: 'Folder not found.' }] };
            }
            const children = folder.children
                .filter(c => plugin.security.isAllowed(c.path))
                .map(c => ({
                    name: c.name,
                    path: c.path,
                    type: c instanceof TFolder ? 'folder' : 'file',
                }));
            return {
                contents: [{
                    uri: _uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify(children, null, 2),
                }],
            };
        },
    );
}
