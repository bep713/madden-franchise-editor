import { ReactNode, useCallback, useState } from 'react';
import CommonFileModal, { CommonFileChoice } from './CommonFileModal';
import { fieldDefault, TYPE_KEY, YEAR_KEY } from './commonFileOptions';

// franchiseAPI.openFile options
export interface CommonFileOverrides {
    gameYearOverride: number;
    gameTypeOverride: string;
}

interface PendingPrompt {
    initialYear: string;
    initialType: string;
    resolve: (overrides: CommonFileOverrides | null) => void;
}

// general.<key>, or the schema default if it's unset or the read fails
async function readDefault(key: string): Promise<string> {
    try {
        const value = await window.electronAPI.preferences.getValue(
            `general.${key}`
        );
        if (value !== undefined && value !== null && value !== '') {
            return String(value);
        }
    } catch (error) {
        console.error(`Failed to read general.${key}`, error);
    }
    return fieldDefault(key);
}

// Asks for a common file's game year and type. Resolves null if the user
// closes the prompt. Render `modal` somewhere in the calling component.
export default function useCommonFilePrompt(): {
    promptForOverrides: () => Promise<CommonFileOverrides | null>;
    modal: ReactNode;
} {
    const [pending, setPending] = useState<PendingPrompt | null>(null);

    const promptForOverrides = useCallback(async () => {
        const [initialYear, initialType] = await Promise.all([
            readDefault(YEAR_KEY),
            readDefault(TYPE_KEY)
        ]);
        return new Promise<CommonFileOverrides | null>((resolve) =>
            setPending({ initialYear, initialType, resolve })
        );
    }, []);

    const confirm = (choice: CommonFileChoice): void => {
        if (!pending) return;
        if (choice.saveAsDefault) {
            // Stored as strings, like v4 and the settings window
            window.electronAPI.preferences
                .set({
                    general: {
                        [YEAR_KEY]: String(choice.gameYear),
                        [TYPE_KEY]: choice.gameType
                    }
                })
                .catch((error) =>
                    console.error('Failed to save the FTC defaults', error)
                );
        }
        setPending(null);
        pending.resolve({
            gameYearOverride: choice.gameYear,
            gameTypeOverride: choice.gameType
        });
    };

    const close = (): void => {
        if (!pending) return;
        setPending(null);
        pending.resolve(null);
    };

    const modal = pending && (
        <CommonFileModal
            initialType={pending.initialType}
            initialYear={pending.initialYear}
            onClose={close}
            onConfirm={confirm}
        />
    );

    return { promptForOverrides, modal };
}
