import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

// Mirrors the Obsidian community directory scanner (obsidianmd recommended,
// which already includes eslint + typescript-eslint type-checked rules).
export default defineConfig([
    ...obsidianmd.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['eslint.config.mjs', 'esbuild.config.mjs', 'jest.config.js'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        files: ['**/*.ts'],
        rules: {
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },
    {
        files: ['package.json'],
        rules: {
            // moment is provided by the Obsidian runtime; the devDependency only supplies types + test shim.
            'depend/ban-dependencies': ['error', { allowed: ['moment'] }],
        },
    },
    {
        ignores: ['main.js', 'node_modules/**', 'tests/**', 'openclaw-skill/**', 'docs/**'],
    },
]);
