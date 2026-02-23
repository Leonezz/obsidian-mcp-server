import { TFile } from 'obsidian';
import { registerSearchContent } from '../../src/tools/search-content';

describe('search_content tool', () => {
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
        makeFile('Notes/todo.md', 'TODO: fix bug\nFIXME: handle edge case\nDone'),
        makeFile('Notes/log.md', 'All good\nNo issues here'),
        makeFile('Notes/code.md', 'function getData() {\n  return fetch(url);\n}'),
    ];

    const mockPlugin = {
        app: {
            vault: {
                getFiles: jest.fn(() => files.map(f => f.file)),
                read: jest.fn((file: any) => {
                    const match = files.find(f => f.file.path === file.path);
                    return Promise.resolve(match?.content ?? '');
                }),
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

    test('plain text search (default, case-insensitive)', async () => {
        const result = await handler({ query: 'todo', regex: false }, { sessionId: 's1' });
        const data = result.structuredContent;
        expect(data.results).toHaveLength(1);
        expect(data.results[0].path).toBe('Notes/todo.md');
        expect(data.results[0].matches[0].line).toBe(1);
    });

    test('regex search matches pattern', async () => {
        const result = await handler({ query: 'TODO|FIXME', regex: true }, { sessionId: 's1' });
        const data = result.structuredContent;
        expect(data.results).toHaveLength(1);
        expect(data.results[0].matches).toHaveLength(2);
    });

    test('regex search with special pattern', async () => {
        const result = await handler({ query: 'function\\s+\\w+', regex: true }, { sessionId: 's1' });
        const data = result.structuredContent;
        expect(data.results).toHaveLength(1);
        expect(data.results[0].path).toBe('Notes/code.md');
    });

    test('invalid regex returns error', async () => {
        const result = await handler({ query: '[invalid', regex: true }, { sessionId: 's1' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid regex');
    });

    test('regex=false uses plain text matching', async () => {
        // "getData()" as plain text — parentheses are literal, not regex
        const result = await handler({ query: 'getData()', regex: false }, { sessionId: 's1' });
        const data = result.structuredContent;
        expect(data.results).toHaveLength(1);
        expect(data.results[0].path).toBe('Notes/code.md');
    });
});
