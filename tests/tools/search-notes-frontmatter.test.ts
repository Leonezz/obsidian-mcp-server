import { TFile } from 'obsidian';

jest.mock('moment', () => {
    const m = (val: any) => ({ format: () => String(val), valueOf: () => val });
    m.default = m;
    return m;
});

import { registerSearchNotes } from '../../src/tools/search-notes';

describe('search_notes frontmatter filter', () => {
    let handler: (args: any, extra: any) => Promise<any>;
    const mockMcp = {
        registerTool: jest.fn((_name, _opts, fn) => { handler = fn; }),
    };

    const makeFile = (path: string, mtime: number) => {
        return Object.assign(new TFile(), {
            path,
            name: path.split('/').pop(),
            extension: 'md',
            stat: { mtime, ctime: mtime - 100, size: 100 },
        });
    };

    const fileA = makeFile('Notes/draft.md', 1000);
    const fileB = makeFile('Notes/published.md', 2000);
    const fileC = makeFile('Notes/nofront.md', 3000);

    const caches: Record<string, any> = {
        'Notes/draft.md': { frontmatter: { status: 'draft', priority: 'high' } },
        'Notes/published.md': { frontmatter: { status: 'published', priority: 'low' } },
        'Notes/nofront.md': null,
    };

    const mockPlugin = {
        app: {
            vault: {
                getFiles: jest.fn(() => [fileA, fileB, fileC]),
            },
            metadataCache: {
                getFileCache: jest.fn((f: any) => caches[f.path] ?? null),
            },
        },
        security: { isAllowed: jest.fn().mockReturnValue(true) },
    };
    const mockTracker = { track: (_name: string, fn: any) => fn };
    const mockLogger = { info: jest.fn(), warning: jest.fn(), error: jest.fn(), debug: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
        mockPlugin.security.isAllowed.mockReturnValue(true);
        registerSearchNotes(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
    });

    test('no frontmatter filter returns all files', async () => {
        const result = await handler({}, { sessionId: 's1' });
        expect(result.structuredContent.results).toHaveLength(3);
    });

    test('filters by single frontmatter field', async () => {
        const result = await handler({ frontmatter: { status: 'draft' } }, { sessionId: 's1' });
        expect(result.structuredContent.results).toHaveLength(1);
        expect(result.structuredContent.results[0].path).toBe('Notes/draft.md');
    });

    test('filters by multiple frontmatter fields (AND logic)', async () => {
        const result = await handler(
            { frontmatter: { status: 'draft', priority: 'high' } },
            { sessionId: 's1' }
        );
        expect(result.structuredContent.results).toHaveLength(1);
        expect(result.structuredContent.results[0].path).toBe('Notes/draft.md');
    });

    test('returns empty when no notes match frontmatter', async () => {
        const result = await handler(
            { frontmatter: { status: 'draft', priority: 'low' } },
            { sessionId: 's1' }
        );
        expect(result.structuredContent.results).toHaveLength(0);
    });

    test('excludes files with no frontmatter', async () => {
        const result = await handler(
            { frontmatter: { status: 'published' } },
            { sessionId: 's1' }
        );
        expect(result.structuredContent.results).toHaveLength(1);
        expect(result.structuredContent.results[0].path).toBe('Notes/published.md');
    });

    test('combines frontmatter with tags filter', async () => {
        // Add tags to cache
        caches['Notes/draft.md'] = {
            frontmatter: { status: 'draft', priority: 'high' },
            tags: [{ tag: '#work' }],
        };
        caches['Notes/published.md'] = {
            frontmatter: { status: 'published', priority: 'low' },
            tags: [{ tag: '#personal' }],
        };
        registerSearchNotes(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);

        const result = await handler(
            { tags: ['#work'], frontmatter: { status: 'draft' } },
            { sessionId: 's1' }
        );
        expect(result.structuredContent.results).toHaveLength(1);
        expect(result.structuredContent.results[0].path).toBe('Notes/draft.md');
    });
});
