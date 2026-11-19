import { FileType } from '@shared/types';

export interface SimpleNavigationItem {
    id: string;
    classList?: string[];
    containerClassList?: string[];
    href: string;
    isClosable?: boolean;
    text: string;
}

export interface NavigationItem extends SimpleNavigationItem {
    longText: string;
    image: string;
    clickListener: string;
    service: string;
    alwaysShow?: boolean;
    // Clicking a tab whose page React doesn't have yet does nothing
    implemented?: boolean;
    availableVersions: number[];
    availableFormats: FileType[];
    // metadata.type.gameType values ("madden", ...). Unset means every type.
    availableTypes?: string[];
    menu: {
        enable?: string[];
        disable?: string[];
    };
}

export interface Navigation {
    items: NavigationItem[];
}
