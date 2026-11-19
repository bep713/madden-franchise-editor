import Text from '../Text';

const meta = {
    tags: ['autodocs'],
    title: 'Components/Text',
    component: Text
};

export default meta;

const sampleText =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut vel.';

export const Body = {
    args: {
        children: sampleText,
        typography: 'body'
    }
};

export const Emphasis = {
    args: {
        children: sampleText,
        typography: 'emphasis'
    }
};

export const LabelLarge = {
    args: {
        children: sampleText,
        typography: 'labelLarge'
    }
};

export const LabelXLarge = {
    args: {
        children: sampleText,
        typography: 'labelXLarge'
    }
};

export const Label2XLarge = {
    args: {
        children: sampleText,
        typography: 'label2XLarge'
    }
};
