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
}

export const FranchiseFileContext = createContext<
    [
        OpenFranchiseFile | undefined,
        Dispatch<SetStateAction<OpenFranchiseFile | undefined>> | undefined
    ]
>([undefined, undefined]);
