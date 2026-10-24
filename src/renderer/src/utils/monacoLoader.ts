import { loader } from '@monaco-editor/react';

export const loadMonaco = () => {
    loader.config({
        paths: {
            vs: 'app-asset://madden-franchise-editor/node_modules/monaco-editor/min/vs'
        }
    });
};
