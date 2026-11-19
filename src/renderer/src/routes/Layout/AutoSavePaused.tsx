import { useContext } from 'react';
import AutoSavePausedStrip from '@renderer/components/AutoSavePausedStrip/AutoSavePausedStrip';
import { useExternalChange } from '@renderer/context/ExternalChangeContext';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import usePreference from '@renderer/hooks/usePreference';
import useNotifications from '@renderer/notifications/useNotifications';
import { basename } from '@renderer/utils/path';
import type { AppNotification } from '@shared/types/notifications';

type ExternalNotification = Extract<
    AppNotification,
    { kind: 'file-changed' | 'file-missing' }
>;

// A settings checkbox is stored as [true] or [] (main's _isPreferenceEnabled)
function isEnabled(value: unknown): boolean {
    return Array.isArray(value) ? value.includes(true) : Boolean(value);
}

// Main pauses auto-save while the open file has a File Changed or File
// Missing notification. With auto-save off nothing is paused, so the strip
// stays hidden.
const AutoSavePaused: React.FC = () => {
    const [openFile] = useContext(FranchiseFileContext);
    const { notifications } = useNotifications();
    const [autoSave] = usePreference<unknown>('general.autoSave', false);
    const { reload, branch, saveHere } = useExternalChange();

    const forFile = notifications.filter(
        (n): n is ExternalNotification =>
            (n.kind === 'file-changed' || n.kind === 'file-missing') &&
            n.fileId === openFile?.fileId
    );
    // Main keeps one or the other; missing wins if somehow both are there
    const external =
        forFile.find((n) => n.kind === 'file-missing') ?? forFile[0];
    if (!openFile || !external || !isEnabled(autoSave)) return null;

    const { fileId } = openFile;
    const fileName = basename(openFile.path ?? external.data.path);
    return external.kind === 'file-missing' ? (
        <AutoSavePausedStrip
            fileName={fileName}
            onBranch={() => branch(fileId)}
            onSaveHere={() => saveHere(fileId)}
            reason='missing'
        />
    ) : (
        <AutoSavePausedStrip
            fileName={fileName}
            onBranch={() => branch(fileId)}
            onReload={() => reload(fileId)}
            reason='changed'
        />
    );
};

export default AutoSavePaused;
