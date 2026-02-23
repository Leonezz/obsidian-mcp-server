import { CachedMetadata } from 'obsidian';

const MIME_TYPES: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
    bmp: 'image/bmp', ico: 'image/x-icon', tiff: 'image/tiff',
    pdf: 'application/pdf', mp3: 'audio/mpeg', wav: 'audio/wav',
    mp4: 'video/mp4', zip: 'application/zip',
};

export function getMimeType(extension: string): string {
    return MIME_TYPES[extension.toLowerCase()] ?? 'application/octet-stream';
}

export function isImageMime(mimeType: string): boolean {
    return mimeType.startsWith('image/');
}

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
