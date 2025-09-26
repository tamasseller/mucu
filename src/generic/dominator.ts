import assert from "assert"
import { BasicBlock } from "../cfg/basicBlock"
import { runWorklistOperation, traverseDfs, WalkOrder } from "../cfg/traversal"

export class DominatorTree
{
    readonly idoms = new Map<BasicBlock, BasicBlock>()

    constructor(entry: BasicBlock) 
    {
        const indices = new Map(traverseDfs(entry, WalkOrder.Pre).map((bb, idx) => [bb, idx]))
        const rpBbs = [...traverseDfs(entry, WalkOrder.Post)].toReversed()

        this.idoms.set(entry, entry)
        
        runWorklistOperation(rpBbs.toSpliced(rpBbs.indexOf(entry), 1), bb => 
        {
            const processedPredecessors = Iterator.from(bb.predecessors).filter(pp => this.idoms.get(pp) !== undefined)
            const [first, ...rest] = processedPredecessors
            assert(first !== undefined)

            const newIdom = rest.reduce((aa, bb) => 
            {
                while(aa !== bb)
                {
                    while(indices.get(aa) < indices.get(bb)) bb = this.idoms.get(bb)
                    while(indices.get(bb) < indices.get(aa)) aa = this.idoms.get(aa)
                }

                return aa
            }, first)

            if(this.idoms.get(bb) !== newIdom)
            {
                this.idoms.set(bb, newIdom)
                return bb.successors
            }

            return []
        })
    }

    dominates(maybeDom: BasicBlock, bb: BasicBlock)
    {
        while(true)
        {
            if(bb === maybeDom)
            {
                return true;
            }

            const idom = this.idoms.get(bb)
            assert(idom !== undefined)

            if(idom == bb)
            {
                return false
            }

            bb = idom
        }
    }
}
