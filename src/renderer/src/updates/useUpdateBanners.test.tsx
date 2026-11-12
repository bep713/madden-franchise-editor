import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '@shared/types/update';
import { BannerProvider, SLIDE_MS } from '@renderer/banners/BannerContext';
import useUpdateBanners from './useUpdateBanners';

// A fake of main's update events
let listeners: ((status: UpdateStatus) => void)[] = [];
const unsubscribe = vi.fn();
let resolveStatus: (status: UpdateStatus | null) => void = () => {};
const getUpdateStatus = vi.fn(
    () =>
        new Promise<UpdateStatus | null>((resolve) => {
            resolveStatus = resolve;
        })
);
const updateApi = {
    check: vi.fn(),
    install: vi.fn(),
    openReleasePage: vi.fn(async () => undefined),
    onStatus: vi.fn((callback: (status: UpdateStatus) => void) => {
        listeners.push(callback);
        return () => {
            unsubscribe();
            listeners = listeners.filter((l) => l !== callback);
        };
    })
};

const Probe: React.FC = () => {
    useUpdateBanners();
    return null;
};

const setup = () =>
    render(
        <BannerProvider>
            <Probe />
        </BannerProvider>
    );

const advance = (ms: number) =>
    act(() => {
        vi.advanceTimersByTime(ms);
    });

function emit(status: UpdateStatus): void {
    act(() => {
        listeners.forEach((l) => l(status));
    });
    advance(20 + SLIDE_MS);
}

async function restore(status: UpdateStatus | null): Promise<void> {
    await act(async () => {
        resolveStatus(status);
    });
    advance(20 + SLIDE_MS);
}

const ready: UpdateStatus = {
    channel: 'update-ready',
    data: {
        version: '5.1.0',
        currentVersion: '5.0.0',
        channel: 'stable',
        manual: true
    }
};

const progress = (percent: number): UpdateStatus => ({
    channel: 'update-progress',
    data: { percent, bytesPerSecond: 1, transferred: 1, total: 2 }
});

const banner = () => screen.queryByTestId('banner');

describe('useUpdateBanners', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        listeners = [];
        Object.assign(window, {
            electronAPI: { update: updateApi, getUpdateStatus }
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('Update on the update-available banner calls install', () => {
        setup();
        emit(ready);
        expect(banner()).toHaveAttribute('data-kind', 'update');
        expect(banner()).toHaveTextContent('Version 5.1.0 is available');
        fireEvent.click(screen.getByRole('button', { name: 'Update' }));
        expect(updateApi.install).toHaveBeenCalledTimes(1);
    });

    it('replaces the download banner in place as progress arrives', () => {
        setup();
        emit({ channel: 'update-downloading' });
        expect(banner()).toHaveTextContent('Downloading… 0%');
        act(() => {
            listeners.forEach((l) => l(progress(37.2)));
        });
        expect(screen.getAllByTestId('banner')).toHaveLength(1);
        expect(banner()).toHaveTextContent('Downloading… 37%');
        // sticky
        advance(60_000);
        expect(banner()).toHaveTextContent('Downloading… 37%');
        act(() => {
            listeners.forEach((l) => l({ channel: 'update-downloaded' }));
        });
        expect(banner()).toHaveTextContent('Installing…');
    });

    it('shows nothing for a quiet automatic check', () => {
        setup();
        emit({ channel: 'checking-for-updates', data: { manual: false } });
        emit({ channel: 'update-not-available', data: { manual: false } });
        expect(banner()).toBeNull();
    });

    it('an automatic no-update hides a shown update banner', () => {
        setup();
        emit(ready);
        emit({ channel: 'update-not-available', data: { manual: false } });
        advance(SLIDE_MS);
        expect(banner()).toBeNull();
    });

    it('restores a download in progress on mount', async () => {
        setup();
        expect(getUpdateStatus).toHaveBeenCalledTimes(1);
        await restore(progress(50));
        expect(banner()).toHaveTextContent('Downloading… 50%');
    });

    it('does not restore update-ready', async () => {
        setup();
        await restore(ready);
        expect(banner()).toBeNull();
    });

    it('ignores a late status once an event arrived', async () => {
        setup();
        emit({ channel: 'update-downloaded' });
        await restore({ channel: 'update-downloading' });
        expect(banner()).toHaveTextContent('Installing…');
    });

    it('unsubscribes on unmount', () => {
        const { unmount } = setup();
        unmount();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});
