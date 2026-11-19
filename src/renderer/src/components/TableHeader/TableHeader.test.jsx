import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TableHeader from './TableHeader';

const title = () => screen.getByTestId('table-header-title').textContent;

describe('TableHeader', () => {
    it('shows the id and name of a named table', () => {
        render(
            <TableHeader table={{ tableId: 4097, name: 'OverallPercentage' }}>
                {null}
            </TableHeader>
        );
        expect(title()).toBe('4097 - OverallPercentage');
    });

    it.each([['\u0000'], [''], [' ']])(
        'shows only the id when the name is %j',
        (name) => {
            render(
                <TableHeader table={{ tableId: 4096, name }}>
                    {null}
                </TableHeader>
            );
            expect(title()).toBe('4096');
        }
    );
});
