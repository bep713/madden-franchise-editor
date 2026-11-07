import { ReactNode, useCallback, useState } from 'react';
import CommonFileModal, { CommonFileChoice } from './CommonFileModal';
import { fieldDefault, TYPE_KEY, YEAR_KEY } from './commonFileOptions';
import { RememberedChoice, setRememberedChoice } from './commonFileChoices';

// franchiseAPI.openFile options
export interface CommonFileOverrides {
    gameYearOverride: number;
    gameTypeOverride: string;
}

interface PendingPrompt {
    path: string;
    initialYear: string;
    initialType: string;
    wasRemembered: boolean;
    reopen: boolean;
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

export interface PromptOptions {
    // Prefills the prompt instead of the general.ftc* defaults
    initial?: RememberedChoice | null;
    // The file's choice is remembered, so the box starts ticked
    remembered?: boolean;
    // The file is already open, so confirming re-opens it
    reopen?: boolean;
}

// Asks for a common file's game year and type. Resolves null if the user
// closes the prompt. Render `modal` somewhere in the calling component.
export default function useCommonFilePrompt(): {
    promptForOverrides: (
        path: string,
        options?: PromptOptions
    ) => Promise<CommonFileOverrides | null>;
    modal: ReactNode;
} {
    const [pending, setPending] = useState<PendingPrompt | null>(null);

    const promptForOverrides = useCallback(
        async (
            path: string,
            { initial, remembered = false, reopen = false }: PromptOptions = {}
        ) => {
            const [initialYear, initialType] = initial
                ? [String(initial.gameYear), initial.gameType]
                : await Promise.all([
                      readDefault(YEAR_KEY),
                      readDefault(TYPE_KEY)
                  ]);
            return new Promise<CommonFileOverrides | null>((resolve) =>
                setPending({
                    path,
                    initialYear,
                    initialType,
                    wasRemembered: remembered,
                    reopen,
                    resolve
                })
            );
        },
        []
    );

    const confirm = (choice: CommonFileChoice): void => {
        if (!pending) return;
        if (choice.remember) {
            setRememberedChoice(pending.path, {
                gameYear: choice.gameYear,
                gameType: choice.gameType
            });
        } else if (pending.wasRemembered) {
            setRememberedChoice(pending.path, null);
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
            initialRemember={pending.wasRemembered}
            initialType={pending.initialType}
            initialYear={pending.initialYear}
            onClose={close}
            onConfirm={confirm}
            reopenWarning={pending.reopen}
        />
    );

    return { promptForOverrides, modal };
}
