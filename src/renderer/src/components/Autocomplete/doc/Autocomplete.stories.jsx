import Autocomplete from '../Autocomplete';

const meta = {
    component: Autocomplete,
    tags: ['autodocs'],
    title: 'Components/FormElements/Autocomplete'
};

export default meta;

export const Base = {
    args: {
        options: [
            { label: 'Option 1', value: 'option1' },
            { label: 'Option 2', value: 'option2' },
            { label: 'Option 3', value: 'option3' }
        ]
    }
};

export const ShowOptions = {
    args: {
        options: [
            { label: 'Option 1', value: 'option1' },
            { label: 'Option 2', value: 'option2' },
            { label: 'Option 3', value: 'option3' }
        ],
        showOptions: true
    }
};

export const PreFilled = {
    args: {
        text: 'Option 1',
        options: [
            { label: 'Option 1', value: 'option1' },
            { label: 'Option 2', value: 'option2' },
            { label: 'Option 3', value: 'option3' }
        ]
    }
};

export const Placeholder = {
    args: {
        placeholder: 'Placeholder',
        options: [
            { label: 'Option 1', value: 'option1' },
            { label: 'Option 2', value: 'option2' },
            { label: 'Option 3', value: 'option3' }
        ]
    }
};

export const Label = {
    args: {
        label: 'Label',
        options: [
            { label: 'Option 1', value: 'option1' },
            { label: 'Option 2', value: 'option2' },
            { label: 'Option 3', value: 'option3' }
        ]
    }
};

export const Error = {
    args: {
        errorMessage: 'This is an error message',
        label: 'Label',
        options: [
            { label: 'Option 1', value: 'option1' },
            { label: 'Option 2', value: 'option2' },
            { label: 'Option 3', value: 'option3' }
        ],
        state: 'error'
    }
};

export const ErrorShowOptions = {
    args: {
        errorMessage: 'This is an error message',
        label: 'Label',
        options: [
            { label: 'Option 1', value: 'option1' },
            { label: 'Option 2', value: 'option2' },
            { label: 'Option 3', value: 'option3' }
        ],
        showOptions: true,
        state: 'error'
    }
};
