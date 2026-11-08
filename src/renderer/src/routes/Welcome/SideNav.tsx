import React from 'react';
import SideNavBase from '@renderer/components/SideNav/SideNav';
import styles from './SideNav.module.css';

import Document from '@assets/icons/document.svg?react';
import File from '@assets/icons/file.svg?react';
import Folder from '@assets/icons/folder.svg?react';
import Settings from '@assets/icons/settings.svg?react';

const sidenav = [
    {
        id: 'openFile',
        icon: <File />,
        text: 'Open a file...'
    },
    {
        id: 'schemaManagement',
        icon: <Folder />,
        text: 'Schema Management'
    },
    {
        id: 'releaseNotes',
        icon: <Document />,
        text: 'Release Notes'
    },
    {
        id: 'settings',
        icon: <Settings />,
        text: 'Settings'
    }
];

interface Props {
    onSchemaManagementClick?: () => void;
}

const SideNav: React.FC<Props> = ({ onSchemaManagementClick }: Props) => {
    // Only Schema Management has a page so far
    const onClick: Record<string, (() => void) | undefined> = {
        schemaManagement: onSchemaManagementClick
    };
    return (
        <aside className={styles.sideNav}>
            <SideNavBase
                items={sidenav.map((item) => ({
                    leftAsset: item.icon,
                    text: item.text,
                    ...(onClick[item.id] && {
                        onClick: onClick[item.id],
                        role: 'button'
                    })
                }))}
            />
        </aside>
    );
};

export default SideNav;
