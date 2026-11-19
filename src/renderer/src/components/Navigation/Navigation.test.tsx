import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Navigation from './Navigation';
import { NavigationTabItem } from './NavigationTab';

const TABS: NavigationTabItem[] = [
    { key: 'home', name: 'Home' },
    { key: 'table-1', name: '7482 - Team', isClosable: true },
    { key: 'table-2', name: '4096', isClosable: true }
];

function setup(props: Partial<Parameters<typeof Navigation>[0]> = {}) {
    const handlers = {
        onSelect: vi.fn(),
        onClose: vi.fn(),
        onNewTab: vi.fn()
    };
    render(
        <Navigation
            activeKey='table-1'
            showNewTabButton
            tabs={TABS}
            {...handlers}
            {...props}
        />
    );
    return handlers;
}

describe('Navigation', () => {
    it('marks only the active tab as selected', () => {
        setup();
        expect(
            screen.getByRole('tab', { name: /7482 - Team/ })
        ).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute(
            'aria-selected',
            'false'
        );
    });

    // The active one too, so it can leave a page under it
    it('selects the clicked tab, active or not', async () => {
        const { onSelect } = setup();
        await userEvent.click(screen.getByRole('tab', { name: /7482 - Team/ }));
        expect(onSelect).toHaveBeenCalledExactlyOnceWith('table-1');

        await userEvent.click(screen.getByRole('tab', { name: 'Home' }));
        expect(onSelect).toHaveBeenLastCalledWith('home');
    });

    it('closes a tab with its close button, without selecting it', async () => {
        const { onClose, onSelect } = setup();
        const tab = screen.getByRole('tab', { name: /^4096/ });
        await userEvent.click(
            tab.querySelector('button[aria-label="Close tab"]')!
        );
        expect(onClose).toHaveBeenCalledExactlyOnceWith('table-2');
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('closes a tab on middle-click, without autoscroll', () => {
        const { onClose, onSelect } = setup();
        const tab = screen.getByRole('tab', { name: /^4096/ });

        const mouseDown = new MouseEvent('mousedown', {
            button: 1,
            bubbles: true,
            cancelable: true
        });
        tab.dispatchEvent(mouseDown);
        expect(mouseDown.defaultPrevented).toBe(true);

        fireEvent(
            tab,
            new MouseEvent('auxclick', { button: 1, bubbles: true })
        );
        expect(onClose).toHaveBeenCalledExactlyOnceWith('table-2');
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('has no close button on main tabs', () => {
        const { onClose } = setup();
        const home = screen.getByRole('tab', { name: 'Home' });
        expect(home.querySelector('button')).toBeNull();
        fireEvent(
            home,
            new MouseEvent('auxclick', { button: 1, bubbles: true })
        );
        expect(onClose).not.toHaveBeenCalled();
    });

    it('opens a new tab with "+"', async () => {
        const { onNewTab } = setup();
        await userEvent.click(screen.getByRole('button', { name: 'New tab' }));
        expect(onNewTab).toHaveBeenCalledOnce();
    });

    it('hides "+" when asked', () => {
        setup({ showNewTabButton: false, tabs: [TABS[0]], activeKey: 'home' });
        expect(screen.queryByRole('button', { name: 'New tab' })).toBeNull();
        expect(screen.getAllByRole('tab')).toHaveLength(1);
    });

    it('scrolls the bar sideways with the mouse wheel', () => {
        setup();
        const list = screen.getByRole('tablist');
        const wheel = new WheelEvent('wheel', {
            deltaY: 40,
            bubbles: true,
            cancelable: true
        });
        list.dispatchEvent(wheel);
        expect(list.scrollLeft).toBe(40);
        expect(wheel.defaultPrevented).toBe(true);
    });
});
