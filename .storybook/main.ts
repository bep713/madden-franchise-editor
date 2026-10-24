import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
    stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
    core: { disableTelemetry: true },
    framework: {
        name: '@storybook/react-vite',
        options: {}
    },
    // Reuse the app's aliases, CSS-modules settings and plugins.
    async viteFinal(baseConfig) {
        const { rendererConfig } = await import('../vite.config.mts');
        return mergeConfig(baseConfig, {
            resolve: rendererConfig.resolve,
            css: rendererConfig.css,
            plugins: rendererConfig.plugins
        });
    }
};

export default config;
