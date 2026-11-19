// Local copies of the frtk types the renderer uses. frtk is not published yet;
// replace these with imports from 'frtk' once it is a real dependency.

export interface FrtkInstruction {
    paramTypeId: number;
    param?: number;
    opCode: number;
    index: number;
}

export interface ParsedExpressionInstruction {
    displayText: string;
    readonly opCode: number;
    readonly instruction: FrtkInstruction;
    readonly index: number;
}

export interface DisassembledInstructionResult {
    index: number;
    parsedInstruction: ParsedExpressionInstruction;
    output: string;
}

export interface DisassembledInstructionsResult {
    output: string[];
    disassembledInstructions: DisassembledInstructionResult[];
}
