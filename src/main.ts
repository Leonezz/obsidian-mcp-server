import * as crypto from "crypto";
import { Plugin } from "obsidian";
import { McpPluginSettings, DEFAULT_SETTINGS, ToolUsageStats } from "./types";
import { SecurityManager } from "./security";
import { McpHttpServer } from "./server";
import { McpSettingTab } from "./settings";
import { StatsTracker } from "./stats";
import { ResourceSubscriptionManager } from "./resources/subscriptions";

export default class McpPlugin extends Plugin {
  settings: McpPluginSettings = { ...DEFAULT_SETTINGS };
  toolStats: ToolUsageStats = {};
  statsTracker!: StatsTracker;
  security!: SecurityManager;
  mcpServer!: McpHttpServer;
  private subscriptionManager!: ResourceSubscriptionManager;

  async onload(): Promise<void> {
    console.log("[MCP] Plugin loading");
    await this.loadSettings();

    if (!this.settings.authToken) {
      this.settings.authToken = crypto.randomBytes(16).toString("hex");
      await this.saveSettings();
    }

    this.statsTracker = new StatsTracker(
      () => this.toolStats,
      (stats) => {
        this.toolStats = stats;
      },
      () => this.saveStats(),
    );

    this.security = new SecurityManager(this);
    this.mcpServer = new McpHttpServer(this);
    this.statsTracker.setOnToolResult((sessionId, toolName, success) => {
      this.mcpServer.recordSessionToolCall(sessionId, toolName, success);
    });
    this.subscriptionManager = new ResourceSubscriptionManager(this);
    this.mcpServer.setSubscriptionManager(this.subscriptionManager);
    this.addSettingTab(new McpSettingTab(this.app, this));
    this.mcpServer.start();
    this.subscriptionManager.start();
  }

  async onunload(): Promise<void> {
    console.log("[MCP] Plugin unloading");
    await this.statsTracker.flush();
    this.subscriptionManager.stop();
    this.mcpServer.stop();
  }

  async loadSettings(): Promise<void> {
    const raw = (await this.loadData()) ?? {};

    // Backward-compatible: detect old format (flat settings) vs new { settings, toolStats }
    if ("settings" in raw && typeof raw.settings === "object") {
      this.settings = { ...DEFAULT_SETTINGS, ...raw.settings };
      this.toolStats = raw.toolStats ?? {};
    } else {
      this.settings = { ...DEFAULT_SETTINGS, ...raw };
      this.toolStats = {};
    }

    if (this.settings.port < 1024 || this.settings.port > 65535) {
      this.settings.port = DEFAULT_SETTINGS.port;
    }
    const validAddresses = ["127.0.0.1", "0.0.0.0"];
    if (!validAddresses.includes(this.settings.listenAddress)) {
      this.settings.listenAddress = DEFAULT_SETTINGS.listenAddress;
    }
    if (this.security) this.security.reloadRules();
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ settings: this.settings, toolStats: this.toolStats });
    if (this.security) this.security.reloadRules();
  }

  async saveStats(): Promise<void> {
    await this.saveData({ settings: this.settings, toolStats: this.toolStats });
  }

  async resetStats(): Promise<void> {
    this.toolStats = {};
    await this.saveStats();
  }

  restartServer(): void {
    if (!this.mcpServer) return;
    this.mcpServer.stop();
    this.mcpServer.start();
  }
}
