import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Banner from './Banner';

describe('Banner', () => {
    it('uses role alert for errors and status otherwise', () => {
        const { rerender } = render(
            <Banner message='m' onClose={vi.fn()} severity='error' visible />
        );
        expect(screen.getByRole('alert')).toBeTruthy();
        rerender(
            <Banner message='m' onClose={vi.fn()} severity='info' visible />
        );
        expect(screen.getByRole('status')).toBeTruthy();
        rerender(
            <Banner message='m' onClose={vi.fn()} severity='success' visible />
        );
        expect(screen.getByRole('status')).toBeTruthy();
    });

    it('exposes the kind and calls onClose from the close button', async () => {
        const onClose = vi.fn();
        render(
            <Banner
                kind='x'
                message='m'
                onClose={onClose}
                severity='info'
                visible
            />
        );
        expect(screen.getByTestId('banner').getAttribute('data-kind')).toBe(
            'x'
        );
        await userEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('runs an action then closes, and renders at most two actions', async () => {
        const onClose = vi.fn();
        const onClick = vi.fn();
        render(
            <Banner
                actions={[
                    { label: 'A', onClick },
                    { label: 'B', onClick: vi.fn() },
                    { label: 'C', onClick: vi.fn() }
                ]}
                message='m'
                onClose={onClose}
                severity='info'
                visible
            />
        );
        expect(screen.getAllByRole('button')).toHaveLength(3); // 2 + close
        await userEvent.click(screen.getByRole('button', { name: 'A' }));
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
