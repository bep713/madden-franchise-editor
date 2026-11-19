import AutoSavePausedStrip from '../AutoSavePausedStrip';

const meta = {
    component: AutoSavePausedStrip,
    tags: ['autodocs'],
    title: 'Components/AutoSavePausedStrip'
};

export default meta;

export const Default = {
    args: {
        fileName: 'CAREER-FRANCHISE',
        reason: 'changed',
        onBranch: () => {},
        onReload: () => {}
    }
};

export const Missing = {
    args: {
        fileName: 'CAREER-FRANCHISE',
        reason: 'missing',
        onBranch: () => {},
        onSaveHere: () => {}
    }
};
