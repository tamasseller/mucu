import assert from "assert";
import { CopyOperation, LiteralOperation, ArithmeticOperation, LoadOperation, StoreOperation, ArgumentOperation, RetvalOperation, InvocationOperation } from "../generic/operations";
import { OutputOperand, InputOperand } from "../cfg/value";
import { BasicBlock, Operation } from "../cfg/basicBlock";
import { ClobberIsn, CopyIsn, LiteralIsn, LoadWordRegIncrement, ProcedureCallIsn, StoreWordRegIncrement } from "./instructions";
import { mapLoadStoreOp } from "./loadStore";
import { mapArithmeticOp } from "./arithmetic";
import { CfgRewriter, CodeBuilder } from "../cfg/cfgBuilder";
import { args, CoreReg, retVals } from "./registers";
import {Variable} from "../program/expression"

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

        const cb = new CodeBuilder()

        cb.recreateImports(bb)
        for(const op of bb.ops) 
        {
            if(ignored.has(op)) continue

            if(op instanceof ArgumentOperation)
            {
                assert(op.idx < args.length)

                assert([...bb.predecessors].length === 0)
                cb.setImport(new Variable(), args[op.idx])
                
                cb.add(new CopyIsn(op.value.value, args[op.idx]))
            }
            else if(op instanceof RetvalOperation)
            {
                assert(op.idx < retVals.length)

                assert([...bb.successors].length === 0)

                cb.add(new CopyIsn(retVals[op.idx], op.value.value))
                cb.exportVariableValue(new Variable(), retVals[op.idx])
            }
            else if(op instanceof InvocationOperation)
            {
                for(let idx = 0; idx < op.args.length; idx++)
                {
                    cb.add(new CopyIsn(args[idx], op.args[idx].value))
                }

                for(let idx = op.args.length; idx < args.length; idx++)
                {
                    cb.add(new ClobberIsn(args[idx]))
                }

                cb.add(new ProcedureCallIsn(op.callee))

                for(let idx = 0; idx < op.retvals.length; idx++)
                {
                    cb.add(new CopyIsn(op.retvals[idx].value, retVals[idx]))                    
                }
            }
            else if(op instanceof LiteralOperation)
            {
                cb.add(new LiteralIsn(op.result.value, op.value))
            }
            else if(op instanceof CopyOperation)
            {
                cb.add(new CopyIsn(op.destination.value, op.source.value))
            }
            else if(op instanceof ArithmeticOperation)
            {
                mapArithmeticOp(op).forEach(x => cb.add(x))
            }
            else
            {
                assert(op instanceof LoadOperation || op instanceof StoreOperation)
                mapLoadStoreOp(op, ignored).forEach(x => cb.add(x))
            }
        }

        cb.recreateExports(bb)

        return cb
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

