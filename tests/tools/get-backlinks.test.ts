import { TFile } from 'obsidian';
import { registerGetBacklinks } from '../../src/tools/get-backlinks';

describe('get_backlinks tool', () => {
    let handler: (args: any, extra: any) => Promise<any>;
    const mockMcp = {
        registerTool: jest.fn((_name, _opts, fn) => { handler = fn; }),
    };

    const targetFile = Object.assign(new TFile(), {
        path: 'Concepts/UART.md',
        name: 'UART.md',
        basename: 'UART',
        stat: { mtime: 1000, ctime: 900, size: 50 },
    });

    const sourceFile1 = Object.assign(new TFile(), {
        path: 'Projects/overview.md',
        name: 'overview.md',
        basename: 'overview',
        stat: { mtime: 2000, ctime: 1000, size: 200 },
    });

    const sourceFile2 = Object.assign(new TFile(), {
        path: 'Notes/debugging.md',
        name: 'debugging.md',
        basename: 'debugging',
        stat: { mtime: 3000, ctime: 1500, size: 300 },
    });

    const resolvedLinks: Record<string, Record<string, number>> = {
        'Projects/overview.md': { 'Concepts/UART.md': 1 },
        'Notes/debugging.md': { 'Concepts/UART.md': 2, 'Concepts/SPI.md': 1 },
        'Notes/unrelated.md': { 'Concepts/SPI.md': 1 },
    };

    const mockPlugin = {
        app: {
            vault: {
                getAbstractFileByPath: jest.fn((path: string) => {
                    if (path === 'Concepts/UART.md') return targetFile;
                    if (path === 'Projects/overview.md') return sourceFile1;
                    if (path === 'Notes/debugging.md') return sourceFile2;
                    return null;
                }),
                read: jest.fn((file: any) => {
                    if (file.path === 'Projects/overview.md') {
                        return Promise.resolve('The device communicates over [[UART]] at 115200 baud.');
                    }
                    if (file.path === 'Notes/debugging.md') {
                        return Promise.resolve('The primary debug interface is [[UART]].\nAlso uses [[SPI]].');
                    }
                    return Promise.resolve('');
                }),
            },
            metadataCache: {
                getFileCache: jest.fn(() => null),
                resolvedLinks,
            },
        },
        security: {
            isAllowed: jest.fn().mockReturnValue(true),
        },
    };
    const mockTracker = { track: (_name: string, fn: any) => fn };
    const mockLogger = { info: jest.fn(), warning: jest.fn(), error: jest.fn(), debug: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
        mockPlugin.security.isAllowed.mockReturnValue(true);
        mockPlugin.app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
            if (path === 'Concepts/UART.md') return targetFile;
            if (path === 'Projects/overview.md') return sourceFile1;
            if (path === 'Notes/debugging.md') return sourceFile2;
            return null;
        });
        mockPlugin.app.metadataCache.resolvedLinks = { ...resolvedLinks };
        registerGetBacklinks(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
    });

    test('returns backlinks with context', async () => {
        const result = await handler({ path: 'Concepts/UART.md' }, { sessionId: 's1' });
        const data = result.structuredContent;
        expect(data.count).toBe(2);
        expect(data.backlinks).toEqual(expect.arrayContaining([
            expect.objectContaining({
                source: 'Projects/overview.md',
                context: expect.stringContaining('[[UART]]'),
            }),
            expect.objectContaining({
                source: 'Notes/debugging.md',
                context: expect.stringContaining('[[UART]]'),
            }),
        ]));
    });

    test('returns empty backlinks for note with no incoming links', async () => {
        mockPlugin.app.metadataCache.resolvedLinks = {};
        registerGetBacklinks(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
        const result = await handler({ path: 'Concepts/UART.md' }, { sessionId: 's1' });
        expect(result.structuredContent.count).toBe(0);
        expect(result.structuredContent.backlinks).toEqual([]);
    });

    test('filters out access-denied source files', async () => {
        mockPlugin.security.isAllowed.mockImplementation((pathOrFile: any) => {
            const p = typeof pathOrFile === 'string' ? pathOrFile : pathOrFile.path;
            return p !== 'Projects/overview.md';
        });
        registerGetBacklinks(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
        const result = await handler({ path: 'Concepts/UART.md' }, { sessionId: 's1' });
        expect(result.structuredContent.count).toBe(1);
        expect(result.structuredContent.backlinks[0].source).toBe('Notes/debugging.md');
    });

    test('returns error when target path is access-denied', async () => {
        mockPlugin.security.isAllowed.mockReturnValue(false);
        registerGetBacklinks(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
        const result = await handler({ path: 'Secret/private.md' }, { sessionId: 's1' });
        expect(result.isError).toBe(true);
    });

    test('returns error when target file does not exist', async () => {
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
        registerGetBacklinks(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
        const result = await handler({ path: 'Nonexistent.md' }, { sessionId: 's1' });
        expect(result.isError).toBe(true);
    });

    test('handles aliased wikilinks [[Target|alias]]', async () => {
        mockPlugin.app.vault.read.mockImplementation((file: any) => {
            if (file.path === 'Projects/overview.md') {
                return Promise.resolve('See [[UART|serial port]] for details.');
            }
            return Promise.resolve('Uses [[UART]].');
        });
        registerGetBacklinks(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
        const result = await handler({ path: 'Concepts/UART.md' }, { sessionId: 's1' });
        const overview = result.structuredContent.backlinks.find(
            (b: any) => b.source === 'Projects/overview.md'
        );
        expect(overview.context).toContain('[[UART|serial port]]');
    });
});
