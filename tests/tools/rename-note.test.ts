import { TFile } from 'obsidian';
import { registerRenameNote } from '../../src/tools/rename-note';

describe('rename_note tool', () => {
    let handler: (args: any, extra: any) => Promise<any>;
    const mockMcp = {
        registerTool: jest.fn((_name, _opts, fn) => { handler = fn; }),
    };
    const mockFile = Object.assign(new TFile(), {
        path: 'Inbox/idea.md',
        name: 'idea.md',
        stat: { mtime: 1000, ctime: 900, size: 100 },
    });
    const mockPlugin = {
        app: {
            vault: {
                getAbstractFileByPath: jest.fn(),
            },
            metadataCache: { getFileCache: jest.fn(() => null) },
            fileManager: {
                renameFile: jest.fn().mockResolvedValue(undefined),
            },
        },
        security: { isAllowed: jest.fn().mockReturnValue(true) },
    };
    const mockTracker = { track: (_name: string, fn: any) => fn };
    const mockLogger = { info: jest.fn(), warning: jest.fn(), error: jest.fn(), debug: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
        mockPlugin.security.isAllowed.mockReturnValue(true);
        mockPlugin.app.vault.getAbstractFileByPath.mockImplementation((p: string) => {
            if (p === 'Inbox/idea.md') return mockFile;
            return null; // new_path doesn't exist
        });
        registerRenameNote(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
    });

    test('renames a note to a new path', async () => {
        const result = await handler(
            { path: 'Inbox/idea.md', new_path: 'Projects/idea.md' },
            { sessionId: 's1' }
        );
        expect(mockPlugin.app.fileManager.renameFile).toHaveBeenCalledWith(mockFile, 'Projects/idea.md');
        expect(result.content[0].text).toContain('Renamed');
    });

    test('returns error when destination already exists', async () => {
        const existingFile = Object.assign(new TFile(), { path: 'Projects/idea.md' });
        mockPlugin.app.vault.getAbstractFileByPath.mockImplementation((p: string) => {
            if (p === 'Inbox/idea.md') return mockFile;
            if (p === 'Projects/idea.md') return existingFile;
            return null;
        });
        const result = await handler(
            { path: 'Inbox/idea.md', new_path: 'Projects/idea.md' },
            { sessionId: 's1' }
        );
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('already exists');
        expect(mockPlugin.app.fileManager.renameFile).not.toHaveBeenCalled();
    });

    test('returns error when source does not exist', async () => {
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
        const result = await handler(
            { path: 'Missing.md', new_path: 'Dest.md' },
            { sessionId: 's1' }
        );
        expect(result.isError).toBe(true);
        expect(mockPlugin.app.fileManager.renameFile).not.toHaveBeenCalled();
    });

    test('returns error when source path is access-denied', async () => {
        mockPlugin.security.isAllowed.mockImplementation((p: any) => {
            const path = typeof p === 'string' ? p : p.path;
            return path !== 'Secret/note.md';
        });
        const result = await handler(
            { path: 'Secret/note.md', new_path: 'Public/note.md' },
            { sessionId: 's1' }
        );
        expect(result.isError).toBe(true);
        expect(mockPlugin.app.fileManager.renameFile).not.toHaveBeenCalled();
    });

    test('returns error when destination path is access-denied', async () => {
        mockPlugin.security.isAllowed.mockImplementation((p: any) => {
            const path = typeof p === 'string' ? p : p.path;
            return path !== 'Secret/dest.md';
        });
        const result = await handler(
            { path: 'Inbox/idea.md', new_path: 'Secret/dest.md' },
            { sessionId: 's1' }
        );
        expect(result.isError).toBe(true);
        expect(mockPlugin.app.fileManager.renameFile).not.toHaveBeenCalled();
    });
});
