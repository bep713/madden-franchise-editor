// pins.json in userData, shared with v4's pinnedTableService.js

export interface Pin {
    tableId: number;
    tableName: string;
    uniqueId?: number;
}

export interface PinGroup {
    gameYear: number;
    // Missing in files written before pins were split by game type
    gameType?: string;
    pins: Pin[];
}

export type PinsFile = PinGroup[];
