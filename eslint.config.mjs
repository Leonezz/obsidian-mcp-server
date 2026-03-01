import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: { obsidianmd },
        rules: {
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'off', // Obsidian API often needs any
            '@typescript-eslint/ban-ts-comment': 'off',
            ...obsidianmd.configs.recommended,
            // Disable rules that require typed linting (parserOptions.project)
            'obsidianmd/no-tfile-tfolder-cast': 'off',
            'obsidianmd/prefer-file-manager-trash-file': 'off',
        },
    },
    {
        // Enable type-aware rules only for src files
        files: ['src/**/*.ts'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            'obsidianmd/no-tfile-tfolder-cast': 'error',
            'obsidianmd/prefer-file-manager-trash-file': 'warn',
        },
    },
    {
        ignores: ['main.js', 'node_modules/**', 'tests/**'],
    },
);
