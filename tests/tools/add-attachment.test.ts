import { TFolder } from 'obsidian';
import { registerAddAttachment } from '../../src/tools/add-attachment';

describe('add_attachment tool', () => {
    let handler: (args: any, extra: any) => Promise<any>;
    const mockMcp = {
        registerTool: jest.fn((_name, _opts, fn) => { handler = fn; }),
    };
    const mockPlugin = {
        app: {
            vault: {
                getAbstractFileByPath: jest.fn(),
                createFolder: jest.fn().mockResolvedValue(undefined),
                createBinary: jest.fn().mockResolvedValue(undefined),
            },
            fileManager: {
                getAvailablePathForAttachment: jest.fn().mockReturnValue('Attachments/diagram.png'),
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

    const smallBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');

    beforeEach(() => {
        jest.clearAllMocks();
        mockPlugin.security.isAllowed.mockReturnValue(true);
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
        registerAddAttachment(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
    });

    test('creates attachment with explicit folder', async () => {
        const result = await handler(
            { filename: 'diagram.png', data: smallBase64, folder: 'Images' },
            { sessionId: 's1' },
        );
        expect(mockPlugin.app.vault.createFolder).toHaveBeenCalledWith('Images');
        expect(mockPlugin.app.vault.createBinary).toHaveBeenCalledWith(
            'Images/diagram.png',
            expect.any(ArrayBuffer),
        );
        expect(result.content[0].text).toContain('Images/diagram.png');
    });

    test('creates attachment using getAvailablePathForAttachment when no folder', async () => {
        mockPlugin.app.fileManager.getAvailablePathForAttachment.mockReturnValue('Attachments/photo.jpg');
        const result = await handler(
            { filename: 'photo.jpg', data: smallBase64 },
            { sessionId: 's1' },
        );
        expect(mockPlugin.app.fileManager.getAvailablePathForAttachment).toHaveBeenCalledWith('photo.jpg');
        expect(mockPlugin.app.vault.createBinary).toHaveBeenCalledWith(
            'Attachments/photo.jpg',
            expect.any(ArrayBuffer),
        );
        expect(result.content[0].text).toContain('Attachments/photo.jpg');
    });

    test('returns error when data exceeds size limit', async () => {
        const hugeData = 'A'.repeat(10 * 1024 * 1024 + 1);
        const result = await handler(
            { filename: 'big.bin', data: hugeData },
            { sessionId: 's1' },
        );
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('exceeds maximum size');
        expect(mockPlugin.app.vault.createBinary).not.toHaveBeenCalled();
    });

    test('returns error when folder is access-denied', async () => {
        mockPlugin.security.isAllowed.mockReturnValueOnce(false);
        const result = await handler(
            { filename: 'img.png', data: smallBase64, folder: 'Secret' },
            { sessionId: 's1' },
        );
        expect(result.isError).toBe(true);
        expect(mockPlugin.app.vault.createBinary).not.toHaveBeenCalled();
    });

    test('handles existing folder gracefully', async () => {
        const folder = new TFolder();
        folder.path = 'Images';
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(folder);
        const result = await handler(
            { filename: 'img.png', data: smallBase64, folder: 'Images' },
            { sessionId: 's1' },
        );
        expect(mockPlugin.app.vault.createFolder).not.toHaveBeenCalled();
        expect(mockPlugin.app.vault.createBinary).toHaveBeenCalled();
        expect(result.content[0].text).toContain('Images/img.png');
    });

    test('returns the vault-relative path for embedding', async () => {
        const result = await handler(
            { filename: 'chart.svg', data: smallBase64, folder: 'Assets' },
            { sessionId: 's1' },
        );
        expect(result.content[0].text).toBe('Created attachment at Assets/chart.svg');
    });
});
