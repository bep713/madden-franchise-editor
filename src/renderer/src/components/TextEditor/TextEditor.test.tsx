import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TextEditor from './TextEditor';
import { mockColorScheme } from '@renderer/hooks/testing/mockColorScheme';

vi.mock('@monaco-editor/react', () => ({
    Editor: ({ theme }: { theme?: string }) => (
        <div data-testid='monaco' data-theme={theme} />
    )
}));

const original = window.matchMedia;

afterEach(() => {
    window.matchMedia = original;
});

describe('TextEditor', () => {
    it('uses the light Monaco theme in light mode', () => {
        mockColorScheme(false);
        render(<TextEditor value='{}' />);
        expect(screen.getByTestId('monaco')).toHaveAttribute(
            'data-theme',
            'vs'
        );
    });

    it('uses the dark Monaco theme in dark mode', () => {
        mockColorScheme(true);
        render(<TextEditor value='{}' />);
        expect(screen.getByTestId('monaco')).toHaveAttribute(
            'data-theme',
            'vs-dark'
        );
    });
});
