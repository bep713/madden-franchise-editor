import Checkbox from '../Checkbox';

const meta = {
    component: Checkbox,
    tags: ['autodocs'],
    title: 'Components/FormElements/Checkbox'
};

export default meta;

export const Checked = {
    args: {
        checked: true,
        label: 'Add default schemas'
    }
};

export const Unchecked = {
    args: {
        checked: false,
        label: 'Add default schemas'
    }
};

export const Description = {
    args: {
        checked: true,
        description:
            "Adds the editor's built-in tables that the game files don't define.",
        label: 'Add default schemas'
    }
};

export const Disabled = {
    args: {
        checked: false,
        disabled: true,
        label: 'Add default schemas'
    }
};
