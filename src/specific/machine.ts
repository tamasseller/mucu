import assert from "assert";
import { CopyOperation, LiteralOperation, ArithmeticOperation, LoadOperation, StoreOperation, ArgumentOperation, RetvalOperation } from "../generic/operations";
import { OutputOperand, InputOperand } from "../cfg/value";
import { BasicBlock } from "../cfg/basicBlock";
import { ArgumentPseudoIsn, CopyIsn, LiteralIsn, RetvalPseudoIsn } from "./instructions";
import { mapLoadStoreOp } from "./loadStore";
import { mapArithmeticOp } from "./arithmetic";
import { CfgRewriter, CodeBuilder } from "../cfg/cfgBuilder";

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
        const ret = CodeBuilder.recreate(bb, op => 
        {
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
                return mapLoadStoreOp(op)
            }
        })
        return ret
    })
}
