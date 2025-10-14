import assert from "assert"
import { BasicBlock, Operation } from "../cfg/basicBlock"
import { traverseDfs } from "../cfg/traversal"
import { InputOperand, OutputOperand, Value } from "../cfg/value"
import { Variable } from "../program/expression"
import { CopyIsn } from "../specific/instructions"
import { CfgRewriter, CodeBuilder } from "../cfg/cfgBuilder"

function copies(from: ReadonlyMap<Variable, InputOperand>, to: ReadonlyMap<Variable, OutputOperand>): [Operation[], Map<Variable, [Value, Value]>]  
{
    const firsts: Operation[] = []
    const seconds: Operation[] = []
    const updated = new Map<Variable, [Value, Value]>()

    for(const [variable, dst] of to)
    {
        const aux = new Value()
        const src = from.get(variable)
        assert(src !== undefined)

        firsts.push(new CopyIsn(aux, src.value))
        seconds.push(new CopyIsn(dst.value, aux))
        updated.set(variable, [src.value, dst.value])
    }

    return [
        [...firsts, ...seconds],
        updated
    ]
}

export function bindPhis(entry: BasicBlock): BasicBlock
{
    const pullUp = new Set<BasicBlock>()
    const pullDown = new Set<BasicBlock>()

    for (const target of traverseDfs(entry)) 
    {
        for(const source of target.predecessors)
        {
            if(target.joins)
            {
                assert(!source.splits)
                pullUp.add(source)
            }
            else if(source.splits)
            {
                pullDown.add(target)
            }
            else if([...target.successors].length === 0)
            {
                // This is the exit edge
                pullUp.add(source)
            }
            else 
            {
                // This is the entry edge
                assert([...source.predecessors].length === 0)
                pullDown.add(target)
            }
        }
    }

    return new CfgRewriter().rewrite(entry, bb => 
    {
        let cb = new CodeBuilder()

        if(pullDown.has(bb))
        {
            const [split, ...rest] = bb.predecessors
            assert(rest.length == 0)

            const [movs, pairs] = copies(split.defd, bb.used)

            pairs.entries().forEach(([k, [src, _]]) => cb.setImport(k, src))
            movs.forEach(op => cb.add(op))
        }
        else
        {
            cb = new CodeBuilder()
            cb.recreateImports(bb)
        }

        Iterator.from(bb.ops).forEach(op => cb.add(op.copy()))

        if(pullUp.has(bb))
        {
            const [joined, ...rest] = bb.successors
            assert(rest.length == 0)

            const [movs, pairs] = copies(bb.defd, joined.used)

            movs.forEach(op => cb.add(op))
            pairs.entries().forEach(([k, [_, dst]]) => cb.exportVariableValue(k, dst))
        }
        else
        {
            cb.recreateExports(bb)
        }

        return cb
    })
}
