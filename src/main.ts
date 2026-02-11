import { Plugin, Notice, PluginSettingTab, App, Setting, TFile, TFolder } from 'obsidian';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { getDailyNote, createDailyNote, getAllDailyNotes } from 'obsidian-daily-notes-interface';
// @ts-ignore
const moment = window.moment;

// --- Settings Definitions ---
interface McpPluginSettings {
    port: number;
    authToken: string;
    blacklist: string; // New: Newline separated paths
}

const DEFAULT_SETTINGS: McpPluginSettings = {
    port: 27123,
    authToken: "",
    blacklist: "Secret/\nPrivate/"
}

// --- Main Plugin Class ---
export default class McpPlugin extends Plugin {
    settings: McpPluginSettings;
    private server: any;
    private mcp: McpServer;

    async onload() {
        console.log('Loading Obsidian MCP Server...');
        await this.loadSettings();

        if (!this.settings.authToken) {
            this.settings.authToken = require('crypto').randomBytes(16).toString('hex');
            await this.saveSettings();
        }

        this.addSettingTab(new McpSettingTab(this.app, this));
        this.startServer();
    }

    async onunload() {
        console.log('Unloading Obsidian MCP Server...');
        this.stopServer();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    stopServer() {
        if (this.server) {
            this.server.close();
            this.server = null;
            console.log('MCP Server stopped.');
        }
    }

    // --- Security Helper ---
    isPathAllowed(path: string): boolean {
        const blocked = this.settings.blacklist.split('\n').map(x => x.trim()).filter(x => x.length > 0);
        // Returns TRUE if path does NOT start with any blocked prefix
        return !blocked.some(b => path.startsWith(b));
    }

    startServer() {
        this.stopServer();

        try {
            const app = express();
            app.use(cors());
            app.use(express.json());

            const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
                const clientToken = req.headers.authorization?.replace("Bearer ", "") || req.query.token;
                if (clientToken === this.settings.authToken) {
                    return next();
                }
                console.warn(`MCP Auth Failed. IP: ${req.ip}`);
                res.status(403).json({ error: "Unauthorized. Please check your Auth Token in Obsidian Settings." });
            };

            app.use(authMiddleware);

            this.mcp = new McpServer({
                name: "Obsidian MCP",
                version: "1.0.0"
            });

            this.registerTools();

            app.get('/sse', async (req, res) => {
                const transport = new SSEServerTransport('/message', res);
                await this.mcp.connect(transport);
            });

            app.post('/message', async (req, res) => {
                await this.mcp.handleMessage(req.body);
                res.json({ status: 'ok' });
            });

            this.server = app.listen(this.settings.port, () => {
                console.log(`Obsidian MCP Server listening on port ${this.settings.port}`);
                new Notice(`MCP Server Online (Port ${this.settings.port})`);
            });

            this.server.on('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    console.error(`Port ${this.settings.port} is busy.`);
                    new Notice(`MCP Error: Port ${this.settings.port} busy`);
                } else {
                    console.error('MCP Server Error:', err);
                }
            });

        } catch (e) {
            console.error("Failed to start MCP Server:", e);
            new Notice("MCP Server Failed to Start");
        }
    }

    registerTools() {
        // --- Tool: get_active_file ---
        this.mcp.tool(
            "get_active_file",
            "Get the content and metadata of the currently active note.",
            {}, 
            async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile) {
                    return { content: [{ type: "text", text: "No active file." }] };
                }
                
                // Security Check
                if (!this.isPathAllowed(activeFile.path)) {
                    return { content: [{ type: "text", text: "Access Denied: The active file is in a blacklisted folder." }] };
                }

                const content = await this.app.vault.read(activeFile);
                const metadata = this.app.metadataCache.getFileCache(activeFile);
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({
                            path: activeFile.path,
                            frontmatter: metadata?.frontmatter || {},
                            content: content
                        }, null, 2)
                    }]
                };
            }
        );

        // --- Tool: read_note ---
        this.mcp.tool(
            "read_note",
            "Read a note by path.",
            { path: z.string() },
            async ({ path }) => {
                // Security Check
                if (!this.isPathAllowed(path)) {
                    return { content: [{ type: "text", text: `Access Denied: '${path}' is blacklisted.` }], isError: true };
                }

                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                    const content = await this.app.vault.read(file);
                    return { content: [{ type: "text", text: content }] };
                }
                return { content: [{ type: "text", text: `File not found or is a folder: ${path}` }], isError: true };
            }
        );
        
        // --- Tool: append_daily_note ---
        this.mcp.tool(
            "append_daily_note",
            "Append text to today's daily note.",
            { text: z.string() },
            async ({ text }) => {
                const dailyNotes = getAllDailyNotes();
                const now = moment();
                let file = getDailyNote(now, dailyNotes);
                if (!file) file = await createDailyNote(now);
                
                if (file instanceof TFile) {
                    // Security Check (Unlikely to blacklist dailies, but consistency matters)
                    if (!this.isPathAllowed(file.path)) {
                        return { content: [{ type: "text", text: "Access Denied: Daily notes folder is blacklisted." }], isError: true };
                    }

                    const content = await this.app.vault.read(file);
                    await this.app.vault.modify(file, content + "\n" + text);
                    return { content: [{ type: "text", text: `Appended to ${file.path}` }] };
                }
                return { content: [{ type: "text", text: "Failed to resolve daily note." }], isError: true };
            }
        );

        // --- Tool: list_folder ---
        this.mcp.tool(
            "list_folder",
            "List files and folders inside a specific directory.",
            { path: z.string().default("/") },
            async ({ path }) => {
                // Security Check
                if (!this.isPathAllowed(path)) {
                    return { content: [{ type: "text", text: `Access Denied: '${path}' is blacklisted.` }], isError: true };
                }

                const folder = path === "/" ? this.app.vault.getRoot() : this.app.vault.getAbstractFileByPath(path);
                if (folder instanceof TFolder) {
                    const children = folder.children
                        .filter(c => this.isPathAllowed(c.path)) // Filter children too!
                        .map(c => ({
                            name: c.name,
                            path: c.path,
                            type: c instanceof TFolder ? "folder" : "file"
                        }));
                    return { content: [{ type: "text", text: JSON.stringify(children, null, 2) }] };
                }
                return { content: [{ type: "text", text: `Folder not found: ${path}` }], isError: true };
            }
        );

        // --- Tool: list_all_tags ---
        this.mcp.tool(
            "list_all_tags",
            "List all hashtags used in the vault with their usage count.",
            {},
            async () => {
                // Cannot filter tags easily by path unless we iterate all files.
                // For now, allow listing tags globally. Tags aren't usually secret, content is.
                // @ts-ignore
                const tags = this.app.metadataCache.getTags();
                return { content: [{ type: "text", text: JSON.stringify(tags, null, 2) }] };
            }
        );

        // --- Tool: search_notes ---
        this.mcp.tool(
            "search_notes",
            "Search for notes by time range and tags. Returns a list of file paths.",
            {
                start_date: z.string().optional(),
                end_date: z.string().optional(),
                tags: z.array(z.string()).optional()
            },
            async ({ start_date, end_date, tags }) => {
                let files = this.app.vault.getFiles();

                // 1. Security Filter First
                files = files.filter(f => this.isPathAllowed(f.path));

                // Date Filter
                if (start_date) {
                    const start = moment(start_date).valueOf();
                    files = files.filter(f => f.stat.mtime >= start);
                }
                if (end_date) {
                    const end = moment(end_date).valueOf();
                    files = files.filter(f => f.stat.mtime <= end);
                }

                // Tag Filter
                if (tags && tags.length > 0) {
                    files = files.filter(f => {
                        const cache = this.app.metadataCache.getFileCache(f);
                        const fileTags = (cache?.tags?.map(t => t.tag) || []).concat(cache?.frontmatter?.tags || []);
                        return tags.every(requiredTag => fileTags.some(ft => ft.startsWith(requiredTag)));
                    });
                }

                const results = files.map(f => ({
                    path: f.path,
                    mtime: moment(f.stat.mtime).format(),
                    tags: this.app.metadataCache.getFileCache(f)?.tags?.map(t => t.tag)
                }));

                const limitedResults = results.slice(0, 100); 

                return { 
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(limitedResults, null, 2) + (results.length > 100 ? `\n...(and ${results.length - 100} more)` : "")
                    }] 
                };
            }
        );
    }
}

// --- Settings Tab ---
class McpSettingTab extends PluginSettingTab {
    plugin: McpPlugin;

    constructor(app: App, plugin: McpPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Obsidian MCP Server' });

        new Setting(containerEl)
            .setName('Server Port')
            .setDesc('Port to listen on. (Default: 27123)')
            .addText(text => text
                .setValue(String(this.plugin.settings.port))
                .onChange(async (value) => {
                    const port = Number(value);
                    if (!isNaN(port)) {
                        this.plugin.settings.port = port;
                        await this.plugin.saveSettings();
                        this.plugin.startServer();
                    }
                }));

        new Setting(containerEl)
            .setName('Auth Token')
            .setDesc('Required for connecting.')
            .addText(text => text.setValue(this.plugin.settings.authToken).setDisabled(true))
            .addExtraButton(btn => btn.setIcon('copy').onClick(() => {
                navigator.clipboard.writeText(this.plugin.settings.authToken);
                new Notice('Token copied');
            }));
        
        new Setting(containerEl)
            .setName('Regenerate Token')
            .addButton(btn => btn.setButtonText('Regenerate').setWarning().onClick(async () => {
                this.plugin.settings.authToken = require('crypto').randomBytes(16).toString('hex');
                await this.plugin.saveSettings();
                this.display();
                this.plugin.startServer();
            }));

        // --- Blacklist Setting ---
        new Setting(containerEl)
            .setName('Access Control: Blacklist')
            .setDesc('Paths starting with these lines will be blocked. (One per line).')
            .addTextArea(text => text
                .setPlaceholder('Secret/\nPrivate/')
                .setValue(this.plugin.settings.blacklist)
                .onChange(async (value) => {
                    this.plugin.settings.blacklist = value;
                    await this.plugin.saveSettings();
                }));
    }
}
