// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock Obsidian global window for tests
(global as any).window = {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- sync require for jest setup
    moment: require('moment'),
};
