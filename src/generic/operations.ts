import { LoadStoreWidth } from "../program/common";
import { Arithmetic, arithmeticEval } from "./arithmetic";
import { Conditional, Operation } from "../cfg/basicBlock";
import { InputOperand, OutputOperand, Value } from "../cfg/value";

export const enum Relation
{
    Equal, Less
}

export function conditionStr(cond: Relation): string
{
    switch(cond)
    {
        case Relation.Equal: return "=="
        case Relation.Less: return "<"
    }
}

export function evaluateCondition(cond: Relation, left: number, right: number): boolean
{
    switch(cond)
    {
        case Relation.Equal: return left === right
        case Relation.Less:  return left < right
    }
}

export class TacConditional implements Conditional
{
    left: InputOperand
    right: InputOperand

    constructor(
        left: Value,
        right: Value,
        readonly condition: Relation
    ) {
        this.left = new InputOperand(undefined, left)
        this.right = new InputOperand(undefined, right)
    }

    copy(subs?: Map<Value, Value>): Conditional {
        return new TacConditional(
            subs?.get(this.left.value) ?? this.left.value, 
            subs?.get(this.right.value) ?? this.right.value, 
            this.condition
        )
    }

    get inputs(): InputOperand[] {
        return [this.left, this.right]
    }

    get inverse(): Conditional {
        throw new Error("Method not implemented.");
    }
}

export class ArgumentOperation extends Operation 
{
    readonly value: OutputOperand
    constructor(
        readonly idx: number,
        value: Value,
    ) {
        super();
        this.value = new OutputOperand(this, value)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new ArgumentOperation(this.idx, subs?.get(this.value.value) ?? this.value.value)
    }

    override get outputs(): OutputOperand[] {
        return [this.value]
    }

    get hasSideEffect(): boolean {
        return true
    }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof ArgumentOperation 
            && other.idx === this.idx
            && other.value.value === this.value.value
    }
}

export class RetvalOperation extends Operation 
{
    readonly value: InputOperand
    constructor(
        readonly idx: number,
        value: Value,
    ) {
        super();
        this.value = new InputOperand(this, value)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new RetvalOperation(this.idx, subs?.get(this.value.value) ?? this.value.value)
    }

    override get inputs(): InputOperand[] {
        return [this.value]
    }

    get hasSideEffect(): boolean {
        return true
    }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof RetvalOperation 
            && other.idx === this.idx
            && other.value.value === this.value.value
    }
}

export class LiteralOperation extends Operation 
{
    readonly result: OutputOperand
    constructor(
        result: Value,
        readonly value: number
    ) {
        super();
        this.result = new OutputOperand(this, result)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new LiteralOperation(subs?.get(this.result.value) ?? this.result.value, this.value)
    }

    override constValue(): number {
        return this.value;
    }

    override get outputs(): OutputOperand[] {
        return [this.result]
    }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof LiteralOperation 
            && other.value === this.value
            && other.result.value === this.result.value
    }
}

export class ArithmeticOperation extends Operation 
{
    readonly result: OutputOperand
    readonly left: InputOperand
    readonly right: InputOperand
    constructor(
        result: Value,
        left: Value,
        right: Value,
        readonly op: Arithmetic
    ) {
        super();
        this.result = new OutputOperand(this, result)
        this.left = new InputOperand(this, left)
        this.right = new InputOperand(this, right)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new ArithmeticOperation(
            subs?.get(this.result.value) ?? this.result.value,
            subs?.get(this.left.value) ?? this.left.value,
            subs?.get(this.right.value) ?? this.right.value,
            this.op
        )
    }

    override constValue(input?: Map<Value, number>): number | undefined {
        const l = this.left.constValue(input);
        const r = this.right.constValue(input);

        if (l !== undefined && r !== undefined) {
            return arithmeticEval(this.op, l, r);
        }
    }

    override get inputs(): InputOperand[] {
        return [this.left, this.right]
    }

    override get outputs(): OutputOperand[] {
        return [this.result]
    }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof ArithmeticOperation
            && other.op === this.op
            && other.left.value === this.left.value
            && other.right.value === this.right.value
            && other.result.value === this.result.value
    }
}

export class CopyOperation extends Operation 
{
    readonly destination: OutputOperand
    readonly source: InputOperand

    constructor(
        destination: Value,
        source: Value
    ) {
        super();
        this.destination = new OutputOperand(this, destination)
        this.source = new InputOperand(this, source)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new CopyOperation(
            subs?.get(this.destination.value) ?? this.destination.value,
            subs?.get(this.source.value) ?? this.source.value,
        )
    }

    override constValue(input?: Map<Value, number>): number | undefined {
        return this.source.constValue(input);
    }

    override get inputs(): InputOperand[] {
        return [this.source]
    }

    override get outputs(): OutputOperand[] {
        return [this.destination]
    }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof CopyOperation
            && other.destination.value === this.destination.value
            && other.source.value === this.source.value
    }
}

export class LoadOperation extends Operation 
{
    readonly value: OutputOperand
    readonly address: InputOperand

    constructor(
        value: Value,
        address: Value,
        readonly width: LoadStoreWidth
    ) {
        super();
        this.value = new OutputOperand(this, value)
        this.address = new InputOperand(this, address)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new LoadOperation(
            subs?.get(this.value.value) ?? this.value.value,
            subs?.get(this.address.value) ?? this.address.value,
            this.width
        )
    }

    override get inputs(): InputOperand[] {
        return [this.address]
    }

    override get outputs(): OutputOperand[] {
        return [this.value]
    }

    override get hasSideEffect(): boolean { return true }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof LoadOperation
            && other.address.value === this.address.value
            && other.value.value === this.value.value
            && other.width == this.width
    }
}

export class StoreOperation extends Operation 
{
    readonly value: InputOperand
    readonly address: InputOperand

    constructor(
        value: Value,
        address: Value,
        readonly width: LoadStoreWidth
    ) {
        super();
        this.value = new InputOperand(this, value)
        this.address = new InputOperand(this, address)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new StoreOperation(
            subs?.get(this.value.value) ?? this.value.value,
            subs?.get(this.address.value) ?? this.address.value,
            this.width
        )
    }

    override get inputs(): InputOperand[] {
        return [this.value, this.address]
    }

    override get hasSideEffect(): boolean { return true }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof StoreOperation
            && other.address.value === this.address.value
            && other.value.value === this.value.value
            && other.width == this.width
    }
}
