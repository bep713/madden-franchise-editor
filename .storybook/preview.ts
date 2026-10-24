import type { Preview } from '@storybook/react-vite';

import '../src/renderer/src/assets/vars.scss';
import '../src/renderer/src/assets/main.scss';
import '@fontsource-variable/roboto';

const preview: Preview = {
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i
            }
        }
    }
};

export default preview;
