import assert from "assert"

import { Variable } from "../program/expression"
import { BasicBlock, BranchTermination, Conditional, ExitTermination, Operation, StraightTermination, Termination } from "./basicBlock"
import { DefiningOperand, InputOperand, OutputOperand, Value } from "./value"

export class CfgBuilder 
{
    private readonly map = new Map<CodeBuilder, BasicBlock>()

    constructor(
        private readonly predecessors: Map<CodeBuilder, CodeBuilder[]>
    ) {}

    get(cb: CodeBuilder): BasicBlock 
    {
        return this.map.get(cb) ?? cb.build(this, this.predecessors.get(cb) ?? [])
    }

    register(cb: CodeBuilder, bb: BasicBlock) 
    {
        assert(!this.map.has(cb))
        this.map.set(cb, bb)
    }

    private static *traverse(current: CodeBuilder, visited = new Set<CodeBuilder>())
    {
        if(!visited.has(current))
        {
            visited.add(current)

            yield current

            for(const s of current.successors)
            {
                yield* this.traverse(s, visited)
            }
        }
    }

    static build(entry: CodeBuilder): BasicBlock
    {
        const ps = new Map<CodeBuilder, CodeBuilder[]>();
        for(const cb of CfgBuilder.traverse(entry))
        {
            for(const sb of cb.successors ?? [])
            {
                if(!ps.has(sb))
                {
                    ps.set(sb, [cb])
                }
                else
                {
                    ps.get(sb).push(cb)
                }
            }
        }

        return new CfgBuilder(ps).get(entry)
    }
} 

export class CodeBuilder
{
    private readonly ops: Operation[] = []
    private readonly imports = new Map<Variable, OutputOperand>()
    private readonly exports = new Map<Variable, InputOperand>()
    private readonly available = new Map<Value, DefiningOperand>()
    private termination?: (bldr: CfgBuilder) => Termination
    private _successors: CodeBuilder[] = []

    get successors(): Iterable<CodeBuilder> {
        return this._successors
    }

    get hasOps(): boolean
    {
        return 0 < this.ops.length
    }

    getDefiningOperand(value: Value): DefiningOperand | undefined
    {
        return this.available.get(value);
    }

    getDefinition(value: Value): Operation | undefined
    {
        return this.getDefiningOperand(value)?.op;
    }

    importVariableValue(v: Variable): Value 
    {
        const locallyDefined = this.exports.get(v)
        if(locallyDefined !== undefined) 
        {
            return locallyDefined.value
        }
    
        const alreadyImported = this.imports.get(v)
        if(alreadyImported !== undefined) 
        {
            return alreadyImported.value
        }
        
        const newImport = new Value()
        const oop = new OutputOperand(undefined, newImport)
        this.imports.set(v, oop)
        this.available.set(newImport, oop)
        return newImport
    }

    setImport(variable: Variable, value: Value): void
    {
        assert(!this.exports.has(variable))
        assert(!this.imports.has(variable))

        const oop = new OutputOperand(undefined, value)
        this.imports.set(variable, oop)
        this.available.set(value, oop)
    }

    getImport(variable: Variable): Value | undefined
    {
        return this.imports.get(variable)?.value
    }
    
    private bindInput(iop: InputOperand): void
    {
        assert(iop.definition === undefined)

        const def = this.available.get(iop.value)
        assert(def !== undefined)

        iop.definition = def;
        def.uses.push(iop)
    }
    
    add(op: Operation) 
    {
        for(const i of op.inputs)
        {
            this.bindInput(i)
        }

        for(const o of op.outputs)
        {
            assert(o.uses.length === 0)
            this.available.set(o.value, o)
        }

        this.ops.push(op)
    }

    exportVariableValue(variable: Variable, value: Value)
    {
        const iop = new InputOperand(undefined, value)
        this.bindInput(iop)
        this.exports.set(variable, iop)
    }

    getExport(variable: Variable): Value | undefined
    {
        return this.exports.get(variable)?.value
    }

    terminateStraight(next: CodeBuilder)
    {
        this._successors = [next]
        this.termination = (bldr) => new StraightTermination(bldr.get(next));
    }

    terminateBranch(then: CodeBuilder, owise: CodeBuilder, cond: Conditional)
    {
        this._successors = [then, owise]

        this.termination = (bldr) => 
        {
            for(const iop of cond.inputs)
            {
                this.bindInput(iop)
            }

            return new BranchTermination(bldr.get(then), bldr.get(owise), cond)
        };
    }

    terminateExit()
    {
        this._successors = []
        this.termination = (bldr) => new ExitTermination();
    }

    build(bldr: CfgBuilder, predecessors: CodeBuilder[]): BasicBlock
    {
        return new BasicBlock(this.ops, this.imports, this.exports, bb => 
        {
            bldr.register(this, bb)

            return {
                termination: this.termination?.(bldr),
                predecessors: [...predecessors.map(p => {
                    const inc = bldr.get(p)
                    assert(inc instanceof BasicBlock);
                    return inc;
                })]
            };
        })
    }

    recreateImports(bb: BasicBlock, importMapper = (v: Value) => v): void
    {
        for(const [variable, value] of bb.used.entries())
        {
            const oop = new OutputOperand(undefined, importMapper(value.value))

            assert(!this.imports.has(variable))
            this.imports.set(variable, oop)

            assert(!this.available.has(oop.value))
            this.available.set(oop.value, oop)
        }
    }

    recreateOps(bb: BasicBlock, opMapper = (op: Operation) => [op.copy()]): void 
    {
        for(const op of bb.ops) 
        {
            for(const nOp of opMapper(op)) 
            {
                this.add(nOp)
            }
        }
    }

    recreateExports(bb: BasicBlock, exportMapper = (v: Value) => v): void
    {
        for(const [variable, value] of bb.defd.entries())
        {
            this.exportVariableValue(variable, exportMapper(value.value))
        }
    }

    static recreate(
        bb: BasicBlock, 
        opMapper = (op: Operation) => [op.copy()], 
        exportMapper = (v: Value) => v, 
        importMapper = (v: Value) => v): CodeBuilder
    {
        const cb = new CodeBuilder()

        cb.recreateImports(bb, importMapper)
        cb.recreateOps(bb, opMapper)
        cb.recreateExports(bb, exportMapper)

        return cb;
    }

    static merge(bbs: BasicBlock[]): [CodeBuilder, Map<Value, Value>]
    {
        const cb = new CodeBuilder()
        const valueSubs = new Map<Value, Value>()

        for(const bb of bbs)
        {
            for(const [variable, value] of bb.used.entries())
            {
                const exp = cb.getExport(variable)
                if(exp !== undefined)
                {
                    assert(!valueSubs.has(value.value))
                    valueSubs.set(value.value, exp)
                }
                else
                {
                    const imp = cb.getImport(variable)
                    if(imp !== undefined)
                    {
                        assert(!valueSubs.has(value.value))
                        valueSubs.set(value.value, imp)
                    }
                    else
                    {
                        cb.setImport(variable, value.value)
                    }
                }
            }
    
            cb.recreateOps(bb, op => [op.copy(valueSubs)])
            cb.recreateExports(bb)
        }

        return [cb, valueSubs]
    }
}

export class CfgRewriter
{
    private reterminations = new Map<BasicBlock, Termination>()

    public terminationOf(bb: BasicBlock) 
    {
        return this.reterminations.get(bb) ?? bb.termination
    }

    public reterminate(bb: BasicBlock, term: Termination) 
    {
        this.reterminations.set(bb, term)
    }

    public recondition(bb: BasicBlock, cond: Conditional) 
    {
        const t = this.terminationOf(bb)
        assert(t instanceof BranchTermination)
        this.reterminate(bb, new BranchTermination(t.then, t.owise, cond))
    }
    
    public relink(bb: BasicBlock, oldTarget: BasicBlock, newTarget: BasicBlock) 
    {
        const t = this.terminationOf(bb)
        if(t instanceof StraightTermination)
        {
            assert(t.next == oldTarget)
            this.reterminate(bb, new StraightTermination(newTarget))
        }
        else if(t instanceof BranchTermination)
        {
            if(t.then == oldTarget)
            {
                this.reterminate(bb, new BranchTermination(newTarget, t.owise, t.conditional))
            }
            else
            {
                assert(t.owise == oldTarget)
                this.reterminate(bb, new BranchTermination(t.then, newTarget, t.conditional))
            }
        }
        else
        {
            assert(t === undefined)
        }
    }

    private *traverse(bb: BasicBlock, seen = new Set<BasicBlock>()): Generator<BasicBlock>
    {
        if(!seen.has(bb))
        {
            seen.add(bb)

            yield bb

            for(const s of this.terminationOf(bb)?.successors ?? [])
            {
                yield* this.traverse(s, seen)
            }
        }
    }

    public rewrite(entry: BasicBlock, local = (bb: BasicBlock) => CodeBuilder.recreate(bb)): BasicBlock
    {
        const cbs = new Map(this.traverse(entry).map(bb => [bb, local(bb)]))

        for(const [bb, cb] of cbs.entries())
        {
            const term = this.terminationOf(bb)

            if(term instanceof StraightTermination)
            {
                cb.terminateStraight(cbs.get(term.next))
            }
            else if(term instanceof BranchTermination)
            {
                cb.terminateBranch(
                    cbs.get(term.then),
                    cbs.get(term.owise),
                    term.conditional.copy()
                )
            }
            else
            {
                assert(term instanceof ExitTermination)
                cb.terminateExit()
            }
        }

        return CfgBuilder.build(cbs.get(entry))
    }
}
