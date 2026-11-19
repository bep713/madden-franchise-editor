import { useEffect, useState } from 'react';
import type { AppNotification } from '@shared/types/notifications';

export interface NotificationsState {
    notifications: AppNotification[];
    unreadCount: number;
}

// The notification store in main, newest first. Every change replaces the list.
export default function useNotifications(): NotificationsState {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);

    useEffect(() => {
        let active = true;
        const api = window.electronAPI.notifications;
        const unsubscribe = api.onChanged((list) => {
            active = false; // newer than whatever list() returns
            setNotifications(list);
        });
        api.list().then((list) => {
            if (active) setNotifications(list);
        });
        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    return {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length
    };
}
