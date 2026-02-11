import { SecurityManager } from '../src/security';

function createMockPlugin(blacklist: string, files: Record<string, { tags?: string[] }> = {}) {
    return {
        settings: { blacklist },
        app: {
            vault: {
                getAbstractFileByPath: (path: string) => {
                    if (files[path]) {
                        return { path, stat: {} };
                    }
                    return null;
                },
            },
            metadataCache: {
                getFileCache: (file: any) => {
                    const info = files[file.path];
                    if (!info?.tags) return null;
                    return { tags: info.tags.map(t => ({ tag: t })) };
                },
            },
        },
    } as any;
}

describe('SecurityManager', () => {
    test('blocks path-blacklisted files', () => {
        const sm = new SecurityManager(createMockPlugin('Secret/'));
        expect(sm.isAllowed('Secret/passwords.md')).toBe(false);
    });
    test('allows non-blacklisted paths', () => {
        const sm = new SecurityManager(createMockPlugin('Secret/'));
        expect(sm.isAllowed('Notes/meeting.md')).toBe(true);
    });
    test('blocks path traversal attempts', () => {
        const sm = new SecurityManager(createMockPlugin('Secret/'));
        expect(sm.isAllowed('Notes/../Secret/passwords.md')).toBe(false);
    });
    test('blocks case-variant paths', () => {
        const sm = new SecurityManager(createMockPlugin('Secret/'));
        expect(sm.isAllowed('secret/passwords.md')).toBe(false);
    });
    test('blocks tag-blacklisted files', () => {
        const sm = new SecurityManager(createMockPlugin('#secret', { 'Notes/private.md': { tags: ['#secret'] } }));
        const file = { path: 'Notes/private.md', stat: {} } as any;
        expect(sm.isAllowed(file)).toBe(false);
    });
    test('blocks nested tags matching prefix', () => {
        const sm = new SecurityManager(createMockPlugin('#secret', { 'Notes/private.md': { tags: ['#secret/nested'] } }));
        const file = { path: 'Notes/private.md', stat: {} } as any;
        expect(sm.isAllowed(file)).toBe(false);
    });
    test('isTagAllowed filters blacklisted tags', () => {
        const sm = new SecurityManager(createMockPlugin('#secret'));
        expect(sm.isTagAllowed('#secret')).toBe(false);
        expect(sm.isTagAllowed('#secret/nested')).toBe(false);
        expect(sm.isTagAllowed('#work')).toBe(true);
    });
    test('reloads rules when reloadRules is called', () => {
        const plugin = createMockPlugin('Secret/');
        const sm = new SecurityManager(plugin);
        expect(sm.isAllowed('Secret/file.md')).toBe(false);
        expect(sm.isAllowed('Private/file.md')).toBe(true);
        plugin.settings.blacklist = 'Private/';
        sm.reloadRules();
        expect(sm.isAllowed('Secret/file.md')).toBe(true);
        expect(sm.isAllowed('Private/file.md')).toBe(false);
    });
});
