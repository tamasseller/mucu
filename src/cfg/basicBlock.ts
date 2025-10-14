import assert from "assert";
import { Variable } from "../program/expression";
import { CodeBuilder } from "./cfgBuilder";
import { DefiningOperand, InputOperand, OutputOperand, Value } from "./value";

export class StraightTermination
{
    constructor(readonly next: BasicBlock) {}

    get successors(): BasicBlock[]
    {
        return [this.next]
    }

    get inputs(): InputOperand[] 
    {
        return []
    }
}

export interface Conditional
{
    get inputs(): InputOperand[]
    copy(subs?: Map<Value, Value>): Conditional 
    get inverse(): Conditional;
}

export class BranchTermination
{
    constructor(
        readonly then: BasicBlock, 
        readonly owise: BasicBlock,
        readonly conditional: Conditional
    ) {}

    get successors(): BasicBlock[]
    {
        return [this.then, this.owise]
    }

    get inputs(): InputOperand[] 
    {
        return this.conditional.inputs
    }

    get twisted(): BranchTermination {
        return new BranchTermination(this.owise, this.then, this.conditional.inverse)
    }
}

export class ExitTermination
{
    constructor() {}

    get successors(): BasicBlock[]
    {
        return []
    }

    get inputs(): InputOperand[] 
    {
        return []
    }
}

export type Termination = StraightTermination | BranchTermination | ExitTermination;

export abstract class Operation 
{
    get hasSideEffect(): boolean {return false}
    get inputs(): InputOperand[] { return [] }
    get outputs(): DefiningOperand[] { return [] }

    constValue(input?: Map<Value, number>): number | undefined { return undefined } 

    abstract copy(subs?: Map<Value, Value>): Operation 
    abstract isIdentical(other: Operation): boolean
}

export class BasicBlock
{
    private readonly _predecessors: BasicBlock[] = []
    private _termination: Termination;

    constructor(
        private readonly _ops: Operation[],
        private readonly _used: Map<Variable, OutputOperand>,
        private readonly _defd: Map<Variable, InputOperand>,
        binder: (bb: BasicBlock) => {
            predecessors: BasicBlock[]
            termination: Termination
        }
    )
    {
        const b = binder(this)
        this._predecessors = b.predecessors
        this._termination = b.termination
    }

    get joins(): boolean {
        return 1 < this._predecessors.length
    }

    get predecessors(): Iterable<BasicBlock> {
        return this._predecessors
    }

    get used(): ReadonlyMap<Variable, OutputOperand> {
        return this._used
    }

    get hasOps(): boolean
    {
        return 0 < this._ops.length
    }

    get ops(): Iterable<Operation> {
        return this._ops
    }

    get defd(): ReadonlyMap<Variable, InputOperand> {
        return this._defd
    }

    get outputs(): Iterable<InputOperand>
    {
        return [
            ...this._defd.values(),
            ...this._termination?.inputs ?? []
        ]
    }

    get termination(): Termination
    {
        return this._termination
    }

    get successors(): Iterable<BasicBlock> {
        return this._termination?.successors ?? []
    }

    get splits(): boolean {
        return 1 < (this._termination?.successors.length ?? 0)
    }

    twistConditional()
    {
        assert(this._termination instanceof BranchTermination)
        this._termination = this._termination.twisted
    }
}
