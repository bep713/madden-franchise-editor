import GridLayout from '../GridLayout';

const meta = {
    component: GridLayout,
    tags: ['autodocs'],
    title: 'Components/GridLayout'
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
        columns: '1fr 1fr 1fr',
        children
    }
};
