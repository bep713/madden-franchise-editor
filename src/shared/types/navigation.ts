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
    availableVersions: number[];
    availableFormats: FileType[];
    menu: {
        enable?: string[];
        disable?: string[];
    };
}

export interface Navigation {
    items: NavigationItem[];
}
