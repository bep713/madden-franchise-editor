import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PinsFile, TableListItem } from '@shared/types';
import { OpenFranchiseFile } from '@renderer/context/FranchiseFileContext';
import {
    PINS_FILENAME,
    PinnableTable,
    addPin,
    findPinGroup,
    getPinnedTables,
    preparePins,
    removePin
} from '@renderer/utils/pins';

type FileTable = OpenFranchiseFile['tables'][number];

export interface PinnedTables {
    pinnedTables: FileTable[];
    isPinned: (table: Pick<TableListItem, 'id'>) => boolean;
    togglePin: (table: PinnableTable) => void;
}

// Pins of the open file's game, read from and written to the same pins.json
// as v4. Like v4, there is no re-read before a write: only the main window's
// table editor touches pins.
export default function usePinnedTables(
    file: OpenFranchiseFile | undefined
): PinnedTables {
    const [allPins, setAllPins] = useState<PinsFile | null>(null);
    // Writes run one after another, so quick clicks are saved in order
    const writeQueue = useRef<Promise<void>>(Promise.resolve());

    const fileId = file?.fileId;
    const tables = file?.tables;
    const gameYear = file?.metadata.gameYear;
    const gameType = file?.metadata.type?.gameType || 'madden';

    const savePins = useCallback((pins: PinsFile) => {
        writeQueue.current = writeQueue.current
            .then(() => window.electronAPI.fs.writeJson(PINS_FILENAME, pins))
            .catch((error) => console.error('Failed to save pins', error));
    }, []);

    useEffect(() => {
        if (!fileId || !tables || gameYear === undefined) {
            return;
        }

        let cancelled = false;
        (async (): Promise<void> => {
            let read: PinsFile | null = null;
            try {
                read = (await window.electronAPI.fs.readJson(
                    PINS_FILENAME
                )) as PinsFile | null;
            } catch (error) {
                console.error('Failed to read pins', error);
            }
            if (cancelled) {
                return;
            }

            const prepared = preparePins(read, gameYear, gameType, tables);
            setAllPins(prepared.allPins);
            if (prepared.changed) {
                savePins(prepared.allPins);
            }
        })();

        return () => {
            cancelled = true;
        };
        // tables is replaced only when another file is opened
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fileId]);

    const key = useMemo(
        () => (gameYear === undefined ? undefined : { gameYear, gameType }),
        [gameYear, gameType]
    );

    const pinnedTables = useMemo(() => {
        const group = allPins && key ? findPinGroup(allPins, key) : undefined;
        return group && tables ? getPinnedTables(group.pins, tables) : [];
    }, [allPins, key, tables]);

    const pinnedIds = useMemo(
        () => new Set(pinnedTables.map((table) => table.id)),
        [pinnedTables]
    );

    const isPinned = useCallback(
        (table: Pick<TableListItem, 'id'>) => pinnedIds.has(table.id),
        [pinnedIds]
    );

    const update = useCallback(
        (next: PinsFile) => {
            setAllPins(next);
            savePins(next);
        },
        [savePins]
    );

    const togglePin = useCallback(
        (table: PinnableTable) => {
            if (!allPins || !key) {
                return;
            }
            update(
                pinnedIds.has(table.id)
                    ? removePin(allPins, key, table)
                    : addPin(allPins, key, table)
            );
        },
        [allPins, key, pinnedIds, update]
    );

    return { pinnedTables, isPinned, togglePin };
}
