import { EventRef } from 'obsidian';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type McpPlugin from '../main';

export class ResourceSubscriptionManager {
    private sessions = new Set<McpServer>();
    private eventRefs: EventRef[] = [];

    constructor(private plugin: McpPlugin) {}

    start(): void {
        if (!this.plugin.settings.enableResourceSubscriptions) return;

        const vault = this.plugin.app.vault;

        this.eventRefs.push(
            vault.on('modify', (file) => {
                const uri = `obsidian://notes/${encodeURIComponent(file.path)}`;
                for (const mcp of this.sessions) {
                    mcp.server.sendResourceUpdated({ uri }).catch(() => { /* closed */ });
                }
            }),
        );

        this.eventRefs.push(
            vault.on('create', () => {
                for (const mcp of this.sessions) {
                    mcp.sendResourceListChanged();
                }
            }),
        );

        this.eventRefs.push(
            vault.on('delete', () => {
                for (const mcp of this.sessions) {
                    mcp.sendResourceListChanged();
                }
            }),
        );

        this.eventRefs.push(
            vault.on('rename', () => {
                for (const mcp of this.sessions) {
                    mcp.sendResourceListChanged();
                }
            }),
        );
    }

    stop(): void {
        for (const ref of this.eventRefs) {
            this.plugin.app.vault.offref(ref);
        }
        this.eventRefs = [];
        this.sessions.clear();
    }

    registerSession(mcp: McpServer): void {
        this.sessions.add(mcp);
    }

    unregisterSession(mcp: McpServer): void {
        this.sessions.delete(mcp);
    }
}
