import { BasicBlock } from "../cfg/basicBlock"
import { lowRegs } from "../specific/registers"
import { AllocationNode, color } from "./coloring"
import { bindPhis } from "./ssa"
import { CopyOperation } from "./operations"
import { constructInterferenceGraph } from "./interference"
import { CfgRewriter, CodeBuilder } from "../cfg/cfgBuilder"
import assert from "node:assert"
import { Value } from "../cfg/value"
import { ProcedurePrinter } from "../printer"

const dumpColoring = true

function dotDump(clone: Iterable<AllocationNode>, colors: Map<Value, Value>)
{
    console.log("graph G {")
    console.log("\tnode [colorscheme=set28]")

    for(const n of clone)
    {
        const [v] = n.values
        const assigned = colors.get(v)?.idx
        const c = assigned !== undefined ? `fillcolor=${assigned + 1}` : `fillcolor=black fontcolor=${v.idx+1}`
        console.log(`\t${v.idx}[label="${[...n.values.values().map(v => v?.idx)].join(", ")}" ${c} style=filled]`)
    }

    for(const n of clone)
    {
        const [v] = n.values

        for(const i of n.interferers)
        {
            const [u] = i.values
            console.log(`${v.idx} -- ${u.idx}`)
        }

        for(const m of n.movePartners)
        {
            const [u] = m.values
            console.log(`${v.idx} -- ${u.idx}[style=dashed color=grey]`)
        }
    }

    console.log("}")
}

function cloneIg(interference: Iterable<AllocationNode>): Iterable<AllocationNode>
{
    const clone = new Map(Iterator.from(interference).map(n => {
        assert(n.values.size === 1)
        const [v] = n.values.values()
        return [n, new AllocationNode(v, n.priority)]
    }))

    clone.entries().forEach(([old, c]) => {
        c.interferers = new Set(old.interferers.values().map(x => clone.get(x)))
        c.movePartners = new Set(old.movePartners.values().map(x => clone.get(x)))
    })

    return clone.values()
}

export function allocateRegisters(entry: BasicBlock): BasicBlock
{
    while(true)
    {
        /*
        * At this stage variable values are represented as disjoint values local
        * to each bb (apart from precolored ones). Now pessimistic moves are added
        * to bind definitions (at the end of) a bb to uses in its successor.
        *
        * Each input value is copied into an intermediate one first, and then that
        * is copied again into the actual destination. The register allocator can 
        * easily coalesce the vast majority of these excessive moves, but they are 
        * needed in order to allow register shuffling when necessary. 
        * 
        * The simplest example of when this is needed when both a block and its 
        * successor has two variables pinned to the same precolored values but in 
        * different order (e.g. arguments that are passed to a call in swapped 
        * order). In this case an intermediate value must be introduced to
        * facilitate the swap. 
        * 
        * Possible intermediates are introduced via the additional moves which can 
        * not be eliminated by coalescing only when they are needed as auxiliary 
        * storage for shuffling interfering values between registers, and even then 
        * most of the moves are eliminated because only a single additional register 
        * is required for this scheme to work.
        * 
        * This is related to the handling of the lost-swap problem.
        * https://www.cs.princeton.edu/courses/archive/spring16/cos320/lectures/15-SSA.pdf
        */
        const bound = bindPhis(entry)

        ProcedurePrinter.print(bound)

        const interference = constructInterferenceGraph(lowRegs, bound)
        
        const clone = dumpColoring ? cloneIg(interference) : undefined

        const colors = color(lowRegs, interference)

        if(dumpColoring) dotDump(clone, colors)

        // if(colors instanceof Success)
        {
            const rewriter = new CfgRewriter()
            return rewriter.rewrite(bound, bb => CodeBuilder.recreate(bb, 
                op => {
                    if(op instanceof CopyOperation)
                    {
                        const cSrc = colors.get(op.source.value)
                        const cDst = colors.get(op.destination.value)
                        if(cSrc == cDst)
                        {
                            return[]
                        }
                    }

                    return [op.copy(colors)]
                },
                v => colors.get(v) ?? v,
                v => colors.get(v) ?? v,
            ))
        }
        // else
        {
            // assert(colors instanceof Failure)
            // find candidates
            // check remat
            // calculate spill cost
            // spill something
        }
    }
}
