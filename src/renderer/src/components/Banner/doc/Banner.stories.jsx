import Banner from '../Banner';

const meta = {
    component: Banner,
    tags: ['autodocs'],
    title: 'Components/Banner'
};

export default meta;

const actions = [
    { label: 'Dismiss', onClick: () => {} },
    { label: 'Open', onClick: () => {}, primary: true }
];

export const Info = {
    args: {
        actions,
        message: 'There is a new update available.',
        onClose: () => {},
        severity: 'info',
        visible: true
    }
};

export const Error = {
    args: {
        actions,
        message: "We cannot find an exact match for this file's schema.",
        onClose: () => {},
        severity: 'error',
        visible: true
    }
};

export const Success = {
    args: {
        message: 'You are running the latest version.',
        onClose: () => {},
        severity: 'success',
        visible: true
    }
};
