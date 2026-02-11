
export interface McpPluginSettings {
    port: number;
    authToken: string;
    blacklist: string;
}

export const DEFAULT_SETTINGS: McpPluginSettings = {
    port: 27123,
    authToken: '',
    blacklist: 'Secret/\n#secret',
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
