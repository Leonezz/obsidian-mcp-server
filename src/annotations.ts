import { TFile } from 'obsidian';
import type McpPlugin from './main';

interface ContentAnnotation {
    type: 'text';
    text: string;
    annotations: {
        audience: ['assistant'];
        priority: number;
    };
}

const LARGE_NOTE_THRESHOLD = 50 * 1024; // 50KB

export function generateNoteAnnotations(plugin: McpPlugin, file: TFile, content: string): ContentAnnotation[] {
    if (!plugin.settings.enableSmartAnnotations) return [];

    const annotations: ContentAnnotation[] = [];
    const cache = plugin.app.metadataCache.getFileCache(file);

    // Draft status detection
    const status = cache?.frontmatter?.status;
    if (typeof status === 'string' && status.toLowerCase() === 'draft') {
        annotations.push({
            type: 'text',
            text: '[Note Status: DRAFT] This note is marked as draft and may contain incomplete or unverified content.',
            annotations: { audience: ['assistant'], priority: 0.8 },
        });
    }

    // Large note warning
    if (content.length > LARGE_NOTE_THRESHOLD) {
        const sizeKB = Math.round(content.length / 1024);
        annotations.push({
            type: 'text',
            text: `[Large Note: ${sizeKB}KB] This is a large note. Consider using get_note_metadata first to check structure before reading full content.`,
            annotations: { audience: ['assistant'], priority: 0.6 },
        });
    }

    // Broken wikilink detection
    if (cache?.links) {
        const brokenLinks: string[] = [];
        for (const link of cache.links) {
            const target = link.link.split('#')[0].split('|')[0];
            if (target && !plugin.app.metadataCache.getFirstLinkpathDest(target, file.path)) {
                brokenLinks.push(target);
            }
        }
        if (brokenLinks.length > 0) {
            const linkList = brokenLinks.slice(0, 5).join(', ');
            const suffix = brokenLinks.length > 5 ? ` and ${brokenLinks.length - 5} more` : '';
            annotations.push({
                type: 'text',
                text: `[Broken Links: ${brokenLinks.length}] Unresolved wikilinks: ${linkList}${suffix}`,
                annotations: { audience: ['assistant'], priority: 0.5 },
            });
        }
    }

    return annotations;
}
