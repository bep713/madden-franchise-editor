import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FileMetadata, SchemaEntry } from '@shared/types';
import SchemaCard from './SchemaCard';

const BUNDLED: SchemaEntry = {
    gameType: 'madden',
    gameYear: 22,
    major: 329,
    minor: 1,
    path: 'C:\\app\\schemas\\22\\M22_329_1.gz',
    source: 'bundled'
};
const CUSTOM: SchemaEntry = {
    ...BUNDLED,
    minor: 2,
    path: 'C:\\data\\schemas\\M22_329_2.gz',
    source: 'custom'
};

const renderCard = (props: Partial<React.ComponentProps<typeof SchemaCard>>) =>
    render(
        <SchemaCard
            labelFor={(e) => `v${e.major}.${e.minor}`}
            onDelete={vi.fn()}
            onLoad={vi.fn()}
            schemas={[BUNDLED, CUSTOM]}
            title='Madden 22'
            {...props}
        />
    );

describe('SchemaCard view eye', () => {
    it('has no eyes without onView', () => {
        renderCard({});
        expect(screen.queryAllByRole('button', { name: /^View/ })).toHaveLength(
            0
        );
    });

    it('has one eye per row, including a bundled row and the loaded row', async () => {
        const onView = vi.fn();
        renderCard({
            metadata: { schemaList: { path: CUSTOM.path } } as FileMetadata,
            onView
        });
        expect(screen.getAllByRole('button', { name: /^View/ })).toHaveLength(
            2
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'View v329.1' })
        );
        expect(onView).toHaveBeenCalledWith(BUNDLED);
        await userEvent.click(
            screen.getByRole('button', { name: 'View v329.2' })
        );
        expect(onView).toHaveBeenCalledWith(CUSTOM);
    });

    it('marks only the viewing row, ignoring case and slash direction', () => {
        const { container } = renderCard({
            onView: vi.fn(),
            viewingPath: 'c:/APP/schemas/22/m22_329_1.gz'
        });
        const marked = container.querySelectorAll('[data-viewing]');
        expect(marked).toHaveLength(1);
        expect(marked[0].getAttribute('data-name')).toBe('v329.1');
    });
});
