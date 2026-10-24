import { GameVersion } from '@shared/types';
import { DisassembledInstructionsResult } from './frtk';

export enum FileType {
    FRANCHISE,
    OTHER_COMPRESSED,
    OTHER_UNCOMPRESSED
}

export enum FranchiseCapability {
    SCHEDULE_EDITOR,
    TABLE_EDITOR,
    SCHEMA_VIEWER,
    ABILITY_EDITOR
}

export enum TableType {
    ASTO = 'ASTO',
    SPBF = 'SPBF',
    SPEX = 'SPEX'
}

export interface FranchiseBaseTableModel {
    id: number;
    index: number;
    name: string;
    type: TableType;
    uniqueId: number;
}

export interface TableField {
    name: string;
    type: 'bool' | 'enum' | 'float' | 'int' | 'reference' | 'string' | 's_int';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
}

export interface Instruction {
    paramTypeId: number;
    param?: number;
    opCode: number;
    index: number;
}

export interface FranchiseTableModel extends FranchiseBaseTableModel {
    records: {
        disassembledResult?: DisassembledInstructionsResult;
        instructions?: Instruction[];
        fields?: {
            [key: string]: TableField;
        };
    }[];
}

export interface FranchiseTableDataResult {
    franchiseId: string;
    tables: FranchiseTableModel[];
}

export interface BaseFranchiseModel {
    directory: string;
    filePath: string;
    format: FileType;
    gameYear: number;
    game?: GameVersion;
    name: string;
    tables: FranchiseBaseTableModel[];
}

export interface FranchiseModel extends Partial<BaseFranchiseModel> {
    franchiseId: string;
}

export interface TableInput {
    tableId?: number;
    tableUniqueId?: number;
    tableName?: string;
    fields?: string[];
}

export interface ReadTableDataInput {
    franchiseId: string;
    tables: TableInput[];
}

export interface ExportTableDataInput {
    expressionOptions?: {
        outputType: 'decimal' | 'hex';
        recordIndex: number;
    };
    franchiseId: string;
    openWhenDone: boolean;
    outputFilePath: string;
    tableInput: TableInput;
}

export interface ExportTableDataResult {
    filePath?: string;
    status: boolean;
}
