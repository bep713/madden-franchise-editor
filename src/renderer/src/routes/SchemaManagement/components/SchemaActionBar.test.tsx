import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SchemaActionBar from './SchemaActionBar';

const handlers = () => ({
    onAddSchema: vi.fn(),
    onOpenDirectory: vi.fn(),
    onRefresh: vi.fn()
});

describe('SchemaActionBar', () => {
    it('hides View loaded schema without onViewLoaded', () => {
        render(<SchemaActionBar {...handlers()} />);
        expect(screen.queryByText('View loaded schema')).toBeNull();
    });

    it('puts View loaded schema first and calls the handler', async () => {
        const onViewLoaded = vi.fn();
        const { container } = render(
            <SchemaActionBar {...handlers()} onViewLoaded={onViewLoaded} />
        );
        const links = container.querySelectorAll('[data-action]');
        expect(links[0].getAttribute('data-action')).toBe('view-loaded-schema');
        await userEvent.click(screen.getByText('View loaded schema'));
        expect(onViewLoaded).toHaveBeenCalledTimes(1);
    });

    it('enables Add schema and calls the handler', async () => {
        const props = handlers();
        const { container } = render(<SchemaActionBar {...props} />);
        const link = container.querySelector('[data-action="add-schema"]')!;
        expect(link.getAttribute('aria-disabled')).toBeNull();
        await userEvent.click(link);
        expect(props.onAddSchema).toHaveBeenCalledTimes(1);
    });
});
