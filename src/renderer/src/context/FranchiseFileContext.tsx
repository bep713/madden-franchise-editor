import { createContext, Dispatch, SetStateAction } from 'react';
import { FileMetadata, GameVersion, TableListItem } from '@shared/types';

// The file the React UI has open. `path` is unknown after a renderer reload
// (main only tracks fileIds), same as v4.
export interface OpenFranchiseFile {
    fileId: string;
    path?: string;
    metadata: FileMetadata;
    tables: (TableListItem & { index: number })[];
    game?: GameVersion;
    // Bumped when the same fileId is reopened (e.g. a schema load), so state
    // keyed on the file is rebuilt. 0 for a fresh open.
    revision: number;
}

export const FranchiseFileContext = createContext<
    [
        OpenFranchiseFile | undefined,
        Dispatch<SetStateAction<OpenFranchiseFile | undefined>> | undefined
    ]
>([undefined, undefined]);
