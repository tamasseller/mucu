import assert from "assert"
import { BasicBlock, BranchTermination, StraightTermination, Termination } from "../cfg/basicBlock"
import { reversePostOrderBlocks, runWorklistOperation, traverseEdges } from "../cfg/traversal"
import { CfgRewriter } from "../cfg/cfgBuilder"

export function eliminateDumbJumps(entry: BasicBlock): BasicBlock
{    
    const rewriter = new CfgRewriter()

    const bbs = reversePostOrderBlocks(entry)

    runWorklistOperation(bbs, bb => 
    {
        let ret = false;

        rewriter.terminationOf(bb)?.successors.forEach(target => 
        {
            //
            //
            //  TODO update mechanism:
            //      - always skip non-conditional empty blocks 
            //      - merge (non-empty) blocks if:
            //          - edge is anticritical (it is the only outgoing & incoming)
            //          - the only successor has eliminable conditional considering constants available, 
            //            when coming from the current bb, possibly with a limit on the amount 
            //            of possible code duplicaiton (e.g. successor is not longer)
            //
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
