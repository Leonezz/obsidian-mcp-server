import McpPlugin from '../src/main';
import { Plugin } from 'obsidian';

describe('McpPlugin', () => {
  let app: any;
  let plugin: McpPlugin;

  beforeEach(() => {
    app = {
      workspace: { getActiveFile: jest.fn() },
      vault: { read: jest.fn(), getAbstractFileByPath: jest.fn() },
      metadataCache: { getFileCache: jest.fn() }
    };
    plugin = new McpPlugin(app, {} as any);
  });

  test('should be an instance of Plugin', () => {
    expect(plugin).toBeInstanceOf(Plugin);
  });

  test('should have a default port', () => {
    // Access private property via cast or testing exposed config
    expect((plugin as any).port).toBe(27123);
  });
});
