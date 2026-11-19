import { TFile } from 'obsidian';
const moment = jest.requireActual('moment');
import { registerAppendDailyNote } from '../../src/tools/append-daily-note';
import { SecurityManager } from '../../src/security';

jest.mock('obsidian', () => ({
    ...jest.requireActual('../__mocks__/obsidian'),
    moment: jest.requireActual('moment'),
    normalizePath: (path: string) => path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '') || '/',
}));

// Keep the real dependency's settings, template, directory and creation code.
jest.mock('obsidian-daily-notes-interface', () => ({
    ...jest.requireActual('obsidian-daily-notes-interface'),
    getAllDailyNotes: jest.fn(() => ({})),
    getDailyNote: jest.fn(() => existingFile),
}));
let existingFile: TFile | null;

describe('append_daily_note creation authorization', () => {
    let handler: (args: { text: string }) => Promise<any>;
    let plugin: any;
    let options: { folder: string; format: string; template: string };
    let files: Map<string, TFile>;
    let contents: Map<string, string>;
    beforeEach(() => {
        existingFile = null;
        files = new Map();
        contents = new Map();
        options = { folder: 'Daily', format: 'YYYY/MM/DD', template: '' };
        const vault = {
            getAbstractFileByPath: jest.fn((path: string) => files.get(path) ?? null),
            createFolder: jest.fn(async () => {}),
            create: jest.fn(async (path: string, content: string) => {
                const file = Object.assign(new TFile(), { path });
                files.set(path, file); contents.set(path, content); return file;
            }),
            cachedRead: jest.fn(async () => '#private'),
            read: jest.fn(async (file: TFile) => contents.get(file.path) ?? ''),
            modify: jest.fn(async (file: TFile, content: string) => { contents.set(file.path, content); }),
        };
        plugin = { settings: { blacklist: '' }, app: {
            vault,
            metadataCache: { getFileCache: jest.fn(() => ({})), getFirstLinkpathDest: jest.fn((): TFile | null => null) },
            foldManager: { load: jest.fn(), save: jest.fn() },
            plugins: { getPlugin: (): null => null },
            internalPlugins: { getPluginById: () => ({ instance: { options } }) },
        } };
        plugin.security = new SecurityManager(plugin);
        (globalThis as any).window = { app: plugin.app, moment };
        registerAppendDailyNote({ registerTool: (_n: any, _o: any, fn: any) => { handler = fn; } } as any,
            plugin, { track: (_n: any, fn: any) => fn } as any,
            { error: jest.fn(), warning: jest.fn() } as any);
    });
    afterEach(() => { delete (globalThis as any).window; });
    function deny(rule: string) { plugin.settings.blacklist = rule; plugin.security.reloadRules(); }
    function expectNoWrites() {
        expect(plugin.app.vault.createFolder).not.toHaveBeenCalled();
        expect(plugin.app.vault.create).not.toHaveBeenCalled();
        expect(plugin.app.vault.modify).not.toHaveBeenCalled();
        expect(plugin.app.foldManager.save).not.toHaveBeenCalled();
    }
    test.each(['YYYY-MM-DD', 'YYYY/MM/DD', 'YYYY/MM/DD[.md]'])('denied missing %s note creates neither files nor directories', async format => {
        options.format = format; deny('daily');
        expect((await handler({ text: 'secret' })).isError).toBe(true);
        expectNoWrites(); expect(plugin.app.vault.cachedRead).not.toHaveBeenCalled();
    });
    test('allowed missing nested note creates and appends using real dependency', async () => {
        const result = await handler({ text: 'hello' });
        expect(result.isError).toBeUndefined();
        expect(plugin.app.vault.createFolder).toHaveBeenCalledTimes(1);
        expect(plugin.app.vault.create).toHaveBeenCalledTimes(1);
        expect([...contents.values()]).toEqual(['\nhello']);
    });
    test('allowed template is rendered and appended without tag restrictions', async () => {
        options.template = 'Templates/daily';
        plugin.app.metadataCache.getFirstLinkpathDest.mockReturnValue(Object.assign(new TFile(), { path: 'Templates/daily.md' }));
        plugin.app.vault.cachedRead.mockResolvedValue('Welcome {{title}}');
        expect((await handler({ text: 'hello' })).isError).toBeUndefined();
        expect([...contents.values()][0]).toMatch(/^Welcome \d{4}\/\d{2}\/\d{2}\nhello$/);
    });
    test('root-folder filename ending in .md is created without a duplicate extension', async () => {
        options.folder = ''; options.format = 'YYYY-MM-DD[.md]';
        expect((await handler({ text: 'hello' })).isError).toBeUndefined();
        expect([...files.keys()][0]).toMatch(/^\d{4}-\d{2}-\d{2}\.md$/);
        expect(plugin.app.vault.createFolder).not.toHaveBeenCalled();
    });
    test('existing denied note is not modified', async () => {
        existingFile = Object.assign(new TFile(), { path: 'Daily/today.md' }); deny('Daily');
        expect((await handler({ text: 'secret' })).isError).toBe(true); expectNoWrites();
    });
    test('existing blocked tag is not modified', async () => {
        existingFile = Object.assign(new TFile(), { path: 'Daily/today.md' }); deny('#private');
        plugin.app.metadataCache.getFileCache.mockReturnValue({ tags: [{ tag: '#private' }] });
        expect((await handler({ text: 'secret' })).isError).toBe(true); expectNoWrites();
    });
    test('unindexed existing note fails closed with tag restrictions', async () => {
        existingFile = Object.assign(new TFile(), { path: 'Daily/today.md' }); deny('#private');
        plugin.app.metadataCache.getFileCache.mockReturnValue(null);
        expect((await handler({ text: 'secret' })).isError).toBe(true); expectNoWrites();
    });
    test('template with tag restrictions is refused before any side effects', async () => {
        options.template = 'Templates/daily'; deny('#private');
        expect((await handler({ text: 'secret' })).isError).toBe(true); expectNoWrites();
        expect(plugin.app.vault.cachedRead).not.toHaveBeenCalled();
    });
    test('blocked template path is not read or copied', async () => {
        options.template = 'Templates/daily'; deny('Templates');
        expect((await handler({ text: 'secret' })).isError).toBe(true); expectNoWrites();
        expect(plugin.app.vault.cachedRead).not.toHaveBeenCalled();
    });
    test('resolved blocked template alias is not read', async () => {
        options.template = 'daily-template'; deny('Private');
        plugin.app.metadataCache.getFirstLinkpathDest.mockReturnValue(Object.assign(new TFile(), { path: 'Private/daily-template.md' }));
        expect((await handler({ text: 'secret' })).isError).toBe(true); expectNoWrites();
    });
    test('tag restrictions permit creation without a template', async () => {
        deny('#private'); expect((await handler({ text: 'hello' })).isError).toBeUndefined();
    });
    test('retains authorization check on created file', async () => {
        jest.spyOn(plugin.security, 'isAllowed').mockReturnValueOnce(true).mockReturnValueOnce(false);
        expect((await handler({ text: 'secret' })).isError).toBe(true);
        expect(plugin.app.vault.modify).not.toHaveBeenCalled();
    });
});
