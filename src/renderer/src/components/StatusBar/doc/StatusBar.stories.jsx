import StatusBar from '../StatusBar';

const meta = {
    component: StatusBar,
    tags: ['autodocs'],
    title: 'Components/StatusBar'
};

export default meta;

export const Info = {
    args: {
        severity: 'info',
        text: 'Ready - No file loaded.'
    }
};

export const Error = {
    args: {
        severity: 'error',
        text: 'Error - cannot open file.'
    }
};
