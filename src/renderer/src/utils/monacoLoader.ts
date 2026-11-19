import { loader } from '@monaco-editor/react';
// Core editor only; no language contributions are needed yet.
import * as monaco from 'monaco-editor/editor/editor.api';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

// Bundle monaco with the renderer instead of loading it from a CDN.
export const loadMonaco = () => {
    self.MonacoEnvironment = {
        getWorker: () => new EditorWorker()
    };
    loader.config({ monaco });
};
