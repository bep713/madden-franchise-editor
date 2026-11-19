import { createContext, Dispatch, SetStateAction, useContext } from 'react';
import type {
    AppNotification,
    SchemaMissingData
} from '@shared/types/notifications';

// A file that could not be opened for lack of a schema, waiting for the user
// to pick one on the Schemas page. React state only: after a reload the
// drawer's link sets it again.
export interface PendingOpen {
    path: string;
    openOptions?: SchemaMissingData['openOptions'];
    // Read from the file, for the pending card's text
    game?: SchemaMissingData['game'];
    notificationId?: string;
}

export const PendingOpenContext = createContext<
    [
        PendingOpen | undefined,
        Dispatch<SetStateAction<PendingOpen | undefined>> | undefined
    ]
>([undefined, undefined]);

export function usePendingOpen(): [
    PendingOpen | undefined,
    Dispatch<SetStateAction<PendingOpen | undefined>> | undefined
] {
    return useContext(PendingOpenContext);
}

export function pendingFromNotification(
    n: Extract<AppNotification, { kind: 'schema-missing' }>
): PendingOpen {
    return {
        path: n.data.path,
        openOptions: n.data.openOptions,
        game: n.data.game,
        notificationId: n.id
    };
}
