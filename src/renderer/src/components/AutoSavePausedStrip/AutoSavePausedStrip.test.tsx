import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AutoSavePausedStrip from './AutoSavePausedStrip';

const buttonNames = () =>
    screen.getAllByRole('button').map((b) => b.textContent || b.ariaLabel);

const PAUSED = 'Auto-save is paused until you choose.';

describe('AutoSavePausedStrip', () => {
    it.each([true, false])(
        'changed (auto-save %s): text, buttons in order, and their callbacks',
        async (autoSave) => {
            const props = {
                onCopy: vi.fn(),
                onHide: vi.fn(),
                onLoad: vi.fn(),
                onKeep: vi.fn()
            };
            render(
                <AutoSavePausedStrip
                    {...props}
                    autoSave={autoSave}
                    fileName='CAREER-TEST'
                    reason='changed'
                />
            );

            const text = screen.getByRole('status').textContent;
            expect(text).toContain(
                'CAREER-TEST was changed outside the editor. Which version do you want to keep?'
            );
            expect(text?.includes(PAUSED)).toBe(autoSave);
            expect(buttonNames()).toEqual([
                'Save mine as a copy…',
                'Load the new version',
                'Keep my version',
                ...(autoSave ? [] : ['Hide'])
            ]);

            await userEvent.click(
                screen.getByRole('button', { name: 'Save mine as a copy…' })
            );
            await userEvent.click(
                screen.getByRole('button', { name: 'Load the new version' })
            );
            await userEvent.click(
                screen.getByRole('button', { name: 'Keep my version' })
            );
            expect(props.onCopy).toHaveBeenCalledTimes(1);
            expect(props.onLoad).toHaveBeenCalledTimes(1);
            expect(props.onKeep).toHaveBeenCalledTimes(1);
        }
    );

    it.each([true, false])(
        'missing (auto-save %s): text, buttons in order, and their callbacks',
        async (autoSave) => {
            const props = {
                onCopy: vi.fn(),
                onHide: vi.fn(),
                onPutBack: vi.fn()
            };
            render(
                <AutoSavePausedStrip
                    {...props}
                    autoSave={autoSave}
                    fileName='CAREER-TEST'
                    reason='missing'
                />
            );

            const text = screen.getByRole('status').textContent;
            expect(text).toContain(
                'CAREER-TEST was deleted or moved outside the editor.'
            );
            expect(text?.includes(PAUSED)).toBe(autoSave);
            expect(buttonNames()).toEqual([
                'Save mine as a copy…',
                'Put it back',
                ...(autoSave ? [] : ['Hide'])
            ]);

            await userEvent.click(
                screen.getByRole('button', { name: 'Put it back' })
            );
            expect(props.onPutBack).toHaveBeenCalledTimes(1);
        }
    );

    it('the X (auto-save off) calls onHide', async () => {
        const onHide = vi.fn();
        render(
            <AutoSavePausedStrip
                autoSave={false}
                fileName='CAREER-TEST'
                onCopy={vi.fn()}
                onHide={onHide}
                onPutBack={vi.fn()}
                reason='missing'
            />
        );
        await userEvent.click(screen.getByRole('button', { name: 'Hide' }));
        expect(onHide).toHaveBeenCalledTimes(1);
    });
});
