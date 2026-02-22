
export interface McpPluginSettings {
    port: number;
    authToken: string;
    blacklist: string;
    // Phase 1: Instructions
    enableInstructions: boolean;
    customInstructions: string;
    includeVaultStructure: boolean;
    // Phase 2: Prompts
    enablePrompts: boolean;
    enableMarkdownGuide: boolean;
    enableCanvasGuide: boolean;
    enableBasesGuide: boolean;
    // Phase 3: Resources
    enableResources: boolean;
    enableResourceSubscriptions: boolean;
    maxResourcesListed: number;
    // Phase 4: Annotations
    enableSmartAnnotations: boolean;
}

export const DEFAULT_SETTINGS: McpPluginSettings = {
    port: 27123,
    authToken: '',
    blacklist: 'Secret/\n#secret',
    enableInstructions: true,
    customInstructions: '',
    includeVaultStructure: true,
    enablePrompts: true,
    enableMarkdownGuide: true,
    enableCanvasGuide: true,
    enableBasesGuide: true,
    enableResources: true,
    enableResourceSubscriptions: true,
    maxResourcesListed: 500,
    enableSmartAnnotations: true,
};

export interface ToolCallStats {
    total: number;
    successful: number;
    failed: number;
}

export type ToolUsageStats = Record<string, ToolCallStats>;

export interface McpPluginData {
    settings: McpPluginSettings;
    toolStats: ToolUsageStats;
}

export const DEFAULT_DATA: McpPluginData = {
    settings: { ...DEFAULT_SETTINGS },
    toolStats: {},
};

export interface FileInfo {
    name: string;
    path: string;
    type: 'file' | 'folder';
}

export interface SearchResult {
    path: string;
    mtime: string;
    tags: string[];
}

export interface ActiveFileResult {
    path: string;
    frontmatter: Record<string, unknown>;
    content: string;
}

export interface VaultOverview {
    name: string;
    fileCount: number;
    folderCount: number;
    totalSizeBytes: number;
    fileTypes: Record<string, number>;
    tagCount: number;
}

export interface NoteMetadata {
    path: string;
    name: string;
    createdAt: string;
    modifiedAt: string;
    sizeBytes: number;
    frontmatter: Record<string, unknown>;
    tags: string[];
    headings: Array<{ level: number; heading: string }>;
    links: string[];
}

export interface ContentSearchResult {
    path: string;
    matches: Array<{ line: number; text: string }>;
}

export interface SessionSummary {
    sessionId: string;
    clientName: string;
    clientVersion: string;
    connectedAt: string;
    lastActiveAt: string;
    durationSeconds: number;
    toolCalls: {
        total: number;
        successful: number;
        failed: number;
        byTool: ToolUsageStats;
    };
}
