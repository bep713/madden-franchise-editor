import { useEffect, useRef } from 'react';
import type { AppNotification } from '@shared/types/notifications';
import type { BannerAction } from '@renderer/components/Banner/Banner';
import { useBanner } from '@renderer/banners/BannerContext';
import {
    PendingOpen,
    pendingFromNotification,
    usePendingOpen
} from '@renderer/context/PendingOpenContext';
import {
    type ExternalChange,
    useExternalChange
} from '@renderer/context/ExternalChangeContext';
import { SCHEMA_MANAGEMENT_KEY } from '@renderer/tabs/editorTabs';
import { describeNotification } from './describe';

type SelectTab = (key: string) => void;
type SetPending = (pending: PendingOpen) => void;

function actionsFor(
    n: AppNotification,
    selectTab: SelectTab,
    setPending: SetPending,
    externalChange: () => ExternalChange
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
        case 'file-changed': {
            const fileId = n.fileId;
            return [
                {
                    label: 'Dismiss',
                    onClick: () =>
                        window.electronAPI.notifications.dismiss(n.id)
                },
                {
                    label: 'Branch and save new',
                    onClick: () => {
                        window.electronAPI.notifications.markRead([n.id]);
                        if (fileId) void externalChange().branch(fileId);
                    }
                },
                {
                    label: 'Reload',
                    primary: true,
                    onClick: () => {
                        window.electronAPI.notifications.markRead([n.id]);
                        if (fileId) void externalChange().reload(fileId);
                    }
                }
            ];
        }
        case 'file-missing': {
            const fileId = n.fileId;
            return [
                {
                    label: 'Dismiss',
                    onClick: () =>
                        window.electronAPI.notifications.dismiss(n.id)
                },
                {
                    label: 'Save as new',
                    onClick: () => {
                        window.electronAPI.notifications.markRead([n.id]);
                        if (fileId) void externalChange().branch(fileId);
                    }
                },
                {
                    label: 'Save here',
                    primary: true,
                    onClick: () => {
                        window.electronAPI.notifications.markRead([n.id]);
                        if (fileId) void externalChange().saveHere(fileId);
                    }
                }
            ];
        }
        case 'update-available':
            // Never shown: useUpdateBanners owns the update banner
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
    const externalChange = useExternalChange();
    // read at click time, so a new selectTab doesn't resubscribe
    const selectTabRef = useRef(selectTab);
    const setPendingRef = useRef(setPending);
    const externalChangeRef = useRef(externalChange);
    useEffect(() => {
        selectTabRef.current = selectTab;
        setPendingRef.current = setPending;
        externalChangeRef.current = externalChange;
    }, [selectTab, setPending, externalChange]);

    useEffect(() => {
        const api = window.electronAPI.notifications;
        // notification id -> banner id
        const banners = new Map<string, string>();

        const unsubscribeAdded = api.onAdded((n) => {
            // useUpdateBanners already shows it, from update-ready
            if (n.kind === 'update-available') return;
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
                        (pending) => setPendingRef.current?.(pending),
                        () => externalChangeRef.current
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
