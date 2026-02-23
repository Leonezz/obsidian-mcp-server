import { TFile } from 'obsidian';
import { registerSearchContent } from '../../src/tools/search-content';

describe('search_content folder scope', () => {
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
        makeFile('Projects/alpha/notes.md', 'TODO: finish alpha'),
        makeFile('Projects/beta/notes.md', 'TODO: start beta'),
        makeFile('Archive/old.md', 'TODO: archive this'),
    ];

    const mockPlugin = {
        app: {
            vault: {
                getFiles: jest.fn(() => files.map(f => f.file)),
                read: jest.fn((file: any) => {
                    const match = files.find(f => f.file.path === file.path);
                    return Promise.resolve(match?.content ?? '');
                }),
                getAbstractFileByPath: jest.fn(),
            },
            metadataCache: { getFileCache: jest.fn(() => null) },
        },
        security: { isAllowed: jest.fn().mockReturnValue(true) },
    };
    const mockTracker = { track: (_name: string, fn: any) => fn };
    const mockLogger = { info: jest.fn(), warning: jest.fn(), error: jest.fn(), debug: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
        mockPlugin.security.isAllowed.mockReturnValue(true);
        registerSearchContent(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
    });

    test('no folder searches all files', async () => {
        const result = await handler({ query: 'TODO' }, { sessionId: 's1' });
        expect(result.structuredContent.results).toHaveLength(3);
    });

    test('folder restricts search to matching paths', async () => {
        const result = await handler({ query: 'TODO', folder: 'Projects/' }, { sessionId: 's1' });
        expect(result.structuredContent.results).toHaveLength(2);
        expect(result.structuredContent.results.every((r: any) => r.path.startsWith('Projects/'))).toBe(true);
    });

    test('folder with subfolder scope', async () => {
        const result = await handler({ query: 'TODO', folder: 'Projects/alpha' }, { sessionId: 's1' });
        expect(result.structuredContent.results).toHaveLength(1);
        expect(result.structuredContent.results[0].path).toBe('Projects/alpha/notes.md');
    });

    test('returns error when folder path is access-denied', async () => {
        mockPlugin.security.isAllowed.mockImplementation((p: any) => {
            const path = typeof p === 'string' ? p : p.path;
            return path !== 'Secret/';
        });
        const result = await handler({ query: 'TODO', folder: 'Secret/' }, { sessionId: 's1' });
        expect(result.isError).toBe(true);
    });
});
