import { useContext, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import navigation from '@data/navigation';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';

// App menu items the React UI can act on. Others stay disabled, even where a
// navigation item would enable them.
export const REACT_MENU_IDS = [
    'Save',
    'Export',
    'Import',
    'ExportRawTable',
    'ExportFRT',
    'ImportRawTable',
    'LogTable',
    'CopyUniqueId'
];

// Enables/disables app menu items per page, as v4's menuService does with
// navigation.json's menu.enable/disable.
export default function useMenuState(): void {
    const { pathname } = useLocation();
    const [openFile] = useContext(FranchiseFileContext);
    const fileId = openFile?.fileId;

    useEffect(() => {
        // A sub-page such as /schema-management/add has its parent's menu
        const item = navigation.items.find(
            (entry) =>
                entry.href === pathname || pathname.startsWith(`${entry.href}/`)
        );
        if (!item) {
            return;
        }

        const enable = fileId
            ? (item.menu?.enable ?? []).filter((id) =>
                  REACT_MENU_IDS.includes(id)
              )
            : [];
        const disable = [
            ...(item.menu?.disable ?? []),
            // Nothing to save without a file
            ...(fileId ? [] : (item.menu?.enable ?? []))
        ];

        if (enable.length) {
            window.electronAPI.send('menu:enable', enable);
        }
        if (disable.length) {
            window.electronAPI.send('menu:disable', disable);
        }
    }, [pathname, fileId]);
}
