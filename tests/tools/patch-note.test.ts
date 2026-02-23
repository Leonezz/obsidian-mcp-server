import { TFile } from 'obsidian';
import { registerPatchNote } from '../../src/tools/patch-note';

describe('patch_note tool', () => {
    let handler: (args: any, extra: any) => Promise<any>;
    const mockMcp = {
        registerTool: jest.fn((_name, _opts, fn) => { handler = fn; }),
    };
    const mockFile = Object.assign(new TFile(), {
        path: 'Notes/project.md',
        name: 'project.md',
        stat: { mtime: 1000, ctime: 900, size: 200 },
    });
    const mockPlugin = {
        app: {
            vault: {
                getAbstractFileByPath: jest.fn(() => mockFile),
                read: jest.fn(),
                modify: jest.fn().mockResolvedValue(undefined),
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
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFile);
        registerPatchNote(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
    });

    test('replaces a unique match', async () => {
        mockPlugin.app.vault.read.mockResolvedValue('status: draft\ntitle: My Note');
        const result = await handler(
            { path: 'Notes/project.md', old_string: 'status: draft', new_string: 'status: published' },
            { sessionId: 's1' }
        );
        expect(mockPlugin.app.vault.modify).toHaveBeenCalledWith(
            mockFile,
            'status: published\ntitle: My Note'
        );
        expect(result.content[0].text).toContain('Patched');
    });

    test('returns error when old_string not found', async () => {
        mockPlugin.app.vault.read.mockResolvedValue('some content');
        const result = await handler(
            { path: 'Notes/project.md', old_string: 'nonexistent', new_string: 'replacement' },
            { sessionId: 's1' }
        );
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not found');
        expect(mockPlugin.app.vault.modify).not.toHaveBeenCalled();
    });

    test('returns error when old_string matches multiple locations', async () => {
        mockPlugin.app.vault.read.mockResolvedValue('foo bar foo baz');
        const result = await handler(
            { path: 'Notes/project.md', old_string: 'foo', new_string: 'qux' },
            { sessionId: 's1' }
        );
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('multiple locations');
        expect(mockPlugin.app.vault.modify).not.toHaveBeenCalled();
    });

    test('returns error when path is access-denied', async () => {
        mockPlugin.security.isAllowed.mockReturnValue(false);
        const result = await handler(
            { path: 'Secret/note.md', old_string: 'a', new_string: 'b' },
            { sessionId: 's1' }
        );
        expect(result.isError).toBe(true);
        expect(mockPlugin.app.vault.modify).not.toHaveBeenCalled();
    });

    test('returns error when file does not exist', async () => {
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
        const result = await handler(
            { path: 'Missing.md', old_string: 'a', new_string: 'b' },
            { sessionId: 's1' }
        );
        expect(result.isError).toBe(true);
    });

    test('handles replacement that deletes content (empty new_string)', async () => {
        mockPlugin.app.vault.read.mockResolvedValue('keep this remove-me keep that');
        const result = await handler(
            { path: 'Notes/project.md', old_string: ' remove-me', new_string: '' },
            { sessionId: 's1' }
        );
        expect(mockPlugin.app.vault.modify).toHaveBeenCalledWith(
            mockFile,
            'keep this keep that'
        );
        expect(result.content[0].text).toContain('Patched');
    });
});
