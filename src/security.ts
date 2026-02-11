import { TFile, CachedMetadata } from 'obsidian';
import { normalizePath, getTagsFromCache } from './utils';

interface SecurityPluginRef {
    settings: { blacklist: string };
    app: {
        vault: { getAbstractFileByPath(path: string): any };
        metadataCache: { getFileCache(file: TFile): CachedMetadata | null };
    };
}

export class SecurityManager {
    private pathRules: string[] = [];
    private tagRules: string[] = [];

    constructor(private plugin: SecurityPluginRef) {
        this.reloadRules();
    }

    reloadRules(): void {
        const lines = this.plugin.settings.blacklist
            .split('\n')
            .map(x => x.trim())
            .filter(x => x.length > 0);
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
            const abstractFile = this.plugin.app.vault.getAbstractFileByPath(path);
            if (abstractFile && 'stat' in abstractFile) {
                path = abstractFile.path;
                const cache = this.plugin.app.metadataCache.getFileCache(abstractFile as TFile);
                tags = getTagsFromCache(cache);
            }
        } else {
            path = fileOrPath.path;
            const cache = this.plugin.app.metadataCache.getFileCache(fileOrPath);
            tags = getTagsFromCache(cache);
        }

        const normalizedPath = normalizePath(path);
        if (this.pathRules.some(rule => normalizedPath.startsWith(normalizePath(rule)))) {
            return false;
        }

        if (this.tagRules.length > 0 && tags.length > 0) {
            if (tags.some(fileTag => this.tagRules.some(rule => fileTag.startsWith(rule)))) {
                return false;
            }
        }

        return true;
    }
}
