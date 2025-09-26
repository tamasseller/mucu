import { BasicBlock } from "./basicBlock";

export const enum WalkOrder
{
    Pre, Post
}

export function* traverseDfs(bb: BasicBlock, order: WalkOrder = WalkOrder.Post, visited = new Set<BasicBlock>()): Generator<BasicBlock, void, unknown>
{
    if(!visited.has(bb))
    {
        visited.add(bb)

        if(order === WalkOrder.Pre)
        {
            yield bb
        }

        for(const s of bb.successors)
        {
            yield* traverseDfs(s, order, visited);
        }

        if(order === WalkOrder.Post)
        {
            yield bb
        }
    }
}

export const postOrderBlocks = (entry: BasicBlock): BasicBlock[] => [...traverseDfs(entry, WalkOrder.Post)]
export const reversePostOrderBlocks = (entry: BasicBlock): BasicBlock[] => postOrderBlocks(entry).toReversed()

export function runWorklistOperation(bbs: BasicBlock[], op: (bb: BasicBlock) => Iterable<BasicBlock>)
{
    const worklist = new Set<BasicBlock>(bbs)

    while(true)
    {
        const bb: BasicBlock = worklist.values().next().value        
        if(bb === undefined)
        {
            break;
        }

        worklist.delete(bb)

        for(const n of op(bb))
        {
            worklist.add(n)
        }
    }
}

export interface Edge
{
    source: BasicBlock
    target: BasicBlock
}

export function* traverseEdges(entry: BasicBlock): Generator<Edge, void, unknown>
{
    for(const bb of traverseDfs(entry)) 
    {
        for(const ss of bb.successors ?? [])
        {
            yield { source: bb, target: ss }
        }
    }
}
