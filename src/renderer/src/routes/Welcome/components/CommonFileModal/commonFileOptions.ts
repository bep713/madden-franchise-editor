import preferencesSchema from '@data/preferencesSchema.json';

export interface PreferenceOption {
    label: string;
    value: string;
}

interface PreferenceField {
    key: string;
    defaultValue?: unknown;
    options?: PreferenceOption[];
}

export const YEAR_KEY = 'ftcGameYearOverride';
export const TYPE_KEY = 'ftcGameTypeOverride';

// A field of the settings form, by key. The settings window and v4's FTC
// prompt read the same fields, so the lists stay in sync.
export function findPreferenceField(key: string): PreferenceField | undefined {
    return preferencesSchema.sections
        .flatMap((section) => section.fields as PreferenceField[])
        .find((field) => field.key === key);
}

export function fieldOptions(key: string): PreferenceOption[] {
    return findPreferenceField(key)?.options ?? [];
}

export function fieldDefault(key: string): string {
    return String(findPreferenceField(key)?.defaultValue ?? '');
}
