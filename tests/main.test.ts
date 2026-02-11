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
});
