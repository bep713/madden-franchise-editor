import { useContext } from 'react';
import { Outlet } from 'react-router-dom';

import styles from './Layout.module.scss';

import AutoSavePaused from './AutoSavePaused';
import Navigation from '../../components/Navigation/Navigation';
import { BannerProvider } from '@renderer/banners/BannerContext';
import { ExternalChangeProvider } from '@renderer/context/ExternalChangeContext';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import useFileMenuCommands from '@renderer/hooks/useFileMenuCommands';
import useMenuState from '@renderer/hooks/useMenuState';
import {
    EditorTabsContext,
    useEditorTabsController
} from '@renderer/tabs/EditorTabsContext';
import { tabName } from '@renderer/tabs/editorTabs';
import useNotificationBanners from '@renderer/notifications/useNotificationBanners';
import useUpdateBanners from '@renderer/updates/useUpdateBanners';

interface NotificationBannersProps {
    selectTab: (key: string) => void;
}

// Inside BannerProvider, which useNotificationBanners needs
const NotificationBanners: React.FC<NotificationBannersProps> = ({
    selectTab
}: NotificationBannersProps) => {
    useNotificationBanners(selectTab);
    return null;
};

// Inside BannerProvider, which useUpdateBanners needs
const UpdateBanners: React.FC = () => {
    useUpdateBanners();
    return null;
};

const Layout: React.FC = () => {
    const [openFile] = useContext(FranchiseFileContext);
    useFileMenuCommands();
    useMenuState();
    const editorTabs = useEditorTabsController();

    return (
        <BannerProvider>
            <ExternalChangeProvider>
                <NotificationBanners selectTab={editorTabs.selectTab} />
                <UpdateBanners />
                <EditorTabsContext.Provider value={editorTabs}>
                    <div className={styles.appWrapper}>
                        <Navigation
                            activeKey={editorTabs.activeTab.key}
                            onClose={editorTabs.closeTab}
                            onNewTab={editorTabs.newTab}
                            onSelect={editorTabs.selectTab}
                            showNewTabButton={!!openFile}
                            tabs={editorTabs.tabs.map((tab) => ({
                                key: tab.key,
                                name: tabName(tab),
                                isClosable: tab.kind === 'table'
                            }))}
                        />
                        <AutoSavePaused />
                        <div className={styles.page}>
                            <Outlet />
                        </div>
                    </div>
                </EditorTabsContext.Provider>
            </ExternalChangeProvider>
        </BannerProvider>
    );
};

export default Layout;
