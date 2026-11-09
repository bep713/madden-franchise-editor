import { useEffect, useRef, useState } from 'react';
import cx from 'classnames';
import type { AppNotification } from '@shared/types/notifications';
import Close from '@assets/icons/close.svg?react';
import {
    pendingFromNotification,
    usePendingOpen
} from '@renderer/context/PendingOpenContext';
import { describeNotification } from '@renderer/notifications/describe';
import { relativeTime } from '@renderer/notifications/relativeTime';
import { useEditorTabs } from '@renderer/tabs/EditorTabsContext';
import { SCHEMA_MANAGEMENT_KEY } from '@renderer/tabs/editorTabs';
import styles from './NotificationDrawer.module.css';

const REFRESH_MS = 60 * 1000;

interface Props {
    notifications: AppNotification[];
    onClose: () => void;
}

// Mounted only while the drawer is open. Everything unread is marked read in
// main right away, but keeps its dot until the drawer closes.
const NotificationDrawer: React.FC<Props> = ({
    notifications,
    onClose
}: Props) => {
    const editorTabs = useEditorTabs();
    const [, setPending] = usePendingOpen();
    const [now, setNow] = useState(() => Date.now());
    // Ids that were unread when this viewing first saw them
    const seenUnread = useRef(new Set<string>());
    const [unread, setUnread] = useState<ReadonlySet<string>>(new Set());

    // The drawer marks everything read already
    function linkAction(n: AppNotification): void {
        if (n.kind === 'schema-missing') {
            setPending?.(pendingFromNotification(n));
        }
        editorTabs.selectTab(SCHEMA_MANAGEMENT_KEY);
    }

    useEffect(() => {
        const ids = notifications
            .filter((n) => !n.read && !seenUnread.current.has(n.id))
            .map((n) => n.id);
        if (ids.length === 0) return;
        ids.forEach((id) => seenUnread.current.add(id));
        setUnread(new Set(seenUnread.current));
        window.electronAPI.notifications.markRead(ids);
    }, [notifications]);

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), REFRESH_MS);
        return () => clearInterval(timer);
    }, []);

    return (
        <aside aria-label='Notifications' className={styles.drawer}>
            <header className={styles.header}>
                <h2 className={styles.title}>Notifications</h2>
                <button
                    aria-label='Close notifications'
                    className={styles.iconButton}
                    onClick={onClose}
                    type='button'
                >
                    <Close aria-hidden='true' />
                </button>
            </header>
            {notifications.length === 0 ? (
                <p className={styles.empty}>No notifications</p>
            ) : (
                <ul className={styles.list}>
                    {notifications.map((n) => {
                        const text = describeNotification(n);
                        const isUnread = unread.has(n.id);
                        const created = new Date(n.createdAt);
                        return (
                            <li
                                className={styles.item}
                                data-kind={n.kind}
                                data-notification-id={n.id}
                                data-read={!isUnread}
                                key={n.id}
                            >
                                <span
                                    className={cx(styles.dot, {
                                        [styles.unread]: isUnread
                                    })}
                                    data-testid={
                                        isUnread ? 'unread-dot' : undefined
                                    }
                                />
                                <div className={styles.body}>
                                    <div className={styles.itemHeader}>
                                        <span
                                            className={cx(styles.itemTitle, {
                                                [styles.bold]: isUnread
                                            })}
                                            data-field='title'
                                        >
                                            {text.title}
                                        </span>
                                        <time
                                            className={styles.time}
                                            data-field='time'
                                            dateTime={created.toISOString()}
                                            title={created.toLocaleString()}
                                        >
                                            {relativeTime(n.createdAt, now)}
                                        </time>
                                    </div>
                                    <p
                                        className={styles.description}
                                        data-field='description'
                                    >
                                        {text.description}
                                    </p>
                                    <button
                                        className={styles.link}
                                        data-action='notification-link'
                                        onClick={() => linkAction(n)}
                                        type='button'
                                    >
                                        {text.linkLabel}
                                    </button>
                                </div>
                                <button
                                    aria-label={`Dismiss ${text.title}`}
                                    className={styles.iconButton}
                                    data-action='dismiss-notification'
                                    onClick={() =>
                                        window.electronAPI.notifications.dismiss(
                                            n.id
                                        )
                                    }
                                    type='button'
                                >
                                    <Close aria-hidden='true' />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </aside>
    );
};

export default NotificationDrawer;
