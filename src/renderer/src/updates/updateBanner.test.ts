import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '@shared/types/update';
import {
    NO_UPDATES_DURATION_MS,
    UPDATE_BANNER_KEY,
    isRestored,
    updateBannerFor
} from './updateBanner';

const ERROR_MESSAGE = 'There was an unexpected error when trying to update.';

const updateApi = {
    check: vi.fn(),
    install: vi.fn(),
    openReleasePage: vi.fn(async () => undefined),
    onStatus: vi.fn(() => () => {})
};

const ready = (
    channel: 'stable' | 'nightly' = 'stable',
    manual?: boolean
): UpdateStatus => ({
    channel: 'update-ready',
    data: { version: '5.1.0', currentVersion: '5.0.0', channel, manual }
});

describe('updateBannerFor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(window, { electronAPI: { update: updateApi } });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('shows a sticky checking banner for a manual check only', () => {
        expect(
            updateBannerFor({
                channel: 'checking-for-updates',
                data: { manual: true }
            })
        ).toEqual({
            key: UPDATE_BANNER_KEY,
            kind: 'update',
            message: 'Checking for updates…',
            severity: 'info',
            durationMs: Infinity
        });
        expect(
            updateBannerFor({
                channel: 'checking-for-updates',
                data: { manual: false }
            })
        ).toBeNull();
    });

    it("shows v4's update-available text with Dismiss and Update", () => {
        const banner = updateBannerFor(ready('stable', false));
        expect(banner).toMatchObject({
            key: UPDATE_BANNER_KEY,
            kind: 'update',
            severity: 'info',
            message:
                'Version 5.1.0 is available (you have 5.0.0). It will take less than 5 minutes to install.'
        });
        expect(banner?.durationMs).toBeUndefined();
        expect(banner?.actions?.map((a) => a.label)).toEqual([
            'Dismiss',
            'Update'
        ]);
        banner?.actions?.[0].onClick();
        expect(updateApi.install).not.toHaveBeenCalled();
        banner?.actions?.[1].onClick();
        expect(updateApi.install).toHaveBeenCalledTimes(1);
    });

    it('labels a nightly build', () => {
        expect(updateBannerFor(ready('nightly'))?.message).toMatch(
            /^Nightly build 5\.1\.0 is available/
        );
    });

    it('shows no-updates for a manual check only', () => {
        expect(
            updateBannerFor({
                channel: 'update-not-available',
                data: { manual: true }
            })
        ).toEqual({
            key: UPDATE_BANNER_KEY,
            kind: 'update',
            message:
                'There are no updates available, you are running the latest version.',
            severity: 'success',
            durationMs: NO_UPDATES_DURATION_MS
        });
        expect(
            updateBannerFor({
                channel: 'update-not-available',
                data: { manual: false }
            })
        ).toBeNull();
    });

    it('shows sticky download progress and installing banners', () => {
        expect(updateBannerFor({ channel: 'update-downloading' })).toEqual({
            key: UPDATE_BANNER_KEY,
            kind: 'update',
            message: 'Downloading… 0%',
            severity: 'info',
            durationMs: Infinity
        });
        expect(
            updateBannerFor({
                channel: 'update-progress',
                data: {
                    percent: 42.6,
                    bytesPerSecond: 1,
                    transferred: 1,
                    total: 2
                }
            })
        ).toMatchObject({ message: 'Downloading… 43%', durationMs: Infinity });
        expect(updateBannerFor({ channel: 'update-downloaded' })).toMatchObject(
            { message: 'Installing…', durationMs: Infinity }
        );
    });

    it('is silent for an automatic check error', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(
            updateBannerFor({
                channel: 'update-error',
                data: { message: 'offline', manual: false, phase: 'check' }
            })
        ).toBeNull();
        expect(warn).toHaveBeenCalled();
    });

    it('shows an 8 s error with Update manually for a manual check', () => {
        const banner = updateBannerFor({
            channel: 'update-error',
            data: { message: 'offline', manual: true, phase: 'check' }
        });
        expect(banner).toMatchObject({
            key: UPDATE_BANNER_KEY,
            kind: 'update',
            message: ERROR_MESSAGE,
            severity: 'error'
        });
        expect(banner?.durationMs).toBeUndefined();
        expect(banner?.actions?.map((a) => a.label)).toEqual([
            'Dismiss',
            'Update manually'
        ]);
        banner?.actions?.[1].onClick();
        expect(updateApi.openReleasePage).toHaveBeenCalledTimes(1);
    });

    it('shows a sticky error for a download, even from an automatic check', () => {
        expect(
            updateBannerFor({
                channel: 'update-error',
                data: { message: 'failed', manual: false, phase: 'download' }
            })
        ).toMatchObject({
            message: ERROR_MESSAGE,
            severity: 'error',
            durationMs: Infinity
        });
    });

    it('treats a missing manual flag as manual', () => {
        expect(
            updateBannerFor({ channel: 'checking-for-updates', data: {} })
        ).not.toBeNull();
        expect(
            updateBannerFor({ channel: 'update-not-available', data: {} })
        ).not.toBeNull();
        expect(
            updateBannerFor({
                channel: 'update-error',
                data: { message: 'x', phase: 'check' }
            })
        ).toMatchObject({ severity: 'error' });
    });
});

describe('isRestored', () => {
    it('restores downloads and errors, not update-ready or checks', () => {
        expect(isRestored({ channel: 'update-downloading' })).toBe(true);
        expect(isRestored({ channel: 'update-downloaded' })).toBe(true);
        expect(
            isRestored({
                channel: 'update-error',
                data: { message: 'x', phase: 'download' }
            })
        ).toBe(true);
        expect(isRestored(ready())).toBe(false);
        expect(isRestored({ channel: 'checking-for-updates', data: {} })).toBe(
            false
        );
    });
});
