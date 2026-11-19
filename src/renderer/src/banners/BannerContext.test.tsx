import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BannerOptions,
    BannerProvider,
    DEFAULT_DURATION_MS,
    SLIDE_MS,
    useBanner
} from './BannerContext';

type Api = ReturnType<typeof useBanner>;

function setup(): { api: () => Api; unmount: () => void } {
    let api!: Api;
    const Probe: React.FC = () => {
        api = useBanner();
        return null;
    };
    const { unmount } = render(
        <BannerProvider>
            <Probe />
        </BannerProvider>
    );
    return { api: () => api, unmount };
}

const info = (message: string, extra: Partial<BannerOptions> = {}) => ({
    message,
    severity: 'info' as const,
    ...extra
});

const advance = (ms: number) =>
    act(() => {
        vi.advanceTimersByTime(ms);
    });

// slide-in: 20ms enter delay + 300ms transition
const SHOWN_MS = 20 + SLIDE_MS;

const isVisible = () =>
    screen.getByTestId('banner').className.includes('visible');

const text = () => screen.queryByTestId('banner')?.textContent ?? null;

describe('BannerProvider', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows banners one at a time in FIFO order', () => {
        const { api } = setup();
        act(() => {
            api().show(info('one'));
            api().show(info('two'));
        });
        expect(screen.getAllByTestId('banner')).toHaveLength(1);
        expect(text()).toContain('one');
        advance(SHOWN_MS + DEFAULT_DURATION_MS);
        // slide-out is running, next one has not started yet
        expect(text()).toContain('one');
        advance(SLIDE_MS);
        // the next banner mounts hidden, then slides in on the next frame
        expect(text()).toContain('two');
        expect(isVisible()).toBe(false);
        advance(20);
        expect(isVisible()).toBe(true);
    });

    it('starts the next banner only after the slide-out', () => {
        const { api } = setup();
        let id = '';
        act(() => {
            id = api().show(info('one'));
            api().show(info('two'));
        });
        advance(SHOWN_MS);
        act(() => api().hide(id));
        advance(SLIDE_MS - 1);
        expect(text()).toContain('one');
        advance(1);
        expect(text()).toContain('two');
        expect(isVisible()).toBe(false);
        advance(20);
        expect(isVisible()).toBe(true);
    });

    it('replaces a current banner with the same key and restarts the timer', () => {
        const { api } = setup();
        let id1 = '';
        let id2 = '';
        act(() => {
            id1 = api().show(info('old', { key: 'k' }));
        });
        advance(SHOWN_MS + DEFAULT_DURATION_MS - 1000);
        act(() => {
            id2 = api().show(info('new', { key: 'k' }));
        });
        expect(id2).toBe(id1);
        expect(text()).toContain('new');
        advance(DEFAULT_DURATION_MS - 1);
        expect(text()).toContain('new');
        advance(1 + SLIDE_MS);
        expect(text()).toBeNull();
    });

    it('replaces a queued banner with the same key in place', () => {
        const { api } = setup();
        act(() => {
            api().show(info('one'));
            api().show(info('queued', { key: 'k' }));
            api().show(info('two'));
            api().show(info('replaced', { key: 'k' }));
        });
        const order: (string | null)[] = [];
        for (let i = 0; i < 3; i++) {
            advance(SHOWN_MS + DEFAULT_DURATION_MS + SLIDE_MS + 20);
            order.push(text());
        }
        expect(order[0]).toContain('replaced');
        expect(order[1]).toContain('two');
        expect(order[2]).toBeNull();
    });

    it('auto-hides after 8000ms', () => {
        const { api } = setup();
        act(() => {
            api().show(info('one'));
        });
        advance(SHOWN_MS + DEFAULT_DURATION_MS - 1);
        expect(text()).toContain('one');
        advance(1 + SLIDE_MS);
        expect(text()).toBeNull();
    });

    it('pauses on hover and resumes with the remaining time', () => {
        const { api } = setup();
        act(() => {
            api().show(info('one'));
        });
        advance(SHOWN_MS + 5000);
        const banner = screen.getByTestId('banner');
        fireEvent.pointerEnter(banner);
        advance(60000);
        expect(text()).toContain('one');
        fireEvent.pointerLeave(banner);
        advance(2999);
        expect(text()).toContain('one');
        advance(1 + SLIDE_MS);
        expect(text()).toBeNull();
    });

    it('pauses while focus is inside the banner', () => {
        const { api } = setup();
        act(() => {
            api().show(
                info('one', { actions: [{ label: 'Go', onClick: vi.fn() }] })
            );
        });
        advance(SHOWN_MS + 1000);
        const button = screen.getByRole('button', { name: 'Go' });
        fireEvent.focus(button);
        advance(60000);
        expect(text()).toContain('one');
        fireEvent.blur(button);
        advance(7000 + SLIDE_MS);
        expect(text()).toBeNull();
    });

    it('stays paused when the pointer leaves while focus remains', () => {
        const { api } = setup();
        act(() => {
            api().show(
                info('one', { actions: [{ label: 'Go', onClick: vi.fn() }] })
            );
        });
        advance(SHOWN_MS);
        const banner = screen.getByTestId('banner');
        fireEvent.pointerEnter(banner);
        fireEvent.focus(screen.getByRole('button', { name: 'Go' }));
        fireEvent.pointerLeave(banner);
        advance(60000);
        expect(text()).toContain('one');
    });

    it('runs an action handler and hides the banner', () => {
        const { api } = setup();
        const onClick = vi.fn();
        act(() => {
            api().show(info('one', { actions: [{ label: 'Go', onClick }] }));
        });
        advance(SHOWN_MS);
        fireEvent.click(screen.getByRole('button', { name: 'Go' }));
        expect(onClick).toHaveBeenCalledTimes(1);
        advance(SLIDE_MS);
        expect(text()).toBeNull();
    });

    it('drops a queued banner when it is hidden', () => {
        const { api } = setup();
        let queued = '';
        act(() => {
            api().show(info('one'));
            queued = api().show(info('two'));
            api().show(info('three'));
            api().hide(queued);
        });
        advance(SHOWN_MS + DEFAULT_DURATION_MS + SLIDE_MS + 20);
        expect(text()).toContain('three');
    });

    it('does not hide a replacement early with the old timer', () => {
        const { api } = setup();
        act(() => {
            api().show(info('a', { key: 'k', durationMs: 1000 }));
        });
        advance(SHOWN_MS + 900);
        act(() => {
            api().show(info('b', { key: 'k', durationMs: 5000 }));
        });
        advance(4999);
        expect(text()).toContain('b');
    });

    it('clears timers on unmount', () => {
        const { api, unmount } = setup();
        act(() => {
            api().show(info('one'));
            api().show(info('two'));
        });
        advance(SHOWN_MS);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});
