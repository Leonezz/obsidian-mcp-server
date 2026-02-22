import McpPlugin from '../src/main';
import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS } from '../src/types';

describe('McpPlugin', () => {
    let app: any;
    let plugin: McpPlugin;

    beforeEach(() => {
        app = {
            workspace: { getActiveFile: jest.fn() },
            vault: {
                read: jest.fn(),
                modify: jest.fn(),
                create: jest.fn(),
                delete: jest.fn(),
                getName: jest.fn(() => 'TestVault'),
                getAbstractFileByPath: jest.fn(),
                getRoot: jest.fn(),
                getFiles: jest.fn(() => []),
            },
            metadataCache: {
                getFileCache: jest.fn(),
                getTags: jest.fn(() => ({})),
            },
        };
        plugin = new McpPlugin(app, {} as any);
    });

    test('should be an instance of Plugin', () => {
        expect(plugin).toBeInstanceOf(Plugin);
    });

    test('should have default settings', () => {
        expect(plugin.settings.port).toBe(DEFAULT_SETTINGS.port);
        expect(plugin.settings.blacklist).toBe(DEFAULT_SETTINGS.blacklist);
    });

    test('loadSettings merges with defaults', async () => {
        (plugin as any).loadData = jest.fn().mockResolvedValue({ port: 9999 });
        await plugin.loadSettings();
        expect(plugin.settings.port).toBe(9999);
        expect(plugin.settings.blacklist).toBe(DEFAULT_SETTINGS.blacklist);
    });

    test('loadSettings handles new format with settings + toolStats', async () => {
        (plugin as any).loadData = jest.fn().mockResolvedValue({
            settings: { port: 8888, authToken: 'abc', blacklist: '' },
            toolStats: { read_note: { total: 5, successful: 4, failed: 1 } },
        });
        await plugin.loadSettings();
        expect(plugin.settings.port).toBe(8888);
        expect(plugin.toolStats.read_note.total).toBe(5);
    });

    test('loadSettings handles new format with missing toolStats', async () => {
        (plugin as any).loadData = jest.fn().mockResolvedValue({
            settings: { port: 7777 },
        });
        await plugin.loadSettings();
        expect(plugin.settings.port).toBe(7777);
        expect(plugin.toolStats).toEqual({});
    });

    test('loadSettings handles null data', async () => {
        (plugin as any).loadData = jest.fn().mockResolvedValue(null);
        await plugin.loadSettings();
        expect(plugin.settings.port).toBe(DEFAULT_SETTINGS.port);
        expect(plugin.toolStats).toEqual({});
    });

    test('saveSettings persists combined format', async () => {
        const saveData = jest.fn().mockResolvedValue(undefined);
        (plugin as any).saveData = saveData;
        plugin.toolStats = { x: { total: 1, successful: 1, failed: 0 } };
        await plugin.saveSettings();
        expect(saveData).toHaveBeenCalledWith({
            settings: plugin.settings,
            toolStats: plugin.toolStats,
        });
    });

    test('loadSettings defaults requireAuth to true for old data', async () => {
        (plugin as any).loadData = jest.fn().mockResolvedValue({
            settings: { port: 27123, authToken: 'tok', blacklist: '' },
            toolStats: {},
        });
        await plugin.loadSettings();
        expect(plugin.settings.requireAuth).toBe(true);
    });

    test('resetStats clears stats and persists', async () => {
        const saveData = jest.fn().mockResolvedValue(undefined);
        (plugin as any).saveData = saveData;
        plugin.toolStats = { x: { total: 10, successful: 8, failed: 2 } };
        await plugin.resetStats();
        expect(plugin.toolStats).toEqual({});
        expect(saveData).toHaveBeenCalledWith({
            settings: plugin.settings,
            toolStats: {},
        });
    });
});
