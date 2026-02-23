import { TFile } from 'obsidian';
import { registerReadAttachment } from '../../src/tools/read-attachment';

describe('read_attachment tool', () => {
    let handler: (args: any, extra: any) => Promise<any>;
    const mockMcp = {
        registerTool: jest.fn((_name, _opts, fn) => { handler = fn; }),
    };
    const mockPlugin = {
        app: {
            vault: {
                getAbstractFileByPath: jest.fn(),
                readBinary: jest.fn(),
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

    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    const mockImageFile = Object.assign(new TFile(), {
        path: 'Attachments/diagram.png',
        name: 'diagram.png',
        extension: 'png',
        stat: { mtime: 1000, ctime: 900, size: 4 },
    });
    const mockPdfFile = Object.assign(new TFile(), {
        path: 'Docs/report.pdf',
        name: 'report.pdf',
        extension: 'pdf',
        stat: { mtime: 1000, ctime: 900, size: 100 },
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockPlugin.security.isAllowed.mockReturnValue(true);
        mockPlugin.app.vault.readBinary.mockResolvedValue(pngBytes);
        registerReadAttachment(mockMcp as any, mockPlugin as any, mockTracker as any, mockLogger as any);
    });

    test('reads image file and returns ImageContent with correct base64/mimeType', async () => {
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockImageFile);
        const result = await handler({ path: 'Attachments/diagram.png' }, { sessionId: 's1' });
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('image');
        expect(result.content[0].mimeType).toBe('image/png');
        expect(result.content[0].data).toBe(Buffer.from(pngBytes).toString('base64'));
    });

    test('reads non-image file and returns text content with metadata', async () => {
        const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockPdfFile);
        mockPlugin.app.vault.readBinary.mockResolvedValue(pdfBytes);
        const result = await handler({ path: 'Docs/report.pdf' }, { sessionId: 's1' });
        expect(result.content[0].type).toBe('text');
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.path).toBe('Docs/report.pdf');
        expect(parsed.mimeType).toBe('application/pdf');
        expect(parsed.sizeBytes).toBe(4);
    });

    test('returns error for non-existent path', async () => {
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
        const result = await handler({ path: 'missing.png' }, { sessionId: 's1' });
        expect(result.isError).toBe(true);
    });

    test('returns error for access-denied path', async () => {
        mockPlugin.security.isAllowed.mockReturnValue(false);
        const result = await handler({ path: 'Secret/img.png' }, { sessionId: 's1' });
        expect(result.isError).toBe(true);
        expect(mockPlugin.app.vault.readBinary).not.toHaveBeenCalled();
    });

    test('returns error when tag rule blocks access', async () => {
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockImageFile);
        mockPlugin.security.isAllowed
            .mockReturnValueOnce(true)   // path check passes
            .mockReturnValueOnce(false); // file (tag) check fails
        const result = await handler({ path: 'Attachments/diagram.png' }, { sessionId: 's1' });
        expect(result.isError).toBe(true);
        expect(mockPlugin.app.vault.readBinary).not.toHaveBeenCalled();
    });

    test('detects MIME type from extension correctly', async () => {
        const jpgFile = Object.assign(new TFile(), {
            path: 'photo.jpg', name: 'photo.jpg', extension: 'jpg',
            stat: { mtime: 1000, ctime: 900, size: 4 },
        });
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(jpgFile);
        const result = await handler({ path: 'photo.jpg' }, { sessionId: 's1' });
        expect(result.content[0].type).toBe('image');
        expect(result.content[0].mimeType).toBe('image/jpeg');
    });
});
