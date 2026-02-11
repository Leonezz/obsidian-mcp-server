import { Plugin, Notice } from 'obsidian';
import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

// Define the Plugin Class
export default class McpPlugin extends Plugin {
    private server: any;
    private mcp: McpServer;
    private port = 27123;

    async onload() {
        console.log('Loading Obsidian MCP Server...');
        this.startServer();
    }

    async onunload() {
        console.log('Unloading Obsidian MCP Server...');
        if (this.server) {
            this.server.close();
            console.log('MCP Server stopped.');
        }
    }

    startServer() {
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
            
            // SSE Endpoint (Client connects here)
            app.get('/sse', async (req, res) => {
                // transport handles headers, keep-alive, etc.
                const transport = new SSEServerTransport('/message', res);
                await this.mcp.connect(transport);
            });

            // Message Endpoint (Client posts RPC here)
            app.post('/message', async (req, res) => {
                await this.mcp.handleMessage(req.body);
                res.json({ status: 'ok' });
            });

            // 4. Listen
            this.server = app.listen(this.port, () => {
                console.log(`Obsidian MCP Server listening on http://localhost:${this.port}/sse`);
                new Notice(`MCP Server Online: Port ${this.port}`);
            });

            // Error handling
            this.server.on('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    console.error(`Port ${this.port} is already in use.`);
                    new Notice(`MCP Error: Port ${this.port} busy`);
                } else {
                    console.error('MCP Server Error:', err);
                }
            });

        } catch (e) {
            console.error("Failed to start MCP Server:", e);
        }
    }

    registerTools() {
        // --- Tool: get_active_file ---
        this.mcp.tool(
            "get_active_file",
            "Get the content and metadata of the currently active/focused note in Obsidian.",
            {}, // No input args needed
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
                // Check if it's a file (not a folder)
                if (!('stat' in file)) {
                     return { content: [{ type: "text", text: `Error: '${path}' is a folder, not a file.` }], isError: true };
                }
                
                // We cast to TFile (any file with 'stat' property in Obsidian API is effectively TFile for reading)
                // In TS usually we do `instanceof TFile`, but imports might be tricky without full types.
                // Let's assume it's readable.
                // @ts-ignore
                const content = await this.app.vault.read(file);
                
                return {
                    content: [{ type: "text", text: content }]
                };
            }
        );
        
        // --- Tool: append_daily_note ---
        this.mcp.tool(
            "append_daily_note",
            "Append text to today's daily note. Creates it if it doesn't exist.",
            { text: z.string() },
            async ({ text }) => {
                // For MVP, we need to find the daily note. 
                // Since we don't have 'daily-notes' plugin interface imports handy, 
                // we'll try to find it by date format YYYY-MM-DD.
                
                const date = new Date();
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const filename = `${year}-${month}-${day}.md`;
                
                // Try to find it in root or typical folders. 
                // Ideally we'd use app.internalPlugins.plugins['daily-notes'].instance...
                // But let's assume root or 'Daily' for MVP resilience, or just search.
                
                let file = this.app.vault.getAbstractFileByPath(filename);
                // Fallback: search for it? No, explicit path is safer for MVP.
                
                if (!file) {
                    // Try to create it in root
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
