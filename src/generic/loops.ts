import assert from "assert";
import { BasicBlock, BranchTermination } from "../cfg/basicBlock";
import { traverseEdges } from "../cfg/traversal";
import { CfgRewriter, CodeBuilder } from "../cfg/cfgBuilder";
import { DominatorTree } from "./dominator";

function gatherPredecessors(from: BasicBlock, to: BasicBlock, ret = new Set<BasicBlock>()): Set<BasicBlock> 
{
    if(!ret.has(from))
    {
        ret.add(from)
    
        if(from != to)
        {
            for(const pp of from.predecessors)
            {
                gatherPredecessors(pp, to, ret)
            }
        }
    }

    return ret;
}

function eliminateOverlapping(loopSets: Set<BasicBlock>[]): void 
{
    for (let i = 0; i < loopSets.length; i++) 
    {
        for (let j = i + 1; j < loopSets.length;) 
        {
            const [a, b] = [loopSets[i], loopSets[j]];

            if (!a.isDisjointFrom(b) && !a.isSubsetOf(b) && !a.isSupersetOf(b)) 
            {
                loopSets[i] = a.union(b);
                loopSets.splice(j, 1);
            }
            else 
            {
                j++;
            }
        }
    }
}

function findSupersets(loopSets: Set<BasicBlock>[]): Map<Set<BasicBlock>, Set<BasicBlock>[]> 
{
    const supersets = new Map<Set<BasicBlock>, Set<BasicBlock>[]>();

    const addSuperset = (sup, sub) => 
    {
        if (!supersets.has(sub)) 
        {
            supersets.set(sub, [sup]);
        }
        else 
        {
            supersets.get(sub).push(sup);
        }
    };

    for (let i = 0; i < loopSets.length; i++) 
    {
        for (let j = i + 1; j < loopSets.length; j++) 
        {
            const [a, b] = [loopSets[i], loopSets[j]];

            if (a.isSupersetOf(b)) 
            {
                addSuperset(a, b);
            }
            else if (b.isSupersetOf(a)) 
            {
                addSuperset(b, a);
            }
            else 
            {
                assert(a.isDisjointFrom(b));
            }
        }
    }

    return supersets;
}

class LoopEntry
{
    readonly inners: LoopEntry[] = []
    public outer?: LoopEntry

    constructor(
        readonly blocks: Set<BasicBlock>
    ){}

    get depth(): number {
        return (this.outer?.depth ?? 0) + 1
    }
}

export class LoopInfo
{
    constructor(
        readonly roots: LoopEntry[],
        readonly dtree: DominatorTree
    ){}

    find(bb: BasicBlock): LoopEntry | undefined
    {
        let ret: LoopEntry | undefined  = undefined
        let list = this.roots

        while(true)
        {
            const li = list.find(x => x.blocks.has(bb))
            if(li === undefined)
            {
                break;
            }

            list = li.inners
            ret = li
        }

        return ret
    }
}

export function findLoops(entry: BasicBlock): LoopInfo
{
    // const bbs = new Set<BasicBlock>()

    // for(const bb of traverseDfs(entry))
    // {
    //     assert(0 < bb.incoming.length || bb === entry)
    //     bbs.add(bb)
    // }

    // for(const e of traverseEdges(entry))
    // {
    //     assert(bbs.has(e.source));
    //     assert(bbs.has(e.target));
    //     assert(e.source.outgoing.includes(e))
    //     assert(e.target.incoming.includes(e))
    // }

    const dtree = new DominatorTree(entry)
    const backEdges = [...traverseEdges(entry).filter(e => dtree.dominates(e.target, e.source))]
    const loopSets = [...backEdges.map(e => gatherPredecessors(e.source, e.target))]

    eliminateOverlapping(loopSets);
    const supersets = findSupersets(loopSets);

    const les = new Map(loopSets.map(x => [x, new LoopEntry(x)]))
    const roots: LoopEntry[] = []

    for(const loop of loopSets)
    {
        const le = les.get(loop)
        assert(le !== undefined)

        const outers = supersets.get(loop)
        if(outers !== undefined)
        {
            const parent = outers.values().reduce((a, b) => (a.size < b.size) ? a : b)
            const pLe = les.get(parent)
            assert(pLe)

            pLe.inners.push(le)
            le.outer = pLe
        }
        else
        {
            roots.push(le)
        }
    }

    return new LoopInfo(roots, dtree)
}

export function straightenLoops(entry: BasicBlock): BasicBlock
{
    const loopInfo = findLoops(entry)

    const rewriter = new CfgRewriter()
    return rewriter.rewrite(entry, bb => 
    {
        if(bb.termination instanceof BranchTermination)
        {
            const thenBe = loopInfo.dtree.dominates(bb.termination.then, bb)
            const owiseBe = loopInfo.dtree.dominates(bb.termination.owise, bb)

            if(owiseBe || thenBe)
            {
                if(owiseBe && !thenBe)
                {
                    rewriter.reterminate(bb, bb.termination.twisted)
                }
            }
            else 
            {
                const loop = loopInfo.find(bb)
                if(loop !== undefined)
                {
                    if(!loop.blocks.has(bb.termination.owise) && loop.blocks.has(bb.termination.then))
                    {
                        rewriter.reterminate(bb, bb.termination.twisted)
                    }
                }
            }
        }

        return CodeBuilder.recreate(bb)
    })
}
