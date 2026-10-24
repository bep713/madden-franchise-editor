import { RecentFile } from '@shared/types/files';
import Store, { Schema } from 'electron-store';

interface GeneralStore {
    recentFiles: RecentFile[];
}

const schema: Schema<GeneralStore> = {
    recentFiles: {
        type: 'array',
        items: {
            type: 'object',
            properties: {
                path: { type: 'string' },
                time: { type: 'number' }
            }
        }
    }
};

const store = new Store({
    name: 'mfe-general',
    schema
});

console.log(`Store Location: ${store.path}`);

export default store;
