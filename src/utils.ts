import { CachedMetadata } from 'obsidian';

export function normalizePath(p: string): string {
    const segments = p.split('/').filter(s => s !== '.' && s !== '');
    const resolved: string[] = [];
    for (const seg of segments) {
        if (seg === '..') {
            resolved.pop();
        } else {
            resolved.push(seg);
        }
    }
    return resolved.join('/').toLowerCase();
}

export function getTagsFromCache(cache: CachedMetadata | null): string[] {
    if (!cache) return [];
    const tagSet = new Set<string>();
    cache.tags?.forEach(t => tagSet.add(t.tag));
    const fmTags = cache.frontmatter?.tags;
    if (Array.isArray(fmTags)) {
        fmTags.forEach(t => tagSet.add('#' + String(t)));
    } else if (typeof fmTags === 'string') {
        fmTags.split(',').forEach(t => tagSet.add('#' + t.trim()));
    }
    return Array.from(tagSet);
}
