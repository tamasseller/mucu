import assert from "assert"
import { Value } from "../cfg/value"

const debug = false

const log = !debug ? () => {} : (str) => console.log(str)

const validateNodeList = !debug ? () => {} : (nodes: Set<AllocationNode>) =>
{
    for(const n of nodes)
    {
        assert(n !== undefined)
        assert(!n.interferers.has(n), `n:(${strNode(n)})`)

        for(const i of n.interferers) {
            assert(i !== undefined)
            assert(nodes.has(i), `n:(${strNode(n)}); i:(${strNode(i)})`)
            assert(i.interferers.has(n), `n:(${strNode(n)}); i:(${strNode(i)})`)
            assert(!n.movePartners.has(i), `n:(${strNode(n)}); i:(${strNode(i)})`)
            assert(!i.movePartners.has(n), `n:(${strNode(n)}); i:(${strNode(i)})`)
        }

        assert(!n.movePartners.has(n), `n:(${strNode(n)})`)
        for(const p of n.movePartners) {
            assert(p !== undefined)
            assert(nodes.has(p), `n:(${strNode(n)}); p:(${strNode(p)})`)
            assert(p.movePartners.has(n), `n:(${strNode(n)}); p:(${strNode(p)})`)
            assert(!n.interferers.has(p), `n:(${strNode(n)}); p:(${strNode(p)})`)
            assert(!p.interferers.has(n), `n:(${strNode(n)}); p:(${strNode(p)})`)
        }
    }
}

const validateCoalesce = !debug ? () => {} : (a: AllocationNode, b: AllocationNode) => 
{
    assert(a !== b)
    assert(!a.interferers.has(b) && !b.interferers.has(a))
    assert(a.movePartners.has(b) && b.movePartners.has(a))
}

const strNode = (n: AllocationNode) => [...n.values.values().map(v => v.idx)].join(", ")

export class AllocationNode
{
    public interferers = new Set<AllocationNode>
    public movePartners = new Set<AllocationNode>
    public values: Set<Value>

    constructor(
        value: Value,
        public priority: number
    ) {
        this.values = new Set([value])
    }

    get degree() {
        return this.interferers.size
    }

    get moveRelated() {
        return 0 < this.movePartners.size
    }

    disconnectInterference()
    {
        for(const i of this.interferers)
        {
            const removed = i.interferers.delete(this)
            assert(removed)
        }
    }

    connectInterference()
    {
        for(const i of this.interferers)
        {
            assert(!i.interferers.has(this))
            i.interferers.add(this)
        }
    }

    freeze() 
    {
        for(const p of this.movePartners)
        {
            p.movePartners.delete(this)
        }

        this.movePartners.clear()
    }

    coalesce(b: AllocationNode): void
    {
        validateCoalesce(this, b)

        for(const n of this.movePartners.intersection(b.interferers))
        {
            assert(n.movePartners.delete(this))
        }

        for(const n of b.interferers) {
            assert(n.interferers.delete(b))
            n.interferers.add(this)
        }

        for(const n of b.movePartners) 
        {
            if(n !== this)
            {
                assert(n.movePartners.delete(b))

                if(!this.interferers.has(n))
                {
                    n.movePartners.add(this)
                }
            }
        }
        
        this.interferers = this.interferers.union(b.interferers)
        this.movePartners = this.movePartners.union(b.movePartners)
            .difference(this.interferers.union(new Set([this, b])))

        this.values = this.values.union(b.values)
        this.priority = Math.max(this.priority, b.priority)
    }
}

function reduce(precolored: Set<Value>, nodes: Set<AllocationNode>): AllocationNode[]
{
    const stack: AllocationNode[] = []

    validateNodeList(nodes)

    const k = precolored.size
    while(precolored.size < nodes.size)
    {
        /// Simplify
        const nodesOfLowDegree = [...nodes.values().filter(node => node.degree < k)].toSorted((a, b) => b.priority - a.priority)

        let simplified = false;
        for(const n of nodesOfLowDegree)
        {
            if(!n.moveRelated && n.values.isDisjointFrom(precolored))
            {
                log(`simplify ${strNode(n)}`)

                n.disconnectInterference()
                stack.push(n)
                nodes.delete(n)
                simplified = true;
                break
            }
        }

        if(simplified)
        {
            continue;
        }

        /// Coalesce
        let coalesced = false;
        for(const a of nodesOfLowDegree)
        {
            const eligible = a.movePartners.values().filter(b => 
            {
                const george = a.interferers.values().every(t => b.interferers.has(t) || t.degree < k)
                const briggs = a.interferers.union(b.interferers).values().reduce((sum, n) => 
                    sum + (k <= n.degree ? 1 : 0), 0) < k

                return george || briggs
            })

            const [first, ...rest] = eligible

            if(first !== undefined)
            {
                const b = rest.reduce((a, b) => a.priority < b.priority ? b : a, first)
                log(`coalesce ${strNode(a)} <-> ${strNode(b)}`)

                a.coalesce(b)
                nodes.delete(b)
                coalesced = true;

                validateNodeList(nodes)
                break
            }
        }

        if(coalesced)
        {
            continue;
        }

        /// Freeze
        const mayBeFrozen = nodesOfLowDegree.filter(n => n.values.isDisjointFrom(precolored))
        {    
            const [first, ...rest] = mayBeFrozen
            if(first !== undefined)
            {
                const toBeFrozen = rest.reduce((a, b) => a.priority < b.priority ? a : b, first)
                log(`freeze ${strNode(toBeFrozen)}`)

                toBeFrozen.freeze()
                continue
            }
        }

        /// Potentially spill
        {
            const mayBeSpilled = nodes.values().filter(n => n.values.isDisjointFrom(precolored))
            const [first, ...rest] = mayBeSpilled
            const toBeSpilled = rest.reduce((a, b) => a.priority < b.priority ? a : b, first)
            log(`yolo ${strNode(toBeSpilled)}`)
            toBeSpilled.disconnectInterference()
            toBeSpilled.freeze() // ???
            stack.push(toBeSpilled)
            nodes.delete(toBeSpilled)
        }
    }

    return stack
}

/*
 * Chaitin-style graph-coloring, with conservative coalescing due to Briggs et al.
 */
export function color(
    precolored: Value[],
    nodes: Iterable<AllocationNode>
): Map<Value, Value>
{
    const stack = reduce(new Set(precolored), new Set(nodes))  

    const colors = new Map<Value, number>(precolored.map((p, idx) => [p, idx]));

    /// Select
    while(true)
    {
        const next = stack.pop()
        if(next === undefined)
        {
            break;
        }

        const forbidden = new Set<number>(next.interferers.values().map(n => {
            const cs = n.values.values().map(v => colors.get(v));
            const [first, ...rest] = cs;
            assert(rest.every(c => c == first))
            return first;
        }))

        let color = 0

        if(forbidden.size)
        {
            const [from, to] = [Math.min(...forbidden), Math.max(...forbidden)]

            if(from == 0)
            {
                color = to + 1

                if(forbidden.size <= to)
                {
                    for(let i = 1; i < to; i++)
                    {
                        if(!forbidden.has(i))
                        {
                            color = i
                            break;
                        }
                    }
                }
            }
        }

        log(`color ${color} -> ${strNode(next)}`)

        for(const v of next.values)
        {
            colors.set(v, color)
        }
    }

    return new Map(colors.entries().map(([k, v]) => [k, precolored[v]]))
}
