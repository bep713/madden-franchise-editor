import './assets/vars.scss';
import './assets/main.scss';
import '@fontsource-variable/roboto';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { loadMonaco } from './utils/monacoLoader';

loadMonaco();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
