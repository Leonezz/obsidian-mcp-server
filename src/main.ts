import { Plugin, Notice, PluginSettingTab, App, Setting, TFile, TFolder, CachedMetadata } from 'obsidian';
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
    blacklist: string; // Newline separated rules
}

const DEFAULT_SETTINGS: McpPluginSettings = {
    port: 27123,
    authToken: "",
    blacklist: "Secret/\n#secret"
}

// --- Security Manager ---
class SecurityManager {
    private pathRules: string[] = [];
    private tagRules: string[] = [];

    constructor(private plugin: McpPlugin) {
        this.reloadRules();
    }

    reloadRules() {
        const lines = this.plugin.settings.blacklist.split('\n').map(x => x.trim()).filter(x => x.length > 0);
        this.pathRules = lines.filter(x => !x.startsWith('#'));
        this.tagRules = lines.filter(x => x.startsWith('#'));
    }

    isTagAllowed(tag: string): boolean {
        return !this.tagRules.some(rule => tag.startsWith(rule));
    }

    isAllowed(fileOrPath: TFile | string): boolean {
        let path: string;
        let tags: string[] = [];

        if (typeof fileOrPath === 'string') {
            path = fileOrPath;
            // If it's just a path, we can't check tags easily unless we resolve it.
            // For list_folder/search, we might only check path.
            // For read_note, we should resolve to TFile to check tags.
            const abstractFile = this.plugin.app.vault.getAbstractFileByPath(path);
            if (abstractFile instanceof TFile) {
                const cache = this.plugin.app.metadataCache.getFileCache(abstractFile);
                tags = this.getTagsFromCache(cache);
            }
        } else {
            path = fileOrPath.path;
            const cache = this.plugin.app.metadataCache.getFileCache(fileOrPath);
            tags = this.getTagsFromCache(cache);
        }

        // 1. Check Path Rules
        if (this.pathRules.some(rule => path.startsWith(rule))) {
            return false;
        }

        // 2. Check Tag Rules
        if (this.tagRules.length > 0 && tags.length > 0) {
            // If file has ANY tag that matches a blacklisted tag
            // Tag match: #secret matches #secret, #secret/nested
            if (tags.some(fileTag => this.tagRules.some(rule => fileTag.startsWith(rule)))) {
                return false;
            }
        }

        return true;
    }

    private getTagsFromCache(cache: CachedMetadata | null): string[] {
        if (!cache) return [];
        const tagList = new Set<string>();
        // Inline tags
        cache.tags?.forEach(t => tagList.add(t.tag));
        // Frontmatter tags
        const fmTags = cache.frontmatter?.tags;
        if (Array.isArray(fmTags)) {
            fmTags.forEach(t => tagList.add('#' + t));
        } else if (typeof fmTags === 'string') {
            fmTags.split(',').forEach(t => tagList.add('#' + t.trim()));
        }
        return Array.from(tagList);
    }
}

// --- Main Plugin Class ---
export default class McpPlugin extends Plugin {
    settings: McpPluginSettings;
    private server: any;
    private mcp: McpServer;
    security: SecurityManager;

    async onload() {
        console.log('Loading Obsidian MCP Server...');
        await this.loadSettings();

        if (!this.settings.authToken) {
            this.settings.authToken = require('crypto').randomBytes(16).toString('hex');
            await this.saveSettings();
        }

        this.security = new SecurityManager(this);
        this.addSettingTab(new McpSettingTab(this.app, this));
        this.startServer();
    }

    async onunload() {
        console.log('Unloading Obsidian MCP Server...');
        this.stopServer();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        if (this.security) this.security.reloadRules();
    }

    async saveSettings() {
        await this.saveData(this.settings);
        if (this.security) this.security.reloadRules();
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
                
                if (!this.security.isAllowed(activeFile)) {
                    return { content: [{ type: "text", text: "Access Denied: The active file is restricted." }] };
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
            { path: z.string().describe("Vault-relative path (e.g. 'Notes/Meeting.md')") },
            async ({ path }) => {
                // Initial check string-based (fast fail)
                if (!this.security.isAllowed(path)) {
                    return { content: [{ type: "text", text: `Access Denied: '${path}' is blacklisted.` }], isError: true };
                }

                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                    // Deep check with tags
                    if (!this.security.isAllowed(file)) {
                        return { content: [{ type: "text", text: `Access Denied: '${path}' contains restricted tags.` }], isError: true };
                    }

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
            { text: z.string().describe("Text to append") },
            async ({ text }) => {
                const dailyNotes = getAllDailyNotes();
                const now = moment();
                let file = getDailyNote(now, dailyNotes);
                if (!file) file = await createDailyNote(now);
                
                if (file instanceof TFile) {
                    if (!this.security.isAllowed(file)) {
                        return { content: [{ type: "text", text: "Access Denied: Daily note is restricted." }], isError: true };
                    }
                    const content = await this.app.vault.read(file);
                    await this.app.vault.modify(file, content + "\n" + text);
                    return { content: [{ type: "text", text: `Appended to ${file.path}` }] };
                }
                return { content: [{ type: "text", text: "Failed to resolve daily note." }], isError: true };
            }
        );

        // --- list_folder ---
        this.mcp.tool(
            "list_folder",
            "List files and folders inside a specific directory.",
            { path: z.string().default("/").describe("Directory path (default: root)") },
            async ({ path }) => {
                if (!this.security.isAllowed(path)) {
                    return { content: [{ type: "text", text: `Access Denied: '${path}' is blacklisted.` }], isError: true };
                }

                const folder = path === "/" ? this.app.vault.getRoot() : this.app.vault.getAbstractFileByPath(path);
                if (folder instanceof TFolder) {
                    const children = folder.children
                        // Filter children by path rules (can't check tags efficiently here without reading cache for all)
                        // This is a trade-off: list_folder might show a file that is tag-blocked, but read_note will block it.
                        // We filter by path rules at least.
                        .filter(c => this.security.isAllowed(c.path)) 
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

        // --- list_all_tags ---
        this.mcp.tool(
            "list_all_tags",
            "List all hashtags used in the vault with their usage count.",
            {},
            async () => {
                // @ts-ignore
                const tags = this.app.metadataCache.getTags();
                // Filter out blacklisted tags from the list itself?
                // Yes, don't reveal existence of secret tags.
                // tags is Record<string, number>
                const filteredTags: Record<string, number> = {};
                for (const t in tags) {
                    if (this.security.isTagAllowed(t)) {
                        filteredTags[t] = tags[t];
                    }
                }
                return { content: [{ type: "text", text: JSON.stringify(filteredTags, null, 2) }] };
            }
        );

        // --- search_notes ---
        this.mcp.tool(
            "search_notes",
            "Search for notes by time range and tags. Returns a list of file paths.",
            {
                start_date: z.string().optional().describe("ISO date string (YYYY-MM-DD). Filter notes modified after this date."),
                end_date: z.string().optional().describe("ISO date string. Filter notes modified before this date."),
                tags: z.array(z.string()).optional().describe("List of tags to filter by (e.g. ['#work'])")
            },
            async ({ start_date, end_date, tags }) => {
                let files = this.app.vault.getFiles();

                // Security Filter (Checks Paths AND Tags via getFileCache)
                files = files.filter(f => this.security.isAllowed(f));

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

        new Setting(containerEl)
            .setName('Access Control: Blacklist')
            .setDesc('One rule per line.\n- Paths: "Secret/" blocks folders/files starting with "Secret/".\n- Tags: "#secret" blocks files containing the tag.')
            .addTextArea(text => text
                .setPlaceholder('Secret/\n#private')
                .setValue(this.plugin.settings.blacklist)
                .onChange(async (value) => {
                    this.plugin.settings.blacklist = value;
                    await this.plugin.saveSettings();
                }));
    }
}
