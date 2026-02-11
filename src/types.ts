
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

export interface FileInfo {
    name: string;
    path: string;
    type: 'file' | 'folder';
}

export interface SearchResult {
    path: string;
    mtime: string;
    tags: string[] | undefined;
}

export interface ActiveFileResult {
    path: string;
    frontmatter: Record<string, unknown>;
    content: string;
}
