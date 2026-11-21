import AutoSavePausedStrip from '../AutoSavePausedStrip';

const meta = {
    component: AutoSavePausedStrip,
    tags: ['autodocs'],
    title: 'Components/AutoSavePausedStrip'
};

export default meta;

const changed = {
    fileName: 'CAREER-FRANCHISE',
    reason: 'changed',
    onCopy: () => {},
    onHide: () => {},
    onLoad: () => {},
    onKeep: () => {}
};

const missing = {
    fileName: 'CAREER-FRANCHISE',
    reason: 'missing',
    onCopy: () => {},
    onHide: () => {},
    onPutBack: () => {}
};

export const ChangedAutoSaveOn = { args: { ...changed, autoSave: true } };

export const ChangedAutoSaveOff = { args: { ...changed, autoSave: false } };

export const MissingAutoSaveOn = { args: { ...missing, autoSave: true } };

export const MissingAutoSaveOff = { args: { ...missing, autoSave: false } };
