import { createContext, Dispatch, SetStateAction } from 'react';
import { FranchiseModel } from '@shared/types';

export const FranchiseFileContext = createContext<
    [
        FranchiseModel | undefined,
        Dispatch<SetStateAction<FranchiseModel | undefined>> | undefined
    ]
>([undefined, undefined]);
