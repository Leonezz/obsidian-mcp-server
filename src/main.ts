import { Plugin, Notice, PluginSettingTab, App, Setting, TFile } from 'obsidian';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { getDailyNote, createDailyNote, getAllDailyNotes } from 'obsidian-daily-notes-interface';
// @ts-ignore - moment is global in Obsidian
const moment = window.moment;

// --- Settings Definitions ---
interface McpPluginSettings {
    port: number;
    authToken: string;
}

const DEFAULT_SETTINGS: McpPluginSettings = {
    port: 27123,
    authToken: ""
}

// --- Main Plugin Class ---
export default class McpPlugin extends Plugin {
    settings: McpPluginSettings;
    private server: any;
    private mcp: McpServer;

    async onload() {
        console.log('Loading Obsidian MCP Server...');
        await this.loadSettings();

        // Generate Auth Token if missing
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

    startServer() {
        this.stopServer();

        try {
            const app = express();
            app.use(cors());
            app.use(express.json());

            // --- Authentication Middleware ---
            const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
                const clientToken = req.headers.authorization?.replace("Bearer ", "") || req.query.token;
                
                if (clientToken === this.settings.authToken) {
                    return next();
                }
                
                // Allow "local" checks if needed, but safer to require token always.
                // Log failed attempt
                console.warn(`MCP Auth Failed. IP: ${req.ip}`);
                res.status(403).json({ error: "Unauthorized. Please check your Auth Token in Obsidian Settings." });
            };

            // Apply Auth to all routes
            app.use(authMiddleware);

            // 1. Initialize MCP
            this.mcp = new McpServer({
                name: "Obsidian MCP",
                version: "1.0.0"
            });

            // 2. Register Tools
            this.registerTools();

            // 3. Routes
            app.get('/sse', async (req, res) => {
                const transport = new SSEServerTransport('/message', res);
                await this.mcp.connect(transport);
            });

            app.post('/message', async (req, res) => {
                await this.mcp.handleMessage(req.body);
                res.json({ status: 'ok' });
            });

            // 4. Listen
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
        // --- get_active_file ---
        this.mcp.tool(
            "get_active_file",
            "Get the content and metadata of the currently active note.",
            {}, 
            async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile) {
                    return { content: [{ type: "text", text: "No active file." }] };
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

        // --- read_note ---
        this.mcp.tool(
            "read_note",
            "Read a note by path.",
            { path: z.string() },
            async ({ path }) => {
                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                    const content = await this.app.vault.read(file);
                    return { content: [{ type: "text", text: content }] };
                }
                return { content: [{ type: "text", text: `File not found or is a folder: ${path}` }], isError: true };
            }
        );
        
        // --- append_daily_note ---
        this.mcp.tool(
            "append_daily_note",
            "Append text to today's daily note.",
            { text: z.string() },
            async ({ text }) => {
                const dailyNotes = getAllDailyNotes();
                const now = moment();
                let file = getDailyNote(now, dailyNotes);
                
                if (!file) {
                    file = await createDailyNote(now);
                }
                
                if (file instanceof TFile) {
                    const content = await this.app.vault.read(file);
                    await this.app.vault.modify(file, content + "\n" + text);
                    return { content: [{ type: "text", text: `Appended to ${file.path}` }] };
                }
                
                return { content: [{ type: "text", text: "Failed to resolve daily note." }], isError: true };
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

        // Auth Token Display
        new Setting(containerEl)
            .setName('Auth Token')
            .setDesc('Required for connecting. Add this to your Agent config. (Click to Copy)')
            .addText(text => text
                .setValue(this.plugin.settings.authToken)
                .setDisabled(true) // Read-only mostly, unless we want to allow rotation
            )
            .addExtraButton(btn => btn
                .setIcon('copy')
                .setTooltip('Copy Token')
                .onClick(() => {
                    navigator.clipboard.writeText(this.plugin.settings.authToken);
                    new Notice('Token copied to clipboard');
                }));
        
        new Setting(containerEl)
            .setName('Regenerate Token')
            .setDesc('Invalidates the old token.')
            .addButton(btn => btn
                .setButtonText('Regenerate')
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.authToken = require('crypto').randomBytes(16).toString('hex');
                    await this.plugin.saveSettings();
                    this.display(); // Refresh UI
                    this.plugin.startServer(); // Restart with new token
                }));
    }
}
