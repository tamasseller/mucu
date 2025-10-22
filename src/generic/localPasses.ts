import { BasicBlock, BranchTermination, Operation } from "../cfg/basicBlock";
import { Value } from "../cfg/value";
import { ArithmeticOperation, CopyOperation, LiteralOperation } from "./operations";
import { Variable } from "../program/expression";
import { CfgRewriter, CodeBuilder } from "../cfg/cfgBuilder";
import { postOrderBlocks, runWorklistOperation } from "../cfg/traversal";
import { isDeepStrictEqual } from "util";
import {Arithmetic} from "./arithmetic"
import assert from "assert"
import {CoreReg} from "../specific/registers"

export function addTransitBindings(entry: BasicBlock) 
{
    const l = new Map<BasicBlock, { liveIn: Set<Variable>, liveOut: Set<Variable> }>()

    runWorklistOperation(postOrderBlocks(entry), bb => 
    {
        if(!l.has(bb)) l.set(bb, { liveIn: new Set<Variable>(), liveOut: new Set<Variable>() })
        const anal = l.get(bb)

        anal.liveOut = new Set<Variable>()
        
        for(const ss of bb.successors)
        {
            const ssLiveIn = l.get(ss)?.liveIn

            if(ssLiveIn !== undefined)
            {
                for(const live of ssLiveIn)
                {
                    anal.liveOut.add(live)
                }
            }
        }

        const result = anal.liveOut.difference(bb.defd).union(bb.used);
        if(isDeepStrictEqual(anal.liveIn, result)) return []

        anal.liveIn = result
        return bb.predecessors
    })

    return new CfgRewriter().rewrite(entry, bb => 
    {
        const cb = new CodeBuilder()
        
        cb.recreateImports(bb)
        cb.recreateOps(bb)

        const liveOut = l.get(bb).liveOut
        
        for (const v of liveOut) 
        {
            cb.exportVariableValue(v, bb.defd.get(v)?.value ?? cb.importVariableValue(v));
        }

        return cb
    })
}

export function propagateCopies(entry: BasicBlock): BasicBlock
{
    const rewriter = new CfgRewriter()

    return rewriter.rewrite(entry, bb => 
    {
        const substitutions = new Map<Value, Value>()
        const drop = new Set<Operation>

        for(const op of bb.ops)
        {
            if(op instanceof CopyOperation && op.source.isLastUse && !(op.destination.value instanceof CoreReg))
            {
                let src = op.source.value

                while(substitutions.has(src))
                {
                    src = substitutions.get(src)
                }

                substitutions.set(op.destination.value, src)
                drop.add(op)
            }
        } 

        if(bb.termination instanceof BranchTermination)
        {
            rewriter.recondition(bb, bb.termination.conditional.copy(substitutions))
        }

        return CodeBuilder.recreate(bb, 
            op => drop.has(op) ? [] : [op.copy(substitutions)], 
            v => substitutions.get(v) ?? v
        )
    })
}

function pressureScore(op: Operation)
{
    const scores = op.inputs.map(iop => iop.definition?.op === undefined ? 1 : pressureScore(iop.definition?.op))
    return Math.max(1, ...scores.map((s, i) => s + i))
}

export function retardDefinitions(entry: BasicBlock): BasicBlock
{
    return new CfgRewriter().rewrite(entry, bb => 
    {
        const ret = new CodeBuilder()
        ret.recreateImports(bb)

        const done = new Set<Operation>()
    
        const request = (op: Operation) => 
        {
            if(!done.has(op))
            {
                done.add(op)
                
                op.inputs.map(i => i.definition?.op).filter(i => i !== undefined)
                    .map<[number, Operation]>(d => [pressureScore(d), d])
                    .sort((a, b) => b[0] - a[0])
                    .forEach(d => request(d[1]));

                ret.add(op.copy());
            }
        }

        [
            ...Iterator.from(bb.ops).filter(x => x.hasSideEffect),
            ...Iterator.from(bb.outputs).map(x => x.definition?.op)
        ]
        .filter(x => x !== undefined)
        .forEach(request)

        ret.recreateExports(bb)

        return ret;
    })
}

const isPowerOfTwo = (n: number | undefined) => n > 0 && (n & (n - 1)) === 0

function log2floor(x: number): number
{
    let res = -1

    while(x > 0)
    {
        res++
        x = x >> 1
    }

    return res
}

export function optimizeDataProcessing(entry: BasicBlock): BasicBlock
{
    return new CfgRewriter().rewrite(entry, bb => 
    {
        const ret = new CodeBuilder()
        ret.recreateImports(bb)

        for(const op of bb.ops)
        {
            if(op instanceof ArithmeticOperation)
            {
                const res = op.result.value
                const cval = op.constValue()

                if(cval !== undefined)
                {
                    ret.add(new LiteralOperation(res, cval))
                }
                else
                {
                    const l = op.left.constValue()
                    const r = op.right.constValue()
                    switch(op.op)
                    {
                        case Arithmetic.Add:
                            ret.add(
                                l === 0 ? new CopyOperation(res, op.right.value)
                                : r === 0 ? new CopyOperation(res, op.left.value)
                                    : op.copy()
                            )
                            break
                        case Arithmetic.Sub:
                            ret.add(
                                r === 0 ? new CopyOperation(res, op.left.value)
                                    : op.copy()
                            )
                            break
                        case Arithmetic.Mul:
                            if(l === 0 || r === 0)
                            {
                                ret.add(new LiteralOperation(res, 0))
                            }
                            else if(l === 1)
                            {
                                ret.add(new CopyOperation(res, op.right.value))
                            }
                            else if(r === 1)
                            {
                                ret.add(new CopyOperation(res, op.left.value))
                            }
                            else if(isPowerOfTwo(l))
                            {
                                const imm = new Value()
                                ret.add(new LiteralOperation(imm, log2floor(l)))
                                ret.add(new ArithmeticOperation(res, op.right.value, imm, Arithmetic.Shl))
                            }
                            else if(isPowerOfTwo(r))
                            {
                                const imm = new Value()
                                ret.add(new LiteralOperation(imm, log2floor(r)))
                                ret.add(new ArithmeticOperation(res, op.left.value, imm, Arithmetic.Shl))
                            }
                            else
                            {
                                ret.add(op.copy())
                            }

                            break
                        case Arithmetic.Shl:
                        case Arithmetic.Shr:
                            ret.add(r === 0 ? new CopyOperation(res, op.left.value) : op.copy())
                            break
                        case Arithmetic.BitAnd:
                            ret.add(
                                l === 0 || r === 0 ? new LiteralOperation(res, 0)
                                : l === 0xffffffff ? new CopyOperation(res, op.right.value)
                                : r === 0xffffffff ? new CopyOperation(res, op.left.value)
                                    : op.copy()
                            )
                            break
                        case Arithmetic.BitOr:
                            ret.add(
                                l === 0xffffffff || r === 0xffffffff ? new LiteralOperation(res, 0xffffffff)
                                : l === 0 ? new CopyOperation(res, op.right.value)
                                : r === 0 ? new CopyOperation(res, op.left.value)
                                    : op.copy()
                            )
                            break
                        default:
                            assert(op.op === Arithmetic.BitXor)
                            ret.add(
                                l === 0 ? new CopyOperation(res, op.right.value)
                                : r === 0 ? new CopyOperation(res, op.left.value)
                                    : op.copy()
                            )
                            break
                    }
                }
            }
            else
            {
                ret.add(op.copy())
            }
        }

        ret.recreateExports(bb)
        return ret;
    })
}

export function removeUnused(entry: BasicBlock): BasicBlock
{
    while(true)
    {
        let changed = false

        entry = new CfgRewriter().rewrite(entry, bb => CodeBuilder.recreate(bb, op => 
        {
            if(!op.hasSideEffect && op.outputs.every(op => op.uses.length === 0))
            {
                changed = true;
                return []
            }

            return [op.copy()]
        }))

        if(!changed) break
    }

    return entry
}
