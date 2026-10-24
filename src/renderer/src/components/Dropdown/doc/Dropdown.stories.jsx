import Dropdown from '../Dropdown';

const meta = {
    component: Dropdown,
    tags: ['autodocs'],
    title: 'Components/FormElements/Dropdown'
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

export const Label = {
    args: {
        label: 'Select an option',
        options: [
            { label: 'Option 1', value: 'option1' },
            { label: 'Option 2', value: 'option2' },
            { label: 'Option 3', value: 'option3' }
        ]
    }
};

export const PreSelected = {
    args: {
        label: 'Select an option',
        options: [
            { label: 'Option 1', value: 'option1' },
            { label: 'Option 2', selected: true, value: 'option2' },
            { label: 'Option 3', value: 'option3' }
        ]
    }
};

export const Error = {
    args: {
        errorMessage: 'This is an error message.',
        label: 'Select an option',
        options: [
            { label: 'Option 1', value: 'option1' },
            { label: 'Option 2', value: 'option2' },
            { label: 'Option 3', value: 'option3' }
        ],
        state: 'error'
    }
};

export const Horizontal = {
    args: {
        direction: 'horizontal',
        label: 'Select an option',
        options: [
            { label: 'Option 1', value: 'option1' },
            { label: 'Option 2', value: 'option2' },
            { label: 'Option 3', value: 'option3' }
        ]
    }
};

export const HorizontalError = {
    args: {
        direction: 'horizontal',
        errorMessage: 'This is an error message.',
        label: 'Select an option',
        options: [
            { label: 'Option 1', value: 'option1' },
            { label: 'Option 2', value: 'option2' },
            { label: 'Option 3', value: 'option3' }
        ],
        state: 'error'
    }
};
