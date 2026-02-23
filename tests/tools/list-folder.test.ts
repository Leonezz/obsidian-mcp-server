import { TFile, TFolder } from 'obsidian';
import { registerListFolder } from '../../src/tools/list-folder';

describe('list_folder tool', () => {
    let handler: (args: any, extra: any) => Promise<any>;
    const mockMcp = {
        registerTool: jest.fn((_name, _opts, fn) => { handler = fn; }),
    };

    const makeFile = (path: string, mtime: number, size: number) => {
        const f = Object.assign(new TFile(), {
            path,
            name: path.split('/').pop(),
            extension: path.split('.').pop() ?? '',
            stat: { mtime, ctime: mtime - 100, size },
        });
        return f;
    };

    const makeFolder = (path: string, children: any[] = []) => {
        const f = Object.assign(new TFolder(), {
            path,
            name: path.split('/').pop() || path,
            children,
        });
        return f;
    };

    // Build a folder hierarchy:
    // Projects/
    //   alpha/
    //     notes.md (mtime: 3000, size: 500)
    //     data.csv (mtime: 1000, size: 200)
    //   beta.md (mtime: 2000, size: 300)
    //   readme.txt (mtime: 4000, size: 100)

    const alphaNotesFile = makeFile('Projects/alpha/notes.md', 3000, 500);
    const alphaDataFile = makeFile('Projects/alpha/data.csv', 1000, 200);
    const alphaFolder = makeFolder('Projects/alpha', [alphaNotesFile, alphaDataFile]);
    const betaFile = makeFile('Projects/beta.md', 2000, 300);
    const readmeFile = makeFile('Projects/readme.txt', 4000, 100);
    const projectsFolder = makeFolder('Projects', [alphaFolder, betaFile, readmeFile]);

    const mockPlugin = {
        app: {
            vault: {
                getRoot: jest.fn(),
                getAbstractFileByPath: jest.fn((p: string) => {
                    if (p === 'Projects') return projectsFolder;
                    if (p === 'Projects/alpha') return alphaFolder;
                    return null;
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
        mockPlugin.app.vault.getAbstractFileByPath.mockImplementation((p: string) => {
            if (p === 'Projects') return projectsFolder;
            if (p === 'Projects/alpha') return alphaFolder;
            if (p === 'Projects/alpha/notes.md') return alphaNotesFile;
            if (p === 'Projects/alpha/data.csv') return alphaDataFile;
            if (p === 'Projects/beta.md') return betaFile;
            if (p === 'Projects/readme.txt') return readmeFile;
            return null;
        });
        registerListFolder(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
    });

    test('lists immediate children (default behavior)', async () => {
        const result = await handler({ path: 'Projects' }, { sessionId: 's1' });
        const items = result.structuredContent.items;
        expect(items).toHaveLength(3);
        expect(items.map((i: any) => i.name)).toEqual(expect.arrayContaining(['alpha', 'beta.md', 'readme.txt']));
    });

    test('sort_by name ascending', async () => {
        const result = await handler({ path: 'Projects', sort_by: 'name', sort_order: 'asc' }, { sessionId: 's1' });
        const names = result.structuredContent.items.map((i: any) => i.name);
        expect(names).toEqual(['alpha', 'beta.md', 'readme.txt']);
    });

    test('sort_by name descending', async () => {
        const result = await handler({ path: 'Projects', sort_by: 'name', sort_order: 'desc' }, { sessionId: 's1' });
        const names = result.structuredContent.items.map((i: any) => i.name);
        expect(names).toEqual(['readme.txt', 'beta.md', 'alpha']);
    });

    test('sort_by modified descending', async () => {
        const result = await handler({ path: 'Projects', sort_by: 'modified', sort_order: 'desc' }, { sessionId: 's1' });
        const names = result.structuredContent.items.map((i: any) => i.name);
        // readme.txt (4000) > alpha (folder, no mtime → 0) > beta.md (2000)
        // Folders have no stat, so they sort to end when sorting by modified desc
        expect(names[0]).toBe('readme.txt');
        expect(names[1]).toBe('beta.md');
    });

    test('filter by file_types', async () => {
        const result = await handler({ path: 'Projects', file_types: ['.md'] }, { sessionId: 's1' });
        const items = result.structuredContent.items;
        // Should include beta.md and alpha folder (folders always included)
        const fileItems = items.filter((i: any) => i.type === 'file');
        expect(fileItems).toHaveLength(1);
        expect(fileItems[0].name).toBe('beta.md');
        // Folders are always included
        expect(items.some((i: any) => i.type === 'folder')).toBe(true);
    });

    test('recursive listing', async () => {
        const result = await handler({ path: 'Projects', recursive: true }, { sessionId: 's1' });
        const items = result.structuredContent.items;
        // Should include: alpha/ folder, beta.md, readme.txt, alpha/notes.md, alpha/data.csv
        expect(items).toHaveLength(5);
        expect(items.map((i: any) => i.path)).toEqual(expect.arrayContaining([
            'Projects/alpha',
            'Projects/beta.md',
            'Projects/readme.txt',
            'Projects/alpha/notes.md',
            'Projects/alpha/data.csv',
        ]));
    });

    test('recursive with depth limit', async () => {
        const result = await handler({ path: 'Projects', recursive: true, depth: 1 }, { sessionId: 's1' });
        const items = result.structuredContent.items;
        // depth=1 means immediate children only (same as non-recursive)
        expect(items).toHaveLength(3);
    });

    test('recursive with file_types filter', async () => {
        const result = await handler({ path: 'Projects', recursive: true, file_types: ['.md'] }, { sessionId: 's1' });
        const items = result.structuredContent.items;
        const files = items.filter((i: any) => i.type === 'file');
        expect(files.every((f: any) => f.name.endsWith('.md'))).toBe(true);
        expect(files).toHaveLength(2); // beta.md and alpha/notes.md
    });

    test('access denied returns error', async () => {
        mockPlugin.security.isAllowed.mockReturnValue(false);
        const result = await handler({ path: 'Secret' }, { sessionId: 's1' });
        expect(result.isError).toBe(true);
    });
});
