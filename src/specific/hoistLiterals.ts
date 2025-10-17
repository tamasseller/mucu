import {BasicBlock, Operation} from "../cfg/basicBlock"
import {CfgRewriter, CodeBuilder} from "../cfg/cfgBuilder"
import {traverseDfs} from "../cfg/traversal"
import {Value} from "../cfg/value"
import {Arithmetic} from "../generic/arithmetic"
import {ArithmeticOperation, CopyOperation, LiteralOperation, LoadOperation, StoreOperation} from "../generic/operations"
import {asBytes} from "../program/common"
import {LiteralIsn} from "./instructions"

export function hoistLiterals(entry: BasicBlock): BasicBlock
{
    const globalLiterals: {num: number, synthMin: number}[] = []

    for(const bb of traverseDfs(entry))
    {
        for(const op of bb.ops)
        {
            if(op instanceof LiteralOperation)
            {
                const synthAllowance = Math.min(...op.result.uses.map(iop => 
                    {
                        const use = iop.op
                        return (use instanceof LoadOperation || use instanceof StoreOperation)
                            && use.address.value === op.result.value
                            ? asBytes(use.width) * 32
                            : 0
                    })
                )

                globalLiterals.push({
                    num: op.value,
                    synthMin: op.value - synthAllowance
                })
            }
        }
    }

    if(globalLiterals.length === 0) return entry;

    globalLiterals.sort((a, b) => a.num - b.num)
    const allowedLiterals: number[] = [globalLiterals[0].num]

    for(let i = 1; i < globalLiterals.length; i++)
    {
        const last = allowedLiterals[allowedLiterals.length - 1]

        if(last < globalLiterals[i].synthMin)
        {
            allowedLiterals.push(globalLiterals[i].num)
        }
    }

    return new CfgRewriter().rewrite(entry, bb => 
    {
        const localLiterals: {num: number, op: LiteralOperation}[] = []

        for(const op of bb.ops)
        {
            if(op instanceof LiteralOperation)
            {
                localLiterals.push({num: op.value, op})
            }
        }

        if(1 < localLiterals.length)
        {
            const subs = new Map<Operation, Operation[]>()

            localLiterals.sort((a, b) => a.num - b.num)
            for(let i = 1; i < localLiterals.length; i++)
            {
                const [prev, curr] = [localLiterals[i - 1], localLiterals[i]]
                const diff = curr.num - prev.num

                if(diff === 0) // reuse
                {
                    subs.set(curr.op, [new CopyOperation(curr.op.result.value, prev.op.result.value)])
                }
                else if(LiteralIsn.score(diff) < LiteralIsn.score(curr.num)) // synthetize
                {
                    const addend = new Value()
                    subs.set(curr.op, [
                        new LiteralOperation(addend, diff),
                        new ArithmeticOperation(curr.op.result.value, prev.op.result.value, addend, Arithmetic.Add)
                    ])
                }
                else
                {
                    let closest = allowedLiterals[0]
                    for(let i = 1; i < allowedLiterals.length; i++)
                    {
                        if(allowedLiterals[i] <= curr.num)
                        {
                            closest = allowedLiterals[i]
                        }
                        else
                        {
                            break;
                        }
                    }

                    if(closest !== curr.num)
                    {
                        const add = curr.num - closest
                        const result: Operation[] = []

                        let addend = localLiterals.slice(0, i).find(l => l.num === add)?.op.result.value
                        if(addend === undefined)
                        {
                            addend = new Value()
                            result.push(new LiteralOperation(addend, add))
                        }

                        let allowed = localLiterals.slice(0, i).find(l => l.num === closest)?.op.result.value
                        if(allowed === undefined)
                        {
                            allowed = new Value()
                            result.push(new LiteralOperation(allowed, closest))
                        }

                        result.push(new ArithmeticOperation(curr.op.result.value, allowed, addend, Arithmetic.Add))
                        subs.set(curr.op, result)
                    }
                }
            }

            if(subs.size)
            {
                const cb = new CodeBuilder()
                cb.recreateImports(bb)

                for(const l of localLiterals)
                {
                    const ops = subs.get(l.op) ?? [l.op.copy()]
                    for(const op of ops)
                    {
                        cb.add(op)
                    }
                }

                for(const op of bb.ops)
                {
                    if(op instanceof LiteralOperation) continue
                    cb.add(op.copy())
                }

                cb.recreateExports(bb)
                return cb
            }
        }

        return CodeBuilder.recreate(bb)
    })
}