import { useContext, useState } from 'react';
import AutoSavePausedStrip from '@renderer/components/AutoSavePausedStrip/AutoSavePausedStrip';
import {
    isEnabled,
    useExternalChange
} from '@renderer/context/ExternalChangeContext';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import usePreference from '@renderer/hooks/usePreference';
import useNotifications from '@renderer/notifications/useNotifications';
import { basename } from '@renderer/utils/path';
import type { AppNotification } from '@shared/types/notifications';

type ExternalNotification = Extract<
    AppNotification,
    { kind: 'file-changed' | 'file-missing' }
>;

// The bar for the open file's File Changed or File Missing notification, with
// auto-save on or off. Main pauses auto-save until the user chooses. With
// auto-save off the bar can be hidden, until a new notification arrives or
// auto-save is turned on.
const AutoSavePaused: React.FC = () => {
    const [openFile] = useContext(FranchiseFileContext);
    const { notifications } = useNotifications();
    const [autoSavePref] = usePreference<unknown>('general.autoSave', false);
    const { load, keep, copy, putBack } = useExternalChange();
    // The notification id the user hid
    const [hiddenId, setHiddenId] = useState<string>();

    const forFile = notifications.filter(
        (n): n is ExternalNotification =>
            (n.kind === 'file-changed' || n.kind === 'file-missing') &&
            n.fileId === openFile?.fileId
    );
    // Main keeps one or the other; missing wins if somehow both are there
    const external =
        forFile.find((n) => n.kind === 'file-missing') ?? forFile[0];
    const autoSave = isEnabled(autoSavePref);
    if (!openFile || !external) return null;
    if (!autoSave && hiddenId === external.id) return null;

    const { fileId } = openFile;
    const common = {
        autoSave,
        fileName: basename(openFile.path ?? external.data.path),
        onCopy: () => void copy(fileId),
        onHide: () => setHiddenId(external.id)
    };
    return external.kind === 'file-missing' ? (
        <AutoSavePausedStrip
            {...common}
            onPutBack={() => void putBack(fileId)}
            reason='missing'
        />
    ) : (
        <AutoSavePausedStrip
            {...common}
            onKeep={() => void keep(fileId)}
            onLoad={() => void load(fileId)}
            reason='changed'
        />
    );
};

export default AutoSavePaused;
