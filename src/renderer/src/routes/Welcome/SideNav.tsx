import React from 'react';
import SideNavBase from '@renderer/components/SideNav/SideNav';
import styles from './SideNav.module.css';

import Document from '@assets/icons/document.svg?react';
import File from '@assets/icons/file.svg?react';
import Folder from '@assets/icons/folder.svg?react';
import Settings from '@assets/icons/settings.svg?react';
import SwitchOrientation from '@assets/icons/switchOrientation.svg?react';

const sidenav = [
    {
        id: 'openFile',
        icon: <File />,
        text: 'Open a file...',
        'data-action': 'open-file'
    },
    {
        id: 'schemaManagement',
        icon: <Folder />,
        text: 'Schema Management'
    },
    {
        id: 'releaseNotes',
        icon: <Document />,
        text: 'Release Notes',
        'data-action': 'release-notes'
    },
    {
        id: 'settings',
        icon: <Settings />,
        text: 'Settings',
        'data-action': 'settings'
    },
    {
        id: 'switchUi',
        icon: <SwitchOrientation />,
        text: 'Switch to legacy UI',
        'data-action': 'switch-ui'
    }
];

interface Props {
    onOpenFileClick?: () => void;
    onSchemaManagementClick?: () => void;
    onReleaseNotesClick?: () => void;
    onSettingsClick?: () => void;
    onSwitchUiClick?: () => void;
}

const SideNav: React.FC<Props> = ({
    onOpenFileClick,
    onSchemaManagementClick,
    onReleaseNotesClick,
    onSettingsClick,
    onSwitchUiClick
}: Props) => {
    const onClick: Record<string, (() => void) | undefined> = {
        openFile: onOpenFileClick,
        schemaManagement: onSchemaManagementClick,
        releaseNotes: onReleaseNotesClick,
        settings: onSettingsClick,
        switchUi: onSwitchUiClick
    };
    return (
        <aside className={styles.sideNav}>
            <SideNavBase
                items={sidenav.map(({ id, icon, text, ...rest }) => ({
                    leftAsset: icon,
                    text,
                    ...rest,
                    ...(onClick[id] && {
                        onClick: onClick[id],
                        role: 'button'
                    })
                }))}
            />
        </aside>
    );
};

export default SideNav;
