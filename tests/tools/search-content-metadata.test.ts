import { TFile } from 'obsidian';
import { registerSearchContent } from '../../src/tools/search-content';

describe('search_content include_metadata', () => {
    let handler: (args: any, extra: any) => Promise<any>;
    const mockMcp = {
        registerTool: jest.fn((_name, _opts, fn) => { handler = fn; }),
    };
    const makeFile = (path: string, content: string) => {
        const f = Object.assign(new TFile(), {
            path,
            name: path.split('/').pop(),
            extension: 'md',
            stat: { mtime: 1000, ctime: 900, size: content.length },
        });
        return { file: f, content };
    };

    const files = [
        makeFile('Notes/todo.md', 'TODO: fix bug\nDone'),
        makeFile('Notes/log.md', 'All good\nNo issues here'),
    ];

    const caches: Record<string, any> = {
        'Notes/todo.md': {
            frontmatter: { status: 'active', priority: 'high' },
            tags: [{ tag: '#work' }],
        },
        'Notes/log.md': {
            frontmatter: { status: 'archived' },
            tags: [{ tag: '#log' }],
        },
    };

    const mockPlugin = {
        app: {
            vault: {
                getFiles: jest.fn(() => files.map(f => f.file)),
                read: jest.fn((file: any) => {
                    const match = files.find(f => f.file.path === file.path);
                    return Promise.resolve(match?.content ?? '');
                }),
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
        mockPlugin.app.metadataCache.getFileCache.mockImplementation((f: any) => caches[f.path] ?? null);
        registerSearchContent(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
    });

    test('results do not include frontmatter by default', async () => {
        const result = await handler({ query: 'TODO' }, { sessionId: 's1' });
        const data = result.structuredContent;
        expect(data.results).toHaveLength(1);
        expect(data.results[0]).not.toHaveProperty('frontmatter');
        expect(data.results[0]).not.toHaveProperty('tags');
    });

    test('results include frontmatter and tags when include_metadata=true', async () => {
        const result = await handler({ query: 'TODO', include_metadata: true }, { sessionId: 's1' });
        const data = result.structuredContent;
        expect(data.results).toHaveLength(1);
        expect(data.results[0].frontmatter).toEqual({ status: 'active', priority: 'high' });
        expect(data.results[0].tags).toEqual(['#work']);
    });

    test('metadata includes empty values for notes without frontmatter', async () => {
        // Override cache to have no frontmatter for todo.md
        mockPlugin.app.metadataCache.getFileCache.mockImplementation((f: any) => {
            if (f.path === 'Notes/todo.md') return null;
            return caches[f.path] ?? null;
        });
        const result = await handler({ query: 'TODO', include_metadata: true }, { sessionId: 's1' });
        const data = result.structuredContent;
        expect(data.results).toHaveLength(1);
        expect(data.results[0].frontmatter).toEqual({});
        expect(data.results[0].tags).toEqual([]);
    });

    test('metadata works combined with folder filter', async () => {
        const result = await handler(
            { query: 'TODO', include_metadata: true, folder: 'Notes/' },
            { sessionId: 's1' }
        );
        const data = result.structuredContent;
        expect(data.results).toHaveLength(1);
        expect(data.results[0].frontmatter).toEqual({ status: 'active', priority: 'high' });
    });
});
