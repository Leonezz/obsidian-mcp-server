import * as crypto from 'crypto';
import { Plugin } from 'obsidian';
import { McpPluginSettings, DEFAULT_SETTINGS } from './types';
import { SecurityManager } from './security';
import { McpHttpServer } from './server';
import { McpSettingTab } from './settings';

export default class McpPlugin extends Plugin {
    settings: McpPluginSettings = { ...DEFAULT_SETTINGS };
    security!: SecurityManager;
    private mcpServer!: McpHttpServer;

    async onload(): Promise<void> {
        await this.loadSettings();

        if (!this.settings.authToken) {
            this.settings.authToken = crypto.randomBytes(16).toString('hex');
            await this.saveSettings();
        }

        this.security = new SecurityManager(this);
        this.mcpServer = new McpHttpServer(this);
        this.addSettingTab(new McpSettingTab(this.app, this));
        this.mcpServer.start();
    }

    async onunload(): Promise<void> {
        this.mcpServer.stop();
    }

    async loadSettings(): Promise<void> {
        this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
        if (this.settings.port < 1024 || this.settings.port > 65535) {
            this.settings.port = DEFAULT_SETTINGS.port;
        }
        if (this.security) this.security.reloadRules();
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        if (this.security) this.security.reloadRules();
    }

    restartServer(): void {
        if (!this.mcpServer) return;
        this.mcpServer.stop();
        this.mcpServer.start();
    }
}
