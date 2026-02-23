import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'off', // Obsidian API often needs any
            '@typescript-eslint/ban-ts-comment': 'off',
        },
    },
    {
        ignores: ['main.js', 'node_modules/**', 'tests/**'],
    },
);
