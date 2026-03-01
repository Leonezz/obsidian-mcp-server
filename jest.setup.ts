(global as Record<string, unknown>).window = {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- sync require for jest setup
    moment: require('moment'),
};
