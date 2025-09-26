import assert from "assert";
import { Operation } from "./basicBlock";

let idx = 0
export class Value {
    idx: number;
    constructor() {
        this.idx = idx++
    }
}

export class Operand 
{
    constructor(
        readonly op: Operation | undefined, 
        public value: Value,
        readonly additionalInterference?: Value[]
    ) {}
}

export interface DefiningOperand extends Operand
{
    get uses(): InputOperand[]
    get isSingleUse(): boolean
}

export class OutputOperand extends Operand implements DefiningOperand {
    readonly uses: InputOperand[] = []

    get isSingleUse(): boolean {
        return 1 == this.uses.length
    }
}

export class InputOperand extends Operand 
{
    public definition: DefiningOperand

    get nextUse(): InputOperand | undefined
    {
        const def = this.definition
        const idx = def.uses.findIndex(x => x === this)
        assert(0 <= idx)
    
        if(idx < def.uses.length - 1)
        {
            return def.uses[idx + 1]
        }
    }
    
    get isLastUse(): boolean {
        return this.nextUse === undefined
    }

    constValue(input?: Map<Value, number>): number | undefined  { 
        return this.definition?.op?.constValue(input) ?? input?.get(this.value)
    } 
}

export class InOutOperand extends InputOperand implements DefiningOperand 
{
    readonly uses: InputOperand[] = []

    get isSingleUse(): boolean {
        return 1 == this.uses.length
    }
}
