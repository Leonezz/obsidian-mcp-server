import { normalizePath, getTagsFromCache, getMimeType, isImageMime } from '../src/utils';

describe('normalizePath', () => {
    test('removes .. segments', () => {
        expect(normalizePath('Notes/../Secret/file.md')).toBe('secret/file.md');
    });
    test('removes . segments', () => {
        expect(normalizePath('./Notes/./file.md')).toBe('notes/file.md');
    });
    test('lowercases for case-insensitive comparison', () => {
        expect(normalizePath('Secret/Passwords.md')).toBe('secret/passwords.md');
    });
    test('collapses multiple slashes', () => {
        expect(normalizePath('Notes///file.md')).toBe('notes/file.md');
    });
    test('handles root path', () => {
        expect(normalizePath('/')).toBe('');
    });
    test('handles empty string', () => {
        expect(normalizePath('')).toBe('');
    });
});

describe('getMimeType', () => {
    test('returns correct MIME for known image extensions', () => {
        expect(getMimeType('png')).toBe('image/png');
        expect(getMimeType('jpg')).toBe('image/jpeg');
        expect(getMimeType('jpeg')).toBe('image/jpeg');
        expect(getMimeType('gif')).toBe('image/gif');
        expect(getMimeType('webp')).toBe('image/webp');
        expect(getMimeType('svg')).toBe('image/svg+xml');
    });
    test('returns correct MIME for non-image extensions', () => {
        expect(getMimeType('pdf')).toBe('application/pdf');
        expect(getMimeType('mp3')).toBe('audio/mpeg');
        expect(getMimeType('mp4')).toBe('video/mp4');
        expect(getMimeType('zip')).toBe('application/zip');
    });
    test('returns application/octet-stream for unknown extensions', () => {
        expect(getMimeType('xyz')).toBe('application/octet-stream');
        expect(getMimeType('bin')).toBe('application/octet-stream');
    });
    test('is case-insensitive', () => {
        expect(getMimeType('PNG')).toBe('image/png');
        expect(getMimeType('Jpg')).toBe('image/jpeg');
    });
});

describe('isImageMime', () => {
    test('returns true for image MIME types', () => {
        expect(isImageMime('image/png')).toBe(true);
        expect(isImageMime('image/jpeg')).toBe(true);
        expect(isImageMime('image/svg+xml')).toBe(true);
    });
    test('returns false for non-image MIME types', () => {
        expect(isImageMime('application/pdf')).toBe(false);
        expect(isImageMime('audio/mpeg')).toBe(false);
        expect(isImageMime('application/octet-stream')).toBe(false);
    });
});

describe('getTagsFromCache', () => {
    test('returns empty array for null cache', () => {
        expect(getTagsFromCache(null)).toEqual([]);
    });
    test('extracts inline tags', () => {
        const cache = { tags: [{ tag: '#work' }, { tag: '#meeting' }] } as any;
        expect(getTagsFromCache(cache)).toEqual(['#work', '#meeting']);
    });
    test('extracts frontmatter tags with # prefix', () => {
        const cache = { frontmatter: { tags: ['work', 'meeting'] } } as any;
        expect(getTagsFromCache(cache)).toEqual(['#work', '#meeting']);
    });
    test('handles frontmatter tags as comma-separated string', () => {
        const cache = { frontmatter: { tags: 'work, meeting' } } as any;
        expect(getTagsFromCache(cache)).toEqual(['#work', '#meeting']);
    });
    test('deduplicates inline and frontmatter tags', () => {
        const cache = {
            tags: [{ tag: '#work' }],
            frontmatter: { tags: ['work'] },
        } as any;
        expect(getTagsFromCache(cache)).toEqual(['#work']);
    });
});
