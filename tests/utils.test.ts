import { normalizePath, getTagsFromCache } from '../src/utils';

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
