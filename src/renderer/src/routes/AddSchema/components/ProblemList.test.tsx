import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Problem } from '@shared/types';
import ProblemList, { VISIBLE_PROBLEMS } from './ProblemList';

const problems = (n: number): Problem[] =>
    Array.from({ length: n }, (_, i) => ({
        code: 'not-a-schema',
        severity: 'blocking',
        path: `C:\\game\\F${i}.FTX`
    }));

const shown = (): number =>
    screen.getByRole('list', { name: 'Problems' }).querySelectorAll('li')
        .length;

describe('ProblemList', () => {
    it('renders nothing without problems', () => {
        const { container } = render(
            <ProblemList phase='plan' problems={[]} />
        );
        expect(container.innerHTML).toBe('');
    });

    it('shows the first five, and the rest on request', async () => {
        render(<ProblemList phase='plan' problems={problems(12)} />);
        expect(shown()).toBe(VISIBLE_PROBLEMS);
        const toggle = screen.getByRole('button', { name: 'Show 7 more' });
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        await userEvent.click(toggle);
        expect(shown()).toBe(12);
        await userEvent.click(
            screen.getByRole('button', { name: 'Show fewer' })
        );
        expect(shown()).toBe(VISIBLE_PROBLEMS);
    });

    it('has no toggle for five or fewer', () => {
        render(<ProblemList phase='plan' problems={problems(5)} />);
        expect(shown()).toBe(5);
        expect(screen.queryByRole('button')).toBeNull();
    });
});
