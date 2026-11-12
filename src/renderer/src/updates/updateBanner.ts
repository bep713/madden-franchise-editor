import type { BannerOptions } from '@renderer/banners/BannerContext';
import type { UpdateStatus } from '@shared/types/update';

// One banner for every update state, so each replaces the last in place
export const UPDATE_BANNER_KEY = 'update';
export const NO_UPDATES_DURATION_MS = 3500;

const ERROR_MESSAGE = 'There was an unexpected error when trying to update.';

// Older payloads have no manual flag; showing the banner is the safe side
const isManual = (data: { manual?: boolean } | undefined): boolean =>
    data?.manual !== false;

function sticky(message: string): BannerOptions {
    return {
        key: UPDATE_BANNER_KEY,
        kind: 'update',
        message,
        severity: 'info',
        durationMs: Infinity
    };
}

// The banner for an updater event, or null for none. Automatic checks are
// quiet: no checking, no-updates or check-error banners.
export function updateBannerFor(status: UpdateStatus): BannerOptions | null {
    switch (status.channel) {
        case 'checking-for-updates':
            return isManual(status.data)
                ? sticky('Checking for updates…')
                : null;
        case 'update-ready': {
            const { version, currentVersion, channel } = status.data;
            const label = channel === 'nightly' ? 'Nightly build' : 'Version';
            return {
                key: UPDATE_BANNER_KEY,
                kind: 'update',
                message: `${label} ${version} is available (you have ${currentVersion}). It will take less than 5 minutes to install.`,
                severity: 'info',
                actions: [
                    { label: 'Dismiss', onClick: () => {} },
                    {
                        label: 'Update',
                        primary: true,
                        onClick: () => window.electronAPI.update.install()
                    }
                ]
            };
        }
        case 'update-not-available':
            return isManual(status.data)
                ? {
                      key: UPDATE_BANNER_KEY,
                      kind: 'update',
                      message:
                          'There are no updates available, you are running the latest version.',
                      severity: 'success',
                      durationMs: NO_UPDATES_DURATION_MS
                  }
                : null;
        case 'update-downloading':
            return sticky('Downloading… 0%');
        case 'update-progress':
            return sticky(
                `Downloading… ${(status.data?.percent ?? 0).toFixed(0)}%`
            );
        case 'update-downloaded':
            return sticky('Installing…');
        case 'update-error': {
            const download = status.data?.phase === 'download';
            if (!download && !isManual(status.data)) {
                console.warn('Update check failed:', status.data?.message);
                return null;
            }
            return {
                key: UPDATE_BANNER_KEY,
                kind: 'update',
                message: ERROR_MESSAGE,
                severity: 'error',
                durationMs: download ? Infinity : undefined,
                actions: [
                    { label: 'Dismiss', onClick: () => {} },
                    {
                        label: 'Update manually',
                        primary: true,
                        onClick: () =>
                            void window.electronAPI.update.openReleasePage()
                    }
                ]
            };
        }
    }
}

// Events restored after a UI switch. update-ready is left to the drawer.
const RESTORED = new Set<UpdateStatus['channel']>([
    'update-downloading',
    'update-progress',
    'update-downloaded',
    'update-error'
]);

export const isRestored = (status: UpdateStatus): boolean =>
    RESTORED.has(status.channel);
