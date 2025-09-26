import assert from "assert"
import { BasicBlock, BranchTermination, Operation } from "../cfg/basicBlock"
import { OpInfo } from "./machine"
import { AddSubRegImm8, AddSubRegRegImm3, AddSubRegRegReg, ArithRegReg, CmCondition, CmConditional, CompareNegRegReg, CompareRegImm8, CompareRegReg, nonSignedCompare, TestRegReg } from "./instructions"
import { Imm8 } from "./assembler"
import { flagsReg } from "./registers"
import { Arithmetic } from "../generic/arithmetic"
import { Relation, TacConditional } from "../generic/operations"
import { CfgRewriter, CodeBuilder } from "../cfg/cfgBuilder"

function findLastFlagSetter(ops: Iterable<Operation>, ignore?: Operation): Operation | undefined
{
    let ret: Operation | undefined = undefined

    for(const op of ops)
    {
        if(op !== ignore && op.outputs.map(oop => oop.value).includes(flagsReg))
        {
            ret = op
        }
    }

    return ret
}

function manifestCompare(bb: BasicBlock, l: OpInfo, r: OpInfo, notSignedCompare: boolean): [Map<Operation, Operation[]>, Operation[]]
{
    if(r.isConstant)
    {
        if(r.val === 0)
        {
            const rightDefRemovable = r.def.uses.length === 1   // TODO necessary?
            assert(r.def.uses.includes(r.iop))

            const lastFlagSetter = findLastFlagSetter(bb.ops, rightDefRemovable ? r.def.op : undefined)

            if(lastFlagSetter !== undefined && lastFlagSetter === l.def.op)
            {
                const subs = new Map<Operation, Operation[]>()

                if(rightDefRemovable)
                {
                    subs.set(r.def.op, []); // TODO necessary?
                }

                const op = l.def.op
                if(op instanceof AddSubRegImm8 && op.op === Arithmetic.Sub && op.leftResult.uses.length === 1)
                {
                    subs.set(lastFlagSetter, [new CompareRegImm8(op.leftResult.value, op.right)])
                }
                else if(op instanceof AddSubRegRegImm3 && op.op === Arithmetic.Sub && op.result.uses.length === 1)
                {
                    subs.set(lastFlagSetter, [new CompareRegImm8(op.left.value, op.right)])
                }
                else if(op instanceof AddSubRegRegReg && op.result.uses.length === 1)
                {
                    subs.set(lastFlagSetter, [
                        op.op === Arithmetic.Sub
                        ? new CompareRegReg(op.left.value, op.right.value)
                        : new CompareNegRegReg(op.left.value, op.right.value)
                    ])
                }
                else if(notSignedCompare && op instanceof ArithRegReg && op.op === Arithmetic.BitAnd && op.leftResult.uses.length === 1)
                {
                    subs.set(lastFlagSetter, [new TestRegReg(op.leftResult.value, op.right.value)])
                }

                return [subs, []]
            }
        }

        if(0 <= r.val && r.val < 256)
        {
            return [new Map(), [new CompareRegImm8(l.iop.value, r.val as Imm8)]]
            
        }
    }
    
    return [new Map(), [new CompareRegReg(l.iop.value, r.iop.value)]]
}

export function transformConditional(entry: BasicBlock): BasicBlock
{
    const rewriter = new CfgRewriter()

    return rewriter.rewrite(entry, bb => 
    {
        if(bb.termination instanceof BranchTermination)
        {           
            const cond = bb.termination.conditional
            assert(cond instanceof TacConditional)

            const loi = new OpInfo(cond.left)
            const roi = new OpInfo(cond.right)

            const [l, r, c] = ((loi.isConstant && !roi.isConstant) || loi.val === 0) 
                ? [roi, loi, cond.condition === Relation.Equal ? CmCondition.Zero : CmCondition.PositiveUnsigned]
                : [loi, roi, cond.condition === Relation.Equal ? CmCondition.Zero : CmCondition.NegativeUnsigned]

            const [subs, additional] = manifestCompare(bb, l, r, nonSignedCompare.includes(c))

            const ret = CodeBuilder.recreate(bb, op => subs.get(op) ?? [op.copy()])

            for(const op of additional)
            {
                ret.add(op)
            }

            rewriter.recondition(bb, new CmConditional(c))

            return ret
        }
        else
        {
            return CodeBuilder.recreate(bb)
        }
    })
}