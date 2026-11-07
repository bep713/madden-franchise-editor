// The game year and type a user chose for a common file, by path, in
// userData/commonFileChoices.json. A remembered file opens without the prompt.
export const COMMON_FILE_CHOICES_FILENAME = 'commonFileChoices.json';

export interface RememberedChoice {
    gameYear: number;
    gameType: string;
}

type ChoicesFile = Record<string, RememberedChoice>;

// Writes run one after another, so a quick re-trigger can't drop an entry
let writeQueue: Promise<void> = Promise.resolve();

function isChoice(value: unknown): value is RememberedChoice {
    const choice = value as RememberedChoice | null;
    return (
        typeof choice === 'object' &&
        choice !== null &&
        Number.isFinite(choice.gameYear) &&
        typeof choice.gameType === 'string' &&
        choice.gameType !== ''
    );
}

// A missing or unreadable file counts as empty
async function readChoices(): Promise<ChoicesFile> {
    try {
        const read = await window.electronAPI.fs.readJson(
            COMMON_FILE_CHOICES_FILENAME
        );
        if (read && typeof read === 'object' && !Array.isArray(read)) {
            return read as ChoicesFile;
        }
    } catch (error) {
        console.error('Failed to read the common file choices', error);
    }
    return {};
}

export async function getRememberedChoice(
    path: string
): Promise<RememberedChoice | null> {
    // Wait for pending writes, so a reopen sees the latest choice
    await writeQueue;
    const choice = (await readChoices())[path];
    return isChoice(choice)
        ? { gameYear: choice.gameYear, gameType: choice.gameType }
        : null;
}

// null forgets the file
export function setRememberedChoice(
    path: string,
    choice: RememberedChoice | null
): Promise<void> {
    writeQueue = writeQueue
        .then(async () => {
            const choices = await readChoices();
            if (choice) {
                choices[path] = choice;
            } else if (path in choices) {
                delete choices[path];
            } else {
                return;
            }
            await window.electronAPI.fs.writeJson(
                COMMON_FILE_CHOICES_FILENAME,
                choices
            );
        })
        .catch((error) =>
            console.error('Failed to save the common file choices', error)
        );
    return writeQueue;
}
