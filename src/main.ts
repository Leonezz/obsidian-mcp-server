import { Plugin, Notice, PluginSettingTab, App, Setting } from 'obsidian';
import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

// --- Settings Definitions ---
interface McpPluginSettings {
    port: number;
}

const DEFAULT_SETTINGS: McpPluginSettings = {
    port: 27123
}

// --- Main Plugin Class ---
export default class McpPlugin extends Plugin {
    settings: McpPluginSettings;
    private server: any;
    private mcp: McpServer;

    async onload() {
        console.log('Loading Obsidian MCP Server...');
        await this.loadSettings();

        // Add Settings Tab
        this.addSettingTab(new McpSettingTab(this.app, this));

        // Start Server
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
        // Ensure old server is stopped first
        this.stopServer();

        try {
            const app = express();
            app.use(cors());
            app.use(express.json());

            // 1. Initialize MCP Server
            this.mcp = new McpServer({
                name: "Obsidian MCP",
                version: "1.0.0"
            });

            // 2. Register Tools
            this.registerTools();

            // 3. Set up Transport Endpoints
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
                console.log(`Obsidian MCP Server listening on http://localhost:${this.settings.port}/sse`);
                new Notice(`MCP Server Online: Port ${this.settings.port}`);
            });

            this.server.on('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    console.error(`Port ${this.settings.port} is already in use.`);
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
            "Get the content and metadata of the currently active/focused note in Obsidian.",
            {}, 
            async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile) {
                    return {
                        content: [{ type: "text", text: "No active file. Please open a note." }]
                    };
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
            "Read the raw content of a specific note by path.",
            { path: z.string().describe("Vault-relative path to the note (e.g. 'Folder/Note.md')") },
            async ({ path }) => {
                const file = this.app.vault.getAbstractFileByPath(path);
                if (!file) {
                    return { content: [{ type: "text", text: `Error: File not found at '${path}'` }], isError: true };
                }
                // @ts-ignore
                if (!file.stat) {
                     return { content: [{ type: "text", text: `Error: '${path}' is a folder, not a file.` }], isError: true };
                }
                
                // @ts-ignore
                const content = await this.app.vault.read(file);
                return { content: [{ type: "text", text: content }] };
            }
        );
        
        // --- Tool: append_daily_note ---
        this.mcp.tool(
            "append_daily_note",
            "Append text to today's daily note. Creates it if it doesn't exist.",
            { text: z.string() },
            async ({ text }) => {
                const date = new Date();
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const filename = `${year}-${month}-${day}.md`;
                
                let file = this.app.vault.getAbstractFileByPath(filename);
                if (!file) {
                    file = await this.app.vault.create(filename, "");
                }
                
                if (file) {
                    // @ts-ignore
                    const content = await this.app.vault.read(file);
                    // @ts-ignore
                    await this.app.vault.modify(file, content + "\n" + text);
                    return { content: [{ type: "text", text: `Appended to ${filename}` }] };
                }
                
                return { content: [{ type: "text", text: "Could not find or create daily note." }], isError: true };
            }
        );
    }
}

// --- Settings Tab Class ---
class McpSettingTab extends PluginSettingTab {
    plugin: McpPlugin;

    constructor(app: App, plugin: McpPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Obsidian MCP Server Settings' });

        new Setting(containerEl)
            .setName('Server Port')
            .setDesc('The port the MCP server listens on. Default: 27123. (Requires Restart)')
            .addText(text => text
                .setPlaceholder('27123')
                .setValue(String(this.plugin.settings.port))
                .onChange(async (value) => {
                    const port = Number(value);
                    if (!isNaN(port) && port > 0 && port < 65535) {
                        this.plugin.settings.port = port;
                        await this.plugin.saveSettings();
                        // Restart server to apply changes
                        this.plugin.startServer();
                    }
                }));
    }
}
