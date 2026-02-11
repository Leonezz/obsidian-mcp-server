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
    }
}
