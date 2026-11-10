import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SchemaActionBar from './SchemaActionBar';

describe('SchemaActionBar', () => {
    it('hides View loaded schema without onViewLoaded', () => {
        render(
            <SchemaActionBar onOpenDirectory={vi.fn()} onRefresh={vi.fn()} />
        );
        expect(screen.queryByText('View loaded schema')).toBeNull();
    });

    it('puts View loaded schema first and calls the handler', async () => {
        const onViewLoaded = vi.fn();
        const { container } = render(
            <SchemaActionBar
                onOpenDirectory={vi.fn()}
                onRefresh={vi.fn()}
                onViewLoaded={onViewLoaded}
            />
        );
        const links = container.querySelectorAll('[data-action]');
        expect(links[0].getAttribute('data-action')).toBe('view-loaded-schema');
        await userEvent.click(screen.getByText('View loaded schema'));
        expect(onViewLoaded).toHaveBeenCalledTimes(1);
    });
});
