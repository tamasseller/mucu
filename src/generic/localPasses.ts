import { BasicBlock, BranchTermination, Operation } from "../cfg/basicBlock";
import { Value } from "../cfg/value";
import { CopyOperation } from "./operations";
import { Variable } from "../program/expression";
import { CfgRewriter, CodeBuilder } from "../cfg/cfgBuilder";
import { postOrderBlocks, runWorklistOperation } from "../cfg/traversal";
import { isDeepStrictEqual } from "util";

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
            if(op instanceof CopyOperation && op.source.isLastUse)
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
