import { TFile } from 'obsidian';
import { registerAppendNote } from '../../src/tools/append-note';

describe('append_note tool', () => {
    let handler: (args: any, extra: any) => Promise<any>;
    const mockMcp = {
        registerTool: jest.fn((_name, _opts, fn) => { handler = fn; }),
    };
    const existingContent = 'Line 1\nLine 2';
    const mockFile = Object.assign(new TFile(), {
        path: 'Notes/todo.md',
        name: 'todo.md',
        stat: { mtime: 1000, ctime: 900, size: 100 },
    });
    const mockPlugin = {
        app: {
            vault: {
                getAbstractFileByPath: jest.fn(),
                read: jest.fn().mockResolvedValue(existingContent),
                modify: jest.fn().mockResolvedValue(undefined),
            },
            metadataCache: {
                getFileCache: jest.fn(() => null),
            },
        },
        security: {
            isAllowed: jest.fn().mockReturnValue(true),
        },
    };
    const mockTracker = {
        track: (_name: string, fn: any) => fn,
    };
    const mockLogger = {
        info: jest.fn(),
        warning: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFile);
        mockPlugin.app.vault.read.mockResolvedValue(existingContent);
        mockPlugin.security.isAllowed.mockReturnValue(true);
        registerAppendNote(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
    });

    test('appends content to the end of a note', async () => {
        const result = await handler(
            { path: 'Notes/todo.md', content: '- [ ] New task', mode: 'append' },
            { sessionId: 's1' }
        );
        expect(mockPlugin.app.vault.modify).toHaveBeenCalledWith(
            mockFile,
            existingContent + '\n' + '- [ ] New task'
        );
        expect(result.content[0].text).toContain('Appended to');
    });

    test('prepends content to the beginning of a note', async () => {
        const result = await handler(
            { path: 'Notes/todo.md', content: '# Header', mode: 'prepend' },
            { sessionId: 's1' }
        );
        expect(mockPlugin.app.vault.modify).toHaveBeenCalledWith(
            mockFile,
            '# Header' + '\n' + existingContent
        );
        expect(result.content[0].text).toContain('Prepended to');
    });

    test('defaults to append mode', async () => {
        await handler(
            { path: 'Notes/todo.md', content: 'extra', mode: 'append' },
            { sessionId: 's1' }
        );
        expect(mockPlugin.app.vault.modify).toHaveBeenCalledWith(
            mockFile,
            existingContent + '\n' + 'extra'
        );
    });

    test('returns error when path is access-denied', async () => {
        mockPlugin.security.isAllowed.mockReturnValue(false);
        const result = await handler(
            { path: 'Secret/private.md', content: 'text', mode: 'append' },
            { sessionId: 's1' }
        );
        expect(result.isError).toBe(true);
        expect(mockPlugin.app.vault.modify).not.toHaveBeenCalled();
    });

    test('returns error when file does not exist', async () => {
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
        const result = await handler(
            { path: 'Nonexistent.md', content: 'text', mode: 'append' },
            { sessionId: 's1' }
        );
        expect(result.isError).toBe(true);
        expect(mockPlugin.app.vault.modify).not.toHaveBeenCalled();
    });

    test('returns error when tag rule blocks access', async () => {
        mockPlugin.security.isAllowed
            .mockReturnValueOnce(true)   // path check passes
            .mockReturnValueOnce(false); // file (tag) check fails
        const result = await handler(
            { path: 'Notes/todo.md', content: 'text', mode: 'append' },
            { sessionId: 's1' }
        );
        expect(result.isError).toBe(true);
        expect(mockPlugin.app.vault.modify).not.toHaveBeenCalled();
    });
});
