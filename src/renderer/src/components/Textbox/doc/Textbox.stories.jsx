import Textbox from '../Textbox';

const meta = {
    component: Textbox,
    tags: ['autodocs'],
    title: 'Components/FormElements/Textbox'
};

export default meta;

export const Base = {
    args: {
        text: 'Text'
    }
};

export const Asset = {
    args: {
        leftAsset: (
            <img height={16} width={16} src='https://placecats.com/16/16' />
        ),
        text: 'Text'
    }
};

export const Placeholder = {
    args: {
        placeholder: 'Placeholder',
        text: ''
    }
};

export const Label = {
    args: {
        label: 'Label',
        text: 'Text'
    }
};

export const Error = {
    args: {
        errorMessage:
            'This is an error message. It can wrap to multiple lines.',
        label: 'Label',
        state: 'error',
        text: 'Bad data'
    }
};

export const Horizontal = {
    args: {
        direction: 'horizontal',
        label: 'Label',
        text: 'Bad data'
    }
};

export const HorizontalError = {
    args: {
        direction: 'horizontal',
        errorMessage:
            'This is an error message. It can wrap to multiple lines.',
        label: 'Label',
        state: 'error',
        text: 'Bad data'
    }
};
