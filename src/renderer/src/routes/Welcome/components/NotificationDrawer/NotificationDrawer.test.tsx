import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '@shared/types/notifications';
import {
    EditorTabsContext,
    EditorTabsValue
} from '@renderer/tabs/EditorTabsContext';
import { ExternalChangeContext } from '@renderer/context/ExternalChangeContext';
import { PendingOpenContext } from '@renderer/context/PendingOpenContext';
import useNotifications from '@renderer/notifications/useNotifications';
import NotificationDrawer from './NotificationDrawer';

const MINUTE = 60 * 1000;
const NOW = Date.now();

// A fake of main's notification store: every change is sent to onChanged
let items: AppNotification[] = [];
let listeners: ((list: AppNotification[]) => void)[] = [];
function emit(): void {
    listeners.forEach((listener) => listener(items.slice()));
}
const notificationsApi = {
    list: vi.fn(async () => items.slice()),
    dismiss: vi.fn(async (id: string) => {
        items = items.filter((n) => n.id !== id);
        emit();
    }),
    markRead: vi.fn(async (ids: string[]) => {
        items = items.map((n) =>
            ids.includes(n.id) ? { ...n, read: true } : n
        );
        emit();
    }),
    onChanged: vi.fn((callback: (list: AppNotification[]) => void) => {
        listeners.push(callback);
        return () => {
            listeners = listeners.filter((l) => l !== callback);
        };
    }),
    onAdded: vi.fn(() => () => undefined)
};

function notification(
    id: string,
    patch: Partial<AppNotification> = {}
): AppNotification {
    return {
        id,
        kind: 'schema-mismatch',
        createdAt: NOW,
        read: false,
        fileId: `file-${id}`,
        data: {
            expected: { gameYear: 22, major: 328, minor: 1 },
            loaded: { gameYear: 22, major: 329, minor: 1 },
            gameType: 'madden'
        },
        ...patch
    };
}

const selectTab = vi.fn();
const setPending = vi.fn();
const externalChange = {
    load: vi.fn(async () => undefined),
    keep: vi.fn(async () => undefined),
    copy: vi.fn(async () => undefined),
    putBack: vi.fn(async () => undefined),
    confirmSave: vi.fn(async () => true)
};

// Welcome's wiring: the list from main, the drawer mounted while open
function Harness() {
    const { notifications } = useNotifications();
    const [open, setOpen] = useState(true);
    return (
        <PendingOpenContext.Provider value={[undefined, setPending]}>
            <ExternalChangeContext.Provider value={externalChange}>
                <EditorTabsContext.Provider
                    value={{ selectTab } as unknown as EditorTabsValue}
                >
                    <button onClick={() => setOpen((o) => !o)} type='button'>
                        toggle
                    </button>
                    {open && (
                        <NotificationDrawer
                            notifications={notifications}
                            onClose={() => setOpen(false)}
                        />
                    )}
                </EditorTabsContext.Provider>
            </ExternalChangeContext.Provider>
        </PendingOpenContext.Provider>
    );
}

const item = (id: string) =>
    document.querySelector(`[data-notification-id="${id}"]`) as HTMLElement;
const isUnread = (id: string) => item(id).getAttribute('data-read') === 'false';

async function reopen(): Promise<void> {
    await userEvent.click(screen.getByText('toggle'));
    await userEvent.click(screen.getByText('toggle'));
}

describe('NotificationDrawer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        items = [];
        listeners = [];
        Object.assign(window, {
            electronAPI: { notifications: notificationsApi }
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('says so when there are no notifications', async () => {
        render(<Harness />);
        expect(await screen.findByText('No notifications')).toBeInTheDocument();
        expect(notificationsApi.markRead).not.toHaveBeenCalled();
    });

    it('lists each notification with its text', async () => {
        items = [notification('b'), notification('a')];
        render(<Harness />);
        await waitFor(() => expect(item('a')).not.toBeNull());
        const ids = [...document.querySelectorAll('li')].map((li) =>
            li.getAttribute('data-notification-id')
        );
        expect(ids).toEqual(['b', 'a']);
        const li = within(item('a'));
        expect(item('a')).toHaveAttribute('data-kind', 'schema-mismatch');
        expect(li.getByText('Schema Mismatch')).toBeInTheDocument();
        expect(
            li.getByText('Loaded M22 v329.1, expected M22 v328.1.')
        ).toBeInTheDocument();
        expect(
            li.getByRole('button', { name: 'Open Schema Management' })
        ).toBeInTheDocument();
        expect(li.getByText('Just now').getAttribute('title')).toBe(
            new Date(NOW).toLocaleString()
        );
    });

    it('marks the unread ones read on open and keeps the dots for this viewing', async () => {
        items = [notification('b'), notification('a', { read: true })];
        render(<Harness />);
        await waitFor(() =>
            expect(notificationsApi.markRead).toHaveBeenCalledExactlyOnceWith([
                'b'
            ])
        );
        // main now says read, the drawer still shows it unread
        await waitFor(() => expect(items[0].read).toBe(true));
        expect(isUnread('b')).toBe(true);
        expect(isUnread('a')).toBe(false);
        expect(within(item('b')).getByTestId('unread-dot')).toBeInTheDocument();
        expect(
            within(item('b')).getByText('Schema Mismatch').className
        ).toMatch(/bold/);
        expect(within(item('a')).queryByTestId('unread-dot')).toBeNull();
        expect(
            within(item('a')).getByText('Schema Mismatch').className
        ).not.toMatch(/bold/);

        await reopen();
        await waitFor(() => expect(item('b')).not.toBeNull());
        expect(isUnread('b')).toBe(false);
        expect(within(item('b')).queryByTestId('unread-dot')).toBeNull();
        expect(notificationsApi.markRead).toHaveBeenCalledTimes(1);
    });

    it('shows a notification that arrives while open as unread and marks it read', async () => {
        items = [notification('a', { read: true })];
        render(<Harness />);
        await waitFor(() => expect(item('a')).not.toBeNull());
        expect(notificationsApi.markRead).not.toHaveBeenCalled();

        act(() => {
            items = [notification('b'), ...items];
            emit();
        });
        await waitFor(() =>
            expect(notificationsApi.markRead).toHaveBeenCalledExactlyOnceWith([
                'b'
            ])
        );
        expect(isUnread('b')).toBe(true);
        expect(isUnread('a')).toBe(false);
    });

    it('dismisses a notification', async () => {
        items = [notification('a')];
        render(<Harness />);
        await userEvent.click(
            await screen.findByRole('button', {
                name: 'Dismiss Schema Mismatch'
            })
        );
        expect(notificationsApi.dismiss).toHaveBeenCalledExactlyOnceWith('a');
        expect(await screen.findByText('No notifications')).toBeInTheDocument();
    });

    it('selects the Schemas tab from the link and stays open', async () => {
        items = [notification('a')];
        render(<Harness />);
        await userEvent.click(
            await screen.findByRole('button', {
                name: 'Open Schema Management'
            })
        );
        expect(selectTab).toHaveBeenCalledExactlyOnceWith('schema-management');
        expect(setPending).not.toHaveBeenCalled();
        expect(screen.getByRole('complementary')).toBeInTheDocument();
    });

    it('installs the update from the update-available link', async () => {
        const install = vi.fn();
        Object.assign(window.electronAPI, { update: { install } });
        items = [
            {
                id: 'u',
                kind: 'update-available',
                createdAt: NOW,
                read: false,
                data: {
                    version: '5.1.0',
                    currentVersion: '5.0.0',
                    channel: 'stable'
                }
            }
        ];
        render(<Harness />);
        expect(
            await screen.findByText(
                'Version 5.1.0 is available (you have 5.0.0).'
            )
        ).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Install update' })
        );
        expect(install).toHaveBeenCalledOnce();
        expect(screen.getByRole('complementary')).toBeInTheDocument();
    });

    it('sets the pending file from a schema-missing link', async () => {
        items = [
            {
                id: 'm',
                kind: 'schema-missing',
                createdAt: NOW,
                read: false,
                data: {
                    path: 'C:/saves/FTC',
                    openOptions: { gameYearOverride: 18 },
                    game: { gameYear: 18, gameType: 'madden' }
                }
            }
        ];
        render(<Harness />);
        await userEvent.click(
            await screen.findByRole('button', { name: 'Choose a schema' })
        );
        expect(setPending).toHaveBeenCalledExactlyOnceWith({
            path: 'C:/saves/FTC',
            openOptions: { gameYearOverride: 18 },
            game: { gameYear: 18, gameType: 'madden' },
            notificationId: 'm'
        });
        expect(selectTab).toHaveBeenCalledExactlyOnceWith('schema-management');
    });

    it('renders one link per entry, each with its data-link', async () => {
        items = [
            notification('a'),
            {
                id: 'f',
                kind: 'file-changed',
                createdAt: NOW,
                read: false,
                fileId: 'file-f',
                data: { path: 'C:/saves/FTC' }
            }
        ];
        render(<Harness />);
        await waitFor(() => expect(item('f')).not.toBeNull());
        const links = (id: string) =>
            [
                ...item(id).querySelectorAll(
                    '[data-action="notification-link"]'
                )
            ].map((el) => [el.getAttribute('data-link'), el.textContent]);
        expect(links('a')).toEqual([
            ['open-schemas', 'Open Schema Management']
        ]);
        expect(links('f')).toEqual([
            ['copy', 'Save mine as a copy…'],
            ['load', 'Load the new version'],
            ['keep', 'Keep my version']
        ]);
        const click = (id: string, name: string) =>
            userEvent.click(within(item(id)).getByRole('button', { name }));
        await click('f', 'Save mine as a copy…');
        expect(externalChange.copy).toHaveBeenCalledExactlyOnceWith('file-f');
        await click('f', 'Load the new version');
        expect(externalChange.load).toHaveBeenCalledExactlyOnceWith('file-f');
        await click('f', 'Keep my version');
        expect(externalChange.keep).toHaveBeenCalledExactlyOnceWith('file-f');
        expect(selectTab).not.toHaveBeenCalled();
    });

    it('the File Missing links copy and put back', async () => {
        items = [
            {
                id: 'm',
                kind: 'file-missing',
                createdAt: NOW,
                read: false,
                fileId: 'file-m',
                data: { path: 'C:/saves/FTC' }
            }
        ];
        render(<Harness />);
        await waitFor(() => expect(item('m')).not.toBeNull());
        expect(
            [
                ...item('m').querySelectorAll(
                    '[data-action="notification-link"]'
                )
            ].map((el) => el.getAttribute('data-link'))
        ).toEqual(['copy', 'put-back']);
        await userEvent.click(
            within(item('m')).getByRole('button', { name: 'Put it back' })
        );
        expect(externalChange.putBack).toHaveBeenCalledExactlyOnceWith(
            'file-m'
        );
        await userEvent.click(
            within(item('m')).getByRole('button', {
                name: 'Save mine as a copy…'
            })
        );
        expect(externalChange.copy).toHaveBeenCalledExactlyOnceWith('file-m');
    });

    it('has no dismiss button for file-changed or file-missing', async () => {
        const external = (id: string, kind: 'file-changed' | 'file-missing') =>
            ({
                id,
                kind,
                createdAt: NOW,
                read: false,
                fileId: `file-${id}`,
                data: { path: 'C:/saves/FTC' }
            }) as AppNotification;
        items = [
            notification('a'),
            external('f', 'file-changed'),
            external('m', 'file-missing')
        ];
        render(<Harness />);
        await waitFor(() => expect(item('m')).not.toBeNull());
        const dismiss = (id: string) =>
            item(id).querySelector('[data-action="dismiss-notification"]');
        expect(dismiss('a')).not.toBeNull();
        expect(dismiss('f')).toBeNull();
        expect(dismiss('m')).toBeNull();
    });

    it('closes from the close button', async () => {
        render(<Harness />);
        await userEvent.click(
            screen.getByRole('button', { name: 'Close notifications' })
        );
        expect(screen.queryByRole('complementary')).toBeNull();
    });

    it('refreshes the time every minute', async () => {
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
        vi.setSystemTime(NOW);
        items = [notification('a')];
        render(<Harness />);
        await waitFor(() => expect(item('a')).not.toBeNull());
        expect(within(item('a')).getByText('Just now')).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(MINUTE);
        });
        expect(within(item('a')).getByText('1 min ago')).toBeInTheDocument();
        act(() => {
            vi.advanceTimersByTime(4 * MINUTE);
        });
        expect(within(item('a')).getByText('5 min ago')).toBeInTheDocument();
    });
});
