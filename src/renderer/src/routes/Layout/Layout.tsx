import { useContext } from 'react';
import { Outlet } from 'react-router-dom';

import styles from './Layout.module.scss';

import navigation from '@data/navigation';
import Navigation from '../../components/Navigation/Navigation';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import { SimpleNavigationItem } from '@shared/types';

const Layout: React.FC = () => {
    const [loadedFranchiseModel] = useContext(FranchiseFileContext);

    const baseNavigationItems = navigation.items.filter(
        (item) =>
            item.alwaysShow ||
            (loadedFranchiseModel &&
                item.availableVersions.includes(
                    loadedFranchiseModel?.gameYear || 0
                ) &&
                (loadedFranchiseModel.format
                    ? item.availableFormats.includes(
                          loadedFranchiseModel.format
                      )
                    : true))
    );

    const addTabButton: SimpleNavigationItem = {
        id: 'add-tab-button',
        text: '+',
        href: '/table-editor',
        containerClassList: [styles.addTabButton]
    };

    const tabs = loadedFranchiseModel
        ? [...baseNavigationItems, addTabButton]
        : [...baseNavigationItems];

    return (
        <div className={styles.appWrapper}>
            <Navigation items={tabs} />
            <Outlet />
        </div>
    );
};

export default Layout;
