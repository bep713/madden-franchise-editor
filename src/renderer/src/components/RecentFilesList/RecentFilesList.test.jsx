import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RecentFilesList from './RecentFilesList';

// RecentFilesList.test.jsx

// Mock child components for snapshot clarity
vi.mock('../GridLayout/GridLayout', () => ({
    default: ({ children }) => <div data-testid="GridLayout">{children}</div>
}));
vi.mock('../List/List', () => ({
    default: ({ items }) => <div data-testid="List">{items}</div>
}));
vi.mock('../Link/Link', () => ({
    default: ({ text, onClick }) => (
        <button data-testid="Link" onClick={onClick}>{text}</button>
    )
}));
vi.mock('../Text/Text', () => ({
    default: ({ children }) => <span data-testid="Text">{children}</span>
}));

const filesSample = [
    {
        name: 'File1',
        basePath: '/path/one',
        gameYear: 25,
        lastAccessedTime: 1750355347791
    },
    {
        name: 'File2',
        basePath: '/path/two',
        lastAccessedTime: 1750355347790
    },
    {
        name: 'File3',
        basePath: '/path/three',
        gameYear: 26,
        lastAccessedTime: 1650355347791
    },
    {
        name: 'File4',
        basePath: '/path/four',
        lastAccessedTime: 1450355347791
    },
    {
        name: 'File5',
        basePath: '/path/five',
        lastAccessedTime: 1750315347791
    },
    {
        name: 'File6',
        basePath: '/path/six',
        lastAccessedTime: 1755355347791
    },
    {
        name: 'File7',
        basePath: '/path/seven',
        lastAccessedTime: 1750315347791
    },
    {
        name: 'File8',
        basePath: '/path/eight',
        lastAccessedTime: 1750355347691
    },
    {
        name: 'FileNoAccess',
        basePath: '/path/noaccess'
        // no lastAccessedTime
    }
];

describe('RecentFilesList', () => {
    it('renders empty state when files is empty', () => {
        const { asFragment } = render(
            <RecentFilesList files={[]} onClick={() => {}} />
        );
        expect(asFragment()).toMatchSnapshot();
    });

    it('renders up to 7 recent files sorted by lastAccessedTime', () => {
        const { asFragment } = render(
            <RecentFilesList files={filesSample} onClick={() => {}} />
        );
        // Only 7 items with lastAccessedTime should be rendered
        expect(asFragment()).toMatchSnapshot();
    });

    it('renders nothing if all files have no lastAccessedTime', () => {
        const filesNoAccess = [
            { name: 'A', basePath: '/a' },
            { name: 'B', basePath: '/b' }
        ];
        const { asFragment } = render(
            <RecentFilesList files={filesNoAccess} onClick={() => {}} />
        );
        expect(asFragment()).toMatchSnapshot();
    });
});