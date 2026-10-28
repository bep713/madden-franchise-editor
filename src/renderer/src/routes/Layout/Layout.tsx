import { useContext } from 'react';
import { Outlet } from 'react-router-dom';

import styles from './Layout.module.scss';

import Navigation from '../../components/Navigation/Navigation';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import useFileMenuCommands from '@renderer/hooks/useFileMenuCommands';
import useMenuState from '@renderer/hooks/useMenuState';
import {
    EditorTabsContext,
    useEditorTabsController
} from '@renderer/tabs/EditorTabsContext';
import { tabName } from '@renderer/tabs/editorTabs';

const Layout: React.FC = () => {
    const [openFile] = useContext(FranchiseFileContext);
    useFileMenuCommands();
    useMenuState();
    const editorTabs = useEditorTabsController();

    return (
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
                <Outlet />
            </div>
        </EditorTabsContext.Provider>
    );
};

export default Layout;
