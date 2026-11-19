import { useEffect } from 'react';
import type { UpdateStatus } from '@shared/types/update';
import { useBanner } from '@renderer/banners/BannerContext';
import { isRestored, updateBannerFor } from './updateBanner';

// Shows the update banner for each updater event main sends, and after a UI
// switch restores a download or error that was in progress.
export default function useUpdateBanners(): void {
    const { show, hide } = useBanner();

    useEffect(() => {
        const api = window.electronAPI;
        let active = true;
        // an event arrived, so the status read at mount is stale
        let gotEvent = false;
        let bannerId: string | null = null;

        const apply = (status: UpdateStatus): void => {
            const banner = updateBannerFor(status);
            if (banner) {
                bannerId = show(banner);
            } else if (
                status.channel === 'update-not-available' &&
                bannerId !== null
            ) {
                hide(bannerId);
                bannerId = null;
            }
        };

        const unsubscribe = api.update.onStatus((status) => {
            gotEvent = true;
            apply(status);
        });

        void api
            .getUpdateStatus()
            .then((status) => {
                if (!active || gotEvent || !status) return;
                if (isRestored(status)) apply(status);
            })
            .catch((err) => console.warn('getUpdateStatus failed:', err));

        return () => {
            active = false;
            unsubscribe();
        };
    }, [show, hide]);
}
