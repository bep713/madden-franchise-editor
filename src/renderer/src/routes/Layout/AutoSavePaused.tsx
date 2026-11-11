import { useContext } from 'react';
import AutoSavePausedStrip from '@renderer/components/AutoSavePausedStrip/AutoSavePausedStrip';
import { useExternalChange } from '@renderer/context/ExternalChangeContext';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import usePreference from '@renderer/hooks/usePreference';
import useNotifications from '@renderer/notifications/useNotifications';
import { basename } from '@renderer/utils/path';
import type { AppNotification } from '@shared/types/notifications';

type FileChangedNotification = Extract<
    AppNotification,
    { kind: 'file-changed' }
>;

// A settings checkbox is stored as [true] or [] (main's _isPreferenceEnabled)
function isEnabled(value: unknown): boolean {
    return Array.isArray(value) ? value.includes(true) : Boolean(value);
}

// Main pauses auto-save while the open file has a File Changed notification.
// With auto-save off nothing is paused, so the strip stays hidden.
const AutoSavePaused: React.FC = () => {
    const [openFile] = useContext(FranchiseFileContext);
    const { notifications } = useNotifications();
    const [autoSave] = usePreference<unknown>('general.autoSave', false);
    const { reload, branch } = useExternalChange();

    const changed = notifications.find(
        (n): n is FileChangedNotification =>
            n.kind === 'file-changed' && n.fileId === openFile?.fileId
    );
    if (!openFile || !changed || !isEnabled(autoSave)) return null;

    const { fileId } = openFile;
    return (
        <AutoSavePausedStrip
            fileName={basename(openFile.path ?? changed.data.path)}
            onBranch={() => branch(fileId)}
            onReload={() => reload(fileId)}
        />
    );
};

export default AutoSavePaused;
