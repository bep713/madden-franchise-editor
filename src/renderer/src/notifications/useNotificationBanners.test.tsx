import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '@shared/types/notifications';
import { BannerProvider, SLIDE_MS } from '@renderer/banners/BannerContext';
import { PendingOpenContext } from '@renderer/context/PendingOpenContext';
import { SCHEMA_MANAGEMENT_KEY } from '@renderer/tabs/editorTabs';
import useNotificationBanners from './useNotificationBanners';

const MESSAGE =
    "We cannot find an exact match for this file's schema. Open the schema management page?";

// A fake of main's store events: onAdded and onChanged listeners
let added: ((n: AppNotification) => void)[] = [];
let changed: ((list: AppNotification[]) => void)[] = [];
const unsubscribeAdded = vi.fn();
const unsubscribeChanged = vi.fn();
const notificationsApi = {
    list: vi.fn(async () => []),
    dismiss: vi.fn(async () => undefined),
    markRead: vi.fn(async () => undefined),
    onChanged: vi.fn((callback: (list: AppNotification[]) => void) => {
        changed.push(callback);
        return () => {
            unsubscribeChanged();
            changed = changed.filter((l) => l !== callback);
        };
    }),
    onAdded: vi.fn((callback: (n: AppNotification) => void) => {
        added.push(callback);
        return () => {
            unsubscribeAdded();
            added = added.filter((l) => l !== callback);
        };
    })
};

function notification(id: string, fileId = `file-${id}`): AppNotification {
    return {
        id,
        kind: 'schema-mismatch',
        createdAt: Date.now(),
        read: false,
        fileId,
        data: {
            expected: { gameYear: 22, major: 328, minor: 1 },
            loaded: { gameYear: 22, major: 329, minor: 1 },
            gameType: 'madden'
        }
    };
}

function missing(id: string, path = 'C:/saves/FTC'): AppNotification {
    return {
        id,
        kind: 'schema-missing',
        createdAt: Date.now(),
        read: false,
        data: {
            path,
            openOptions: { gameYearOverride: 18, gameTypeOverride: 'madden' },
            game: { gameYear: 18, gameType: 'madden' }
        }
    };
}

const selectTab = vi.fn();
const setPending = vi.fn();

const Probe: React.FC = () => {
    useNotificationBanners(selectTab);
    return null;
};

function setup() {
    return render(
        <PendingOpenContext.Provider value={[undefined, setPending]}>
            <BannerProvider>
                <Probe />
            </BannerProvider>
        </PendingOpenContext.Provider>
    );
}

const advance = (ms: number) =>
    act(() => {
        vi.advanceTimersByTime(ms);
    });

// main sends changed (with the new list), then added
function add(n: AppNotification, list: AppNotification[]): void {
    act(() => {
        changed.forEach((l) => l(list));
        added.forEach((l) => l(n));
    });
    advance(20 + SLIDE_MS);
}

function change(list: AppNotification[]): void {
    act(() => {
        changed.forEach((l) => l(list));
    });
}

const banner = () => screen.queryByTestId('banner');

describe('useNotificationBanners', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        added = [];
        changed = [];
        Object.assign(window, {
            electronAPI: { notifications: notificationsApi }
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("shows one banner with v4's text for an added notification", () => {
        setup();
        const n = notification('a');
        add(n, [n]);
        expect(screen.getAllByTestId('banner')).toHaveLength(1);
        expect(banner()).toHaveTextContent(MESSAGE);
        expect(banner()).toHaveAttribute('data-kind', 'schema-mismatch');
        expect(banner()).toHaveAttribute('role', 'alert');
    });

    it('Yes marks the notification read and selects the Schemas tab', () => {
        setup();
        const n = notification('a');
        add(n, [n]);
        fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
        expect(notificationsApi.markRead).toHaveBeenCalledWith(['a']);
        expect(selectTab).toHaveBeenCalledWith(SCHEMA_MANAGEMENT_KEY);
        advance(SLIDE_MS);
        expect(banner()).toBeNull();
    });

    it('No only closes the banner', () => {
        setup();
        const n = notification('a');
        add(n, [n]);
        fireEvent.click(screen.getByRole('button', { name: 'No' }));
        expect(notificationsApi.markRead).not.toHaveBeenCalled();
        expect(notificationsApi.dismiss).not.toHaveBeenCalled();
        expect(selectTab).not.toHaveBeenCalled();
        advance(SLIDE_MS);
        expect(banner()).toBeNull();
    });

    it('hides the banner when its notification is removed', () => {
        setup();
        const n = notification('a');
        add(n, [n]);
        change([n]);
        expect(banner()).not.toBeNull();
        change([]);
        advance(SLIDE_MS);
        expect(banner()).toBeNull();
    });

    it("drops a removed notification's queued banner", () => {
        setup();
        const first = notification('a');
        const second = notification('b');
        add(first, [first]);
        // opening the second file closes the first
        add(second, [second]);
        advance(SLIDE_MS + 20 + SLIDE_MS);
        expect(screen.getAllByTestId('banner')).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
        expect(notificationsApi.markRead).toHaveBeenCalledWith(['b']);
        advance(SLIDE_MS);
        expect(banner()).toBeNull();
    });

    it('shows no banner for notifications that exist at mount', () => {
        setup();
        change([notification('a')]);
        advance(20 + SLIDE_MS);
        expect(banner()).toBeNull();
        expect(notificationsApi.list).not.toHaveBeenCalled();
    });

    describe('schema-missing', () => {
        it('shows the missing-schema banner', () => {
            setup();
            const n = missing('m');
            add(n, [n]);
            expect(banner()).toHaveAttribute('data-kind', 'schema-missing');
            expect(banner()).toHaveTextContent(
                'No schema was found for FTC. Choose one on the Schema Management page?'
            );
        });

        it('Yes sets the pending file, marks read and selects Schemas', () => {
            setup();
            const n = missing('m');
            add(n, [n]);
            fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
            expect(setPending).toHaveBeenCalledWith({
                path: 'C:/saves/FTC',
                openOptions: {
                    gameYearOverride: 18,
                    gameTypeOverride: 'madden'
                },
                game: { gameYear: 18, gameType: 'madden' },
                notificationId: 'm'
            });
            expect(notificationsApi.markRead).toHaveBeenCalledWith(['m']);
            expect(selectTab).toHaveBeenCalledWith(SCHEMA_MANAGEMENT_KEY);
        });

        it('No leaves the pending file alone', () => {
            setup();
            const n = missing('m');
            add(n, [n]);
            fireEvent.click(screen.getByRole('button', { name: 'No' }));
            expect(setPending).not.toHaveBeenCalled();
            expect(selectTab).not.toHaveBeenCalled();
        });

        it('shows one banner for two opens of the same path', () => {
            setup();
            const first = missing('m1');
            const second = missing('m2', 'c:/SAVES/FTC');
            add(first, [first]);
            add(second, [second]);
            advance(SLIDE_MS + 20 + SLIDE_MS);
            expect(screen.getAllByTestId('banner')).toHaveLength(1);
            fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
            expect(notificationsApi.markRead).toHaveBeenCalledWith(['m2']);
            advance(SLIDE_MS);
            expect(banner()).toBeNull();
        });
    });

    it('unsubscribes on unmount', () => {
        const { unmount } = setup();
        expect(notificationsApi.onAdded).toHaveBeenCalledTimes(1);
        expect(notificationsApi.onChanged).toHaveBeenCalledTimes(1);
        unmount();
        expect(unsubscribeAdded).toHaveBeenCalledTimes(1);
        expect(unsubscribeChanged).toHaveBeenCalledTimes(1);
    });
});
