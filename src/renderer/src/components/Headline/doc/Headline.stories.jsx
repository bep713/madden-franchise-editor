import Headline from '../Headline';

const meta = {
    component: Headline,
    tags: ['autodocs'],
    title: 'Components/Headline'
};

export default meta;

export const Base = {
    args: {
        text: 'Welcome',
        size: 'default'
    }
};

export const Subtext = {
    args: {
        text: 'Welcome',
        subtext: 'This is a subtext',
        size: 'small'
    }
};

export const Small = {
    args: {
        text: 'Welcome',
        size: 'small'
    }
};

export const Actions = {
    args: {
        text: 'Welcome',
        actions: <button type='button'>Action</button>
    }
};
