import assert from "assert"
import { BasicBlock, BranchTermination, ExitTermination, StraightTermination, Termination } from "../cfg/basicBlock"
import { reversePostOrderBlocks, runWorklistOperation, traverseEdges } from "../cfg/traversal"
import { CfgRewriter, CodeBuilder } from "../cfg/cfgBuilder"
import { evaluateCondition, TacConditional } from "./operations"
import { Value } from "../cfg/value"

export function foldConstantConditionals(entry: BasicBlock): BasicBlock
{
    while(true)
    {
        const substitutes = new Map<BasicBlock, CodeBuilder>()
        const rewriter = new CfgRewriter()
        
        for(const bb of reversePostOrderBlocks(entry))
        {
            const [next, ...rest] = [...bb.successors]
            if(next === undefined || 0 < rest.length) continue;

            const term = next.termination;
            if(term instanceof BranchTermination)
            {
                const inheritance = new Map<Value, number>()

                for(const [variable, importValue] of next.used.entries())
                {
                    const exportConst = bb.defd.get(variable)?.constValue()
                    if(exportConst !== undefined)
                    {
                        inheritance.set(importValue.value, exportConst)
                    }
                }

                const cond = term.conditional
                assert(cond instanceof TacConditional)
                const l = cond.left.constValue(inheritance)
                const r = cond.right.constValue(inheritance)
               
                if(l !== undefined && r !== undefined)
                {
                    const [cb] = CodeBuilder.merge([bb, next])
                    const newTerm = new StraightTermination(evaluateCondition(cond.condition, l, r) ? term.then : term.owise)
                    rewriter.reterminate(bb, newTerm)
                    substitutes.set(bb, cb)
                }
            }
        }

        if(!substitutes.size)
        {
            break;
        }

        entry = rewriter.rewrite(entry)
    }

    return entry
}

export function mergeIdenticalPredecessors(entry: BasicBlock): BasicBlock
{    
    while(true)
    {
        const groupIndex = new Map<BasicBlock, BasicBlock[]>()

        for(const bb of reversePostOrderBlocks(entry))
        {
            const pps = [...bb.predecessors]

            for(let i = 0; i < pps.length; i++)
            {
                const pp = pps[i]

                if([...pp.successors].length !== 1)
                {
                    continue
                }

                for(let j = i + 1; j < pps.length; j++)
                {
                    const qq = pps[j]

                    if([...qq.successors].length !== 1)
                    {
                        continue
                    }

                    const [pOps, qOps] = [[...pp.ops], [...qq.ops]]

                    if(pOps.length === qOps.length)
                    {
                        let ok = true;
                        for(let k = 0; k < pOps.length; k++)
                        {
                            if(!pOps[k].isIdentical(qOps[k]))
                            {
                                ok = false;
                                break;
                            }
                        }

                        if(ok)
                        {
                            const g = [...(groupIndex.get(pp) ?? [pp]), ...(groupIndex.get(qq) ?? [qq])]

                            for(const e of g)
                            {
                                groupIndex.set(e, g)
                            }
                        }
                    }
                }
            }
        }

        if(!groupIndex.size)
        {
            break;
        }

        const rewriter = new CfgRewriter()

        for(const bb of reversePostOrderBlocks(entry))
        {
            for(const ss of bb.successors)
            {
                const g = groupIndex.get(ss)
                if(g !== undefined)
                {
                    const [first] = g

                    if(first !== undefined && first !== ss)
                    {
                        rewriter.relink(bb, ss, first)
                    }
                }
            }
        }

        entry = rewriter.rewrite(entry)
    }

    return entry
}

export function mergeBlocks(entry: BasicBlock): BasicBlock
{    
    while(true)
    {
        const bbs = reversePostOrderBlocks(entry)
        const groupIndex = new Map<BasicBlock, BasicBlock[]>()

        /*
         * Find trivial edges
         */
        for(const from of bbs)
        {
            const [to, ...rest] = from.successors
            if(to !== undefined)
            {
                if(rest.length === 0 && [...to.predecessors].length === 1)
                {
                    const group = [...groupIndex.get(from) ?? [from], ...groupIndex.get(to) ?? [to]]

                    for(const bb of group)
                    {
                        groupIndex.set(bb, group)
                    }
                }
            }
        }

        if(groupIndex.size === 0) break

        const rewriter = new CfgRewriter()
        const bbSubs = new Map<BasicBlock, CodeBuilder>()

        for(const g of new Set(groupIndex.values()))
        {
            assert(2 <= g.length)
            const first = g[0]
            const term = g[g.length - 1].termination          
            const [merged, valueSubs] = CodeBuilder.merge(g)
            bbSubs.set(first, merged)

            if(term instanceof StraightTermination)
            {
                rewriter.reterminate(first, new StraightTermination(term.next))
            }
            else if(term instanceof BranchTermination)
            {
                rewriter.reterminate(first, new BranchTermination(term.then, term.owise, term.conditional.copy(valueSubs)))
            }
            else
            {
                assert(term instanceof ExitTermination)
                rewriter.reterminate(first, new ExitTermination)
            }
        }

        entry = rewriter.rewrite(entry, bb => bbSubs.get(bb) ?? CodeBuilder.recreate(bb))
    }

    return entry
} 

export function eliminateDumbJumps(entry: BasicBlock): BasicBlock
{    
    const rewriter = new CfgRewriter()
    const bbs = reversePostOrderBlocks(entry)

    runWorklistOperation(bbs, bb => 
    {
        let ret = false;
        rewriter.terminationOf(bb)?.successors.forEach(target => 
        {
            if(!target.hasOps && target.termination instanceof StraightTermination)
            {
                rewriter.relink(bb, target, target.termination.next)
                ret = true
            }
        })

        return ret ? [bb] : []
    })

    return rewriter.rewrite(entry)
}

export function breakCriticalEdges(entry: BasicBlock): BasicBlock
{
    const rewriter = new CfgRewriter()

    for(const e of traverseEdges(entry))
    {
        if(e.source.splits && e.target.joins)
        {
            const intermediate = new BasicBlock([], new Map(), new Map(), (bb) => ({
                predecessors: [e.source],
                termination: new StraightTermination(e.target)
            }))

            rewriter.relink(e.source, e.target, intermediate)
        }
    }

    return rewriter.rewrite(entry)
}

export function straightenConditionals(bbs: BasicBlock[]) 
{
    for(let i = 0; i < bbs.length - 1; i++)
    {
        const bb = bbs[i]

        if(bb.termination instanceof BranchTermination)
        {
            const owise = bb.termination.owise
            assert(owise !== undefined)

            const then = bb.termination.then
            assert(owise !== then)

            if(then === bbs[i + 1])
            {
                bb.twistConditional()
            }
        }
    }
}
