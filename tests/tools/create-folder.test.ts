import { TFile, TFolder } from 'obsidian';
import { registerCreateFolder } from '../../src/tools/create-folder';

describe('create_folder tool', () => {
    let handler: (args: any, extra: any) => Promise<any>;
    const mockMcp = {
        registerTool: jest.fn((_name, _opts, fn) => { handler = fn; }),
    };
    const mockPlugin = {
        app: {
            vault: {
                getAbstractFileByPath: jest.fn(),
                createFolder: jest.fn().mockResolvedValue(undefined),
            },
            metadataCache: {
                getFileCache: jest.fn(() => null),
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
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
        mockPlugin.security.isAllowed.mockReturnValue(true);
        registerCreateFolder(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
    });

    test('creates a new folder', async () => {
        const result = await handler({ path: 'Projects/New' }, { sessionId: 's1' });
        expect(mockPlugin.app.vault.createFolder).toHaveBeenCalledWith('Projects/New');
        expect(result.content[0].text).toContain('Created folder');
    });

    test('returns success message when folder already exists', async () => {
        const folder = new TFolder();
        folder.path = 'Projects/Existing';
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(folder);
        const result = await handler({ path: 'Projects/Existing' }, { sessionId: 's1' });
        expect(mockPlugin.app.vault.createFolder).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain('already exists');
        expect(result.isError).toBeUndefined();
    });

    test('returns error when a file exists at the path', async () => {
        const file = new TFile();
        file.path = 'Projects/file.md';
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(file);
        const result = await handler({ path: 'Projects/file.md' }, { sessionId: 's1' });
        expect(mockPlugin.app.vault.createFolder).not.toHaveBeenCalled();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('file already exists');
    });

    test('returns error when path is access-denied', async () => {
        mockPlugin.security.isAllowed.mockReturnValue(false);
        const result = await handler({ path: 'Secret/folder' }, { sessionId: 's1' });
        expect(result.isError).toBe(true);
        expect(mockPlugin.app.vault.createFolder).not.toHaveBeenCalled();
    });
});
