/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig, type Plugin, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';

const dirname = import.meta.dirname;

// Shared with .storybook/main.ts. When main/preload move to TS this becomes
// the `renderer` block of an electron-vite config.
export const rendererConfig: UserConfig = {
    resolve: {
        alias: {
            '@data': resolve(dirname, 'data'),
            '@shared': resolve(dirname, 'src/shared'),
            '@renderer': resolve(dirname, 'src/renderer/src'),
            '@assets': resolve(dirname, 'src/renderer/src/assets')
        }
    },
    css: {
        modules: {
            scopeBehaviour: 'local',
            localsConvention: 'camelCaseOnly'
        }
    },
    plugins: [react(), svgr()]
};

// @vitejs/plugin-react injects its fast-refresh preamble as an inline script,
// which `script-src 'self'` blocks. Relax the CSP for the dev server only.
const devCspPlugin: Plugin = {
    name: 'mfe:dev-csp',
    apply: 'serve',
    transformIndexHtml: (html) =>
        html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
};

export default defineConfig({
    ...rendererConfig,
    plugins: [...(rendererConfig.plugins ?? []), devCspPlugin],
    root: resolve(dirname, 'src/renderer'),
    // Relative asset URLs so main.js can loadFile() the build output.
    base: './',
    server: {
        host: '127.0.0.1',
        port: 5173,
        strictPort: true
    },
    build: {
        outDir: resolve(dirname, 'out/renderer'),
        emptyOutDir: true,
        rollupOptions: {
            // schema.html and settings.html still point at the v4 scripts.
            input: { main: resolve(dirname, 'src/renderer/index.html') }
        },
        // Loaded from disk by Electron, so chunk size doesn't matter much.
        chunkSizeWarningLimit: 5000
    },
    test: {
        root: dirname,
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./tests/setup.js'],
        include: ['src/**/*.test.{ts,tsx,js,jsx}'],
        // Plain class names keep snapshots independent of file paths.
        css: { modules: { classNameStrategy: 'non-scoped' } }
    }
});
