import assert from "assert";
import { CopyOperation, LiteralOperation, ArithmeticOperation, LoadOperation, StoreOperation, ArgumentOperation, RetvalOperation } from "../generic/operations";
import { OutputOperand, InputOperand, Value, InOutOperand } from "../cfg/value";
import { BasicBlock, Operation } from "../cfg/basicBlock";
import { ArgumentPseudoIsn, CopyIsn, LiteralIsn, LoadWordRegIncrement, RetvalPseudoIsn, StoreWordRegIncrement } from "./instructions";
import { mapLoadStoreOp } from "./loadStore";
import { mapArithmeticOp } from "./arithmetic";
import { CfgBuilder, CfgRewriter, CodeBuilder } from "../cfg/cfgBuilder";
import { subscribe } from "diagnostics_channel";
import { CoreReg } from "./registers";

export class OpInfo
{
    readonly def: OutputOperand;
    readonly val?: number;

    constructor(readonly iop: InputOperand) 
    {
        this.def = this.iop.definition
        this.val = this.def.op?.constValue()
    }

    get isConstant(): boolean 
    {
        return this.val !== undefined
    }
}

export function selectInstructions(entry: BasicBlock): BasicBlock
{
    // TODO look for opportunities for employing the bics instruction (rx &= ~ry), i.e. a = b & c, where:
    //  - if there are other uses of c then all are 'a = b & c' operations and
    //  - c is either:
    //    - defined by an bitwise invert operation, in which case delete the inversion and use its 
    //      argument in the bics
    //    - a constant that is weakend by inversion, in which case replace the constant with its
    //      bitwise inverse and use that in the bics

    return new CfgRewriter().rewrite(entry, bb => 
    {
        const ignored = new Set<Operation>()

        const ret = CodeBuilder.recreate(bb, op => 
        {
            if(ignored.has(op))
            {
                return []
            }
            if(op instanceof ArgumentOperation)
            {
                return [new ArgumentPseudoIsn(op.idx, op.value.value)]
            }
            else if(op instanceof RetvalOperation)
            {
                return [new RetvalPseudoIsn(op.idx, op.value.value)]
            }
            else if(op instanceof LiteralOperation)
            {
                return [new LiteralIsn(op.result.value, op.value)]
            }
            else if(op instanceof CopyOperation)
            {
                return [new CopyIsn(op.destination.value, op.source.value)]
            }
            else if(op instanceof ArithmeticOperation)
            {
                return mapArithmeticOp(op)
            }
            else
            {
                assert(op instanceof LoadOperation || op instanceof StoreOperation)
                return mapLoadStoreOp(op, ignored)
            }
        })
        return ret
    })
}

type MiaIsn = LoadWordRegIncrement | StoreWordRegIncrement

export function mergeMia(entry: BasicBlock): BasicBlock
{
    return new CfgRewriter().rewrite(entry, bb => 
    {
        const substitutes = new Map<Operation, MiaIsn[]>()

        let current: MiaIsn | undefined = undefined
        for(const op of bb.ops)
        {
            if(op instanceof LoadWordRegIncrement || op instanceof StoreWordRegIncrement)
            {
                if(((current instanceof LoadWordRegIncrement && op instanceof LoadWordRegIncrement)
                        || (current instanceof StoreWordRegIncrement && op instanceof StoreWordRegIncrement))
                        && op.address.value === current.address.value)
                {
                    assert(op.values.length === 1)
                    const [val] = op.values   
                    assert(val.value instanceof CoreReg)

                    const [joined] = substitutes.get(current)
                    const max = Math.max(...joined.values.map((x: OutputOperand | InputOperand) => {
                        assert(x.value instanceof CoreReg)
                        return x.value.idx
                    }))

                    if(max < val.value.idx)
                    {
                        joined.add(val.value)
                        substitutes.set(op, [])
                        continue
                    }
                }

                current = op
                substitutes.set(op, [op.copy()])
            }
            else
            {
                current = undefined
            }
        }

        return CodeBuilder.recreate(bb, op => substitutes.get(op) ?? [op.copy()])
    })
}

