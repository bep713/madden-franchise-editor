import { useEffect, useRef } from 'react';
import type { AppNotification } from '@shared/types/notifications';
import type { BannerAction } from '@renderer/components/Banner/Banner';
import { useBanner } from '@renderer/banners/BannerContext';
import {
    PendingOpen,
    pendingFromNotification,
    usePendingOpen
} from '@renderer/context/PendingOpenContext';
import { SCHEMA_MANAGEMENT_KEY } from '@renderer/tabs/editorTabs';
import { describeNotification } from './describe';

type SelectTab = (key: string) => void;
type SetPending = (pending: PendingOpen) => void;

function actionsFor(
    n: AppNotification,
    selectTab: SelectTab,
    setPending: SetPending
): BannerAction[] {
    switch (n.kind) {
        case 'schema-mismatch':
            return [
                { label: 'No', onClick: () => {} },
                {
                    label: 'Yes',
                    primary: true,
                    onClick: () => {
                        window.electronAPI.notifications.markRead([n.id]);
                        selectTab(SCHEMA_MANAGEMENT_KEY);
                    }
                }
            ];
        case 'schema-missing':
            return [
                { label: 'No', onClick: () => {} },
                {
                    label: 'Yes',
                    primary: true,
                    onClick: () => {
                        setPending(pendingFromNotification(n));
                        window.electronAPI.notifications.markRead([n.id]);
                        selectTab(SCHEMA_MANAGEMENT_KEY);
                    }
                }
            ];
        case 'file-changed':
        case 'file-missing':
        case 'update-available':
            // Never shown: the bar under the tabs (AutoSavePaused) and
            // useUpdateBanners own these
            return [];
    }
}

// One banner per file: by fileId, or for kinds without one by path, in
// main's samePath form (no case, forward slashes)
function bannerKey(n: AppNotification): string {
    const target =
        n.fileId ??
        (n.kind === 'schema-missing'
            ? n.data.path.replace(/\\/g, '/').toLowerCase()
            : '');
    return `${n.kind}:${target}`;
}

// Shows a banner for each notification main adds while this is mounted, and
// hides it once the notification is gone (loaded, closed or dismissed).
// Notifications that already exist at mount get no banner.
export default function useNotificationBanners(selectTab: SelectTab): void {
    const { show, hide } = useBanner();
    const [, setPending] = usePendingOpen();
    // read at click time, so a new selectTab doesn't resubscribe
    const selectTabRef = useRef(selectTab);
    const setPendingRef = useRef(setPending);
    useEffect(() => {
        selectTabRef.current = selectTab;
        setPendingRef.current = setPending;
    }, [selectTab, setPending]);

    useEffect(() => {
        const api = window.electronAPI.notifications;
        // notification id -> banner id
        const banners = new Map<string, string>();

        const unsubscribeAdded = api.onAdded((n) => {
            // useUpdateBanners shows the update banner, from update-ready;
            // the bar under the tabs shows an outside change
            if (
                n.kind === 'update-available' ||
                n.kind === 'file-changed' ||
                n.kind === 'file-missing'
            ) {
                return;
            }
            const text = describeNotification(n);
            banners.set(
                n.id,
                show({
                    key: bannerKey(n),
                    kind: n.kind,
                    message: text.bannerMessage,
                    severity: text.bannerSeverity,
                    actions: actionsFor(
                        n,
                        (key) => selectTabRef.current(key),
                        (pending) => setPendingRef.current?.(pending)
                    )
                })
            );
        });

        const unsubscribeChanged = api.onChanged((list) => {
            const ids = new Set(list.map((n) => n.id));
            for (const [notificationId, bannerId] of banners) {
                if (ids.has(notificationId)) continue;
                hide(bannerId);
                banners.delete(notificationId);
            }
        });

        return () => {
            unsubscribeAdded();
            unsubscribeChanged();
        };
    }, [show, hide]);
}
