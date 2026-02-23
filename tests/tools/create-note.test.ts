import { TFile } from 'obsidian';
import { registerCreateNote } from '../../src/tools/create-note';

describe('create_note tool', () => {
    let handler: (args: any, extra: any) => Promise<any>;
    const mockMcp = {
        registerTool: jest.fn((_name, _opts, fn) => { handler = fn; }),
    };
    const mockPlugin = {
        app: {
            vault: {
                getAbstractFileByPath: jest.fn(),
                create: jest.fn().mockResolvedValue(undefined),
                createFolder: jest.fn().mockResolvedValue(undefined),
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
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
        registerCreateNote(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
    });

    test('creates a note at the given path', async () => {
        const result = await handler({ path: 'Notes/new.md', content: 'Hello' }, { sessionId: 's1' });
        expect(mockPlugin.app.vault.create).toHaveBeenCalledWith('Notes/new.md', 'Hello');
        expect(result.content[0].text).toContain('Created');
    });

    test('returns error when file already exists', async () => {
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(new TFile());
        const result = await handler({ path: 'Notes/existing.md', content: 'Hello' }, { sessionId: 's1' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('already exists');
        expect(mockPlugin.app.vault.create).not.toHaveBeenCalled();
    });

    test('returns error when path is access-denied', async () => {
        mockPlugin.security.isAllowed.mockReturnValue(false);
        const result = await handler({ path: 'Secret/note.md', content: 'Hello' }, { sessionId: 's1' });
        expect(result.isError).toBe(true);
        expect(mockPlugin.app.vault.create).not.toHaveBeenCalled();
    });

    test('auto-creates parent folders when they do not exist', async () => {
        const result = await handler(
            { path: 'Projects/NewProject/SubFolder/note.md', content: 'Hello' },
            { sessionId: 's1' }
        );
        expect(mockPlugin.app.vault.createFolder).toHaveBeenCalledWith('Projects/NewProject/SubFolder');
        expect(mockPlugin.app.vault.create).toHaveBeenCalledWith('Projects/NewProject/SubFolder/note.md', 'Hello');
        expect(result.content[0].text).toContain('Created');
    });

    test('does not call createFolder for root-level notes', async () => {
        const result = await handler({ path: 'note.md', content: 'Hello' }, { sessionId: 's1' });
        expect(mockPlugin.app.vault.createFolder).not.toHaveBeenCalled();
        expect(mockPlugin.app.vault.create).toHaveBeenCalledWith('note.md', 'Hello');
        expect(result.content[0].text).toContain('Created');
    });

    test('handles createFolder failure gracefully (folder may already exist)', async () => {
        mockPlugin.app.vault.createFolder.mockRejectedValueOnce(new Error('Folder already exists'));
        const result = await handler(
            { path: 'Existing/Folder/note.md', content: 'Hello' },
            { sessionId: 's1' }
        );
        // Should still succeed — folder already existing is fine
        expect(mockPlugin.app.vault.create).toHaveBeenCalledWith('Existing/Folder/note.md', 'Hello');
        expect(result.content[0].text).toContain('Created');
    });
});
