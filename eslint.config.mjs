import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import storybook from 'eslint-plugin-storybook';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Lints the v5 React code in src/ only. The v4 code (main/, preload/,
// renderer/) is plain CommonJS and isn't linted.
export default tseslint.config(
    { ignores: ['**/node_modules', 'out', 'dist', 'storybook-static'] },
    js.configs.recommended,
    tseslint.configs.recommended,
    react.configs.flat.recommended,
    react.configs.flat['jsx-runtime'],
    reactHooks.configs.flat.recommended,
    storybook.configs['flat/recommended'],
    {
        files: ['src/**/*.{js,jsx,ts,tsx}'],
        languageOptions: {
            globals: globals.browser
        },
        settings: {
            react: { version: 'detect' }
        },
        rules: {
            // The ported data-loading effects (TableEditor) trip this. Revisit
            // when the table editor is wired up.
            'react-hooks/set-state-in-effect': 'warn'
        }
    },
    {
        files: ['src/**/*.test.{js,jsx,ts,tsx}'],
        languageOptions: {
            globals: { ...globals.node, ...globals.vitest }
        }
    },
    prettier
);
