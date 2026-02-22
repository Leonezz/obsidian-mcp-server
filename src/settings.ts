import * as crypto from 'crypto';
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type McpPlugin from './main';

export class McpSettingTab extends PluginSettingTab {
    private plugin: McpPlugin;
    private portRestartTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(app: App, plugin: McpPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Obsidian MCP Server' });

        // --- Server Section ---
        new Setting(containerEl)
            .setName('Server Port')
            .setDesc('Port to listen on (1024-65535). Default: 27123. Server restarts on change.')
            .addText(text => text
                .setValue(String(this.plugin.settings.port))
                .onChange(async (value) => {
                    const port = parseInt(value, 10);
                    if (isNaN(port) || port < 1024 || port > 65535) return;
                    this.plugin.settings.port = port;
                    await this.plugin.saveSettings();
                    if (this.portRestartTimeout) clearTimeout(this.portRestartTimeout);
                    this.portRestartTimeout = setTimeout(() => {
                        this.plugin.restartServer();
                    }, 1000);
                }));

        new Setting(containerEl)
            .setName('Auth Token')
            .setDesc('Required for connecting. Use the Authorization header: Bearer <token>')
            .addText(text => text
                .setValue(this.plugin.settings.authToken)
                .setDisabled(true))
            .addExtraButton(btn => btn
                .setIcon('copy')
                .onClick(() => {
                    navigator.clipboard.writeText(this.plugin.settings.authToken);
                    new Notice('Token copied');
                }));

        new Setting(containerEl)
            .setName('Regenerate Token')
            .addButton(btn => btn
                .setButtonText('Regenerate')
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.authToken = crypto.randomBytes(16).toString('hex');
                    await this.plugin.saveSettings();
                    this.display();
                    this.plugin.restartServer();
                }));

        new Setting(containerEl)
            .setName('Access Control: Blacklist')
            .setDesc('One rule per line. Paths: "Secret/" blocks folders/files. Tags: "#secret" blocks files with that tag.')
            .addTextArea(text => text
                .setPlaceholder('Secret/\n#private')
                .setValue(this.plugin.settings.blacklist)
                .onChange(async (value) => {
                    this.plugin.settings.blacklist = value;
                    await this.plugin.saveSettings();
                }));

        // --- Agent Instructions Section ---
        containerEl.createEl('h3', { text: 'Agent Instructions' });

        new Setting(containerEl)
            .setName('Enable Instructions')
            .setDesc('Send vault context and usage guidelines to AI agents on connect. Server restarts on change.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableInstructions)
                .onChange(async (value) => {
                    this.plugin.settings.enableInstructions = value;
                    await this.plugin.saveSettings();
                    this.plugin.restartServer();
                }));

        new Setting(containerEl)
            .setName('Include Vault Structure')
            .setDesc('Include top-level folder names in instructions.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeVaultStructure)
                .onChange(async (value) => {
                    this.plugin.settings.includeVaultStructure = value;
                    await this.plugin.saveSettings();
                    this.plugin.restartServer();
                }));

        new Setting(containerEl)
            .setName('Custom Instructions')
            .setDesc('Additional instructions appended to the agent context. Server restarts on change.')
            .addTextArea(text => text
                .setPlaceholder('e.g., Always use #project tag when creating notes...')
                .setValue(this.plugin.settings.customInstructions)
                .onChange(async (value) => {
                    this.plugin.settings.customInstructions = value;
                    await this.plugin.saveSettings();
                    this.plugin.restartServer();
                }));

        // --- Prompts Section ---
        containerEl.createEl('h3', { text: 'Format Guides (Prompts)' });

        new Setting(containerEl)
            .setName('Enable Prompts')
            .setDesc('Expose Obsidian format reference guides as MCP prompts. Server restarts on change.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enablePrompts)
                .onChange(async (value) => {
                    this.plugin.settings.enablePrompts = value;
                    await this.plugin.saveSettings();
                    this.plugin.restartServer();
                }));

        new Setting(containerEl)
            .setName('Obsidian Markdown Guide')
            .setDesc('Wikilinks, embeds, callouts, frontmatter, tags.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableMarkdownGuide)
                .onChange(async (value) => {
                    this.plugin.settings.enableMarkdownGuide = value;
                    await this.plugin.saveSettings();
                    this.plugin.restartServer();
                }));

        new Setting(containerEl)
            .setName('JSON Canvas Guide')
            .setDesc('.canvas file format reference.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableCanvasGuide)
                .onChange(async (value) => {
                    this.plugin.settings.enableCanvasGuide = value;
                    await this.plugin.saveSettings();
                    this.plugin.restartServer();
                }));

        new Setting(containerEl)
            .setName('Obsidian Bases Guide')
            .setDesc('.base file format reference.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableBasesGuide)
                .onChange(async (value) => {
                    this.plugin.settings.enableBasesGuide = value;
                    await this.plugin.saveSettings();
                    this.plugin.restartServer();
                }));

        // --- Resources Section ---
        containerEl.createEl('h3', { text: 'Resources' });

        new Setting(containerEl)
            .setName('Enable Resources')
            .setDesc('Expose vault content as MCP resources (notes, tags, folders, daily notes). Server restarts on change.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableResources)
                .onChange(async (value) => {
                    this.plugin.settings.enableResources = value;
                    await this.plugin.saveSettings();
                    this.plugin.restartServer();
                }));

        new Setting(containerEl)
            .setName('Enable Resource Subscriptions')
            .setDesc('Notify connected AI agents when vault files change. Requires plugin restart.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableResourceSubscriptions)
                .onChange(async (value) => {
                    this.plugin.settings.enableResourceSubscriptions = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Max Resources Listed')
            .setDesc('Maximum number of resources returned in list operations (1-5000).')
            .addText(text => text
                .setValue(String(this.plugin.settings.maxResourcesListed))
                .onChange(async (value) => {
                    const num = parseInt(value, 10);
                    if (isNaN(num) || num < 1 || num > 5000) return;
                    this.plugin.settings.maxResourcesListed = num;
                    await this.plugin.saveSettings();
                }));

        // --- Smart Features Section ---
        containerEl.createEl('h3', { text: 'Smart Features' });

        new Setting(containerEl)
            .setName('Smart Annotations')
            .setDesc('Add contextual hints to read_note/get_active_file responses (draft status, large note warnings, broken links).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableSmartAnnotations)
                .onChange(async (value) => {
                    this.plugin.settings.enableSmartAnnotations = value;
                    await this.plugin.saveSettings();
                }));

        // --- Sessions Section ---
        this.renderSessionsSection(containerEl);

        // --- Stats Section ---
        this.renderStatsSection(containerEl);
    }

    private renderSessionsSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Active Sessions' });

        const summaries = this.plugin.mcpServer.getSessionSummaries();

        if (summaries.length === 0) {
            containerEl.createEl('p', {
                text: 'No active sessions.',
                cls: 'mcp-stats-empty',
            });
            return;
        }

        const table = containerEl.createEl('table', { cls: 'mcp-stats-table' });
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Client' });
        headerRow.createEl('th', { text: 'Session ID' });
        headerRow.createEl('th', { text: 'Connected' });
        headerRow.createEl('th', { text: 'Last Active' });
        headerRow.createEl('th', { text: 'Tool Calls' });

        const tbody = table.createEl('tbody');
        for (const s of summaries) {
            const row = tbody.createEl('tr');
            const clientLabel = s.clientVersion
                ? `${s.clientName} (${s.clientVersion})`
                : s.clientName;
            row.createEl('td', { text: clientLabel });
            row.createEl('td', { text: `...${s.sessionId}` });
            row.createEl('td', { text: this.formatRelativeTime(s.connectedAt) });
            row.createEl('td', { text: this.formatRelativeTime(s.lastActiveAt) });
            row.createEl('td', { text: String(s.toolCalls.total) });
        }
    }

    private formatRelativeTime(isoString: string): string {
        const time = new Date(isoString).getTime();
        if (isNaN(time)) return 'unknown';
        const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
    }

    private renderStatsSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Tool Usage Statistics' });

        const stats = this.plugin.toolStats;
        const toolNames = Object.keys(stats);

        if (toolNames.length === 0) {
            containerEl.createEl('p', {
                text: 'No tool usage recorded yet.',
                cls: 'mcp-stats-empty',
            });
        } else {
            const table = containerEl.createEl('table', { cls: 'mcp-stats-table' });
            const thead = table.createEl('thead');
            const headerRow = thead.createEl('tr');
            headerRow.createEl('th', { text: 'Tool' });
            headerRow.createEl('th', { text: 'Total' });
            headerRow.createEl('th', { text: 'Successful' });
            headerRow.createEl('th', { text: 'Failed' });

            const tbody = table.createEl('tbody');
            for (const name of toolNames.sort()) {
                const s = stats[name];
                const row = tbody.createEl('tr');
                row.createEl('td', { text: name });
                row.createEl('td', { text: String(s.total) });
                row.createEl('td', { text: String(s.successful) });
                row.createEl('td', { text: String(s.failed) });
            }
        }

        new Setting(containerEl)
            .setName('Reset Statistics')
            .setDesc('Clear all tool usage statistics.')
            .addButton(btn => btn
                .setButtonText('Reset')
                .setWarning()
                .onClick(async () => {
                    await this.plugin.resetStats();
                    this.display();
                    new Notice('Tool usage statistics reset');
                }));
    }
}
