import { BasicBlock } from "../cfg/basicBlock"
import { traverseDfs } from "../cfg/traversal"
import { InputOperand, Operand, OutputOperand, Value } from "../cfg/value"
import { AllocationNode } from "./coloring"
import { findLoops } from "./loops"
import { CopyOperation } from "./operations"

export function constructInterferenceGraph(precolored: Value[], entry: BasicBlock): Iterable<AllocationNode>
{
    const nodes = new Map<Value, AllocationNode>(precolored.map(v => [v, (new AllocationNode(v, 0))]))
    const precoloredNodes = new Set(nodes.values())
    precoloredNodes.forEach(n => n.interferers = precoloredNodes.difference(new Set([n])))

    const loopInfo = findLoops(entry)

    const addSymmetricInterference = (v: Value, u: Value) => 
    {
        const [n, m] = [nodes.get(u), nodes.get(v)]
        n.interferers.add(m)
        m.interferers.add(n)
    }

    const ensureNode = (v: Value, prio: number) => 
    {
        if(!nodes.has(v)) 
        {
            nodes.set(v, new AllocationNode(v, prio))
        }
        else
        {
            const existing = nodes.get(v)
            existing.priority = Math.max(existing.priority, prio)
        }
    }

    const handleOp = (op: Operand, prio: number) =>
    {
        ensureNode(op.value, prio)

        if(op.additionalInterference)
        {
            for(const a of op.additionalInterference)
            {
                ensureNode(a, 0)
                addSymmetricInterference(op.value, a)
            }
        }
    }

    for (const bb of traverseDfs(entry)) 
    {
        const prio = loopInfo.find(bb)?.depth ?? 0
        const live = new Set<Value>()

        const addLive = (iop: InputOperand) => 
        {
            handleOp(iop, prio)

            if(!live.has(iop.value))
            {
                for(const l of live)
                {
                    addSymmetricInterference(l, iop.value)
                }

                live.add(iop.value)
            }
        }

        const removeLive = (iop: OutputOperand) => 
        {
            handleOp(iop, prio)

            live.delete(iop.value)
        }

        Iterator.from(bb.outputs).forEach(addLive)

        for(const op of [...bb.ops].toReversed())
        {
            op.outputs.forEach(removeLive)
            op.inputs.forEach(addLive)

            if(op instanceof CopyOperation && op.source.isLastUse)
            {
                const [d, s] = [nodes.get(op.destination.value), nodes.get(op.source.value)]
                d.movePartners.add(s)
                s.movePartners.add(d)
            }
        }
        
        bb.used.values().forEach(removeLive);
    }

    return new Set(nodes.values())
}
