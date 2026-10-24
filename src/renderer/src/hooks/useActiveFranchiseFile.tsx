import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { FranchiseModel } from '@shared/types';

export default function useActiveFranchiseFile(): [
    FranchiseModel | undefined,
    Dispatch<SetStateAction<FranchiseModel | undefined>>
] {
    const [loadedFranchiseModel, setLoadedFranchiseModel] = useState<
        FranchiseModel | undefined
    >();

    useEffect(() => {
        (async (): Promise<void> => {
            const files = await window.api.franchise.getActiveFranchiseFiles();
            if (files.length > 0) {
                setLoadedFranchiseModel(files[0]);
            }
        })();
    }, []);

    return [loadedFranchiseModel, setLoadedFranchiseModel];
}
