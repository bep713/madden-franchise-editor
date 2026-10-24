import Layout from '../Layout';

const meta = {
    component: Layout,
    tags: ['autodocs'],
    title: 'Components/Layout'
};

export default meta;

const children = [0, 1, 2, 3, 4].map((item) => (
    <div
        key={item}
        style={{
            color: '#fff',
            'min-height': '150px',
            'min-width': '150px',
            backgroundColor: 'blue'
        }}
    >
        {item}
    </div>
));

export const Base = {
    args: {
        children
    }
};
