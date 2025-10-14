import assert from "assert";
import { ArithmeticOperation, CopyOperation, LiteralOperation } from "../generic/operations";
import { DefiningOperand, InOutOperand, InputOperand, OutputOperand, Value } from "../cfg/value";
import { AnyReg } from "./armv6";
import { Assembler, Imm3, Imm5, Imm8, Label, Uoff05, Uoff15, Uoff25 } from "./assembler";
import { Arithmetic, arithmeticEval } from "../generic/arithmetic";
import { LoadStoreWidth } from "../program/common";
import { Conditional, Operation } from "../cfg/basicBlock";
import { allLowRegsBut, args, CoreReg, flagsReg, retVals } from "./registers";

export interface CmIsn extends Operation {
    emit(asm: Assembler);
}

export class ArgumentPseudoIsn extends Operation implements CmIsn
{
    readonly value: OutputOperand
    constructor(
        readonly idx: number,
        value: Value,
    ) {
        super();
        assert(idx < args.length)
        this.value = new OutputOperand(this, value, allLowRegsBut(args[idx]))
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new ArgumentPseudoIsn(this.idx, subs?.get(this.value.value) ?? this.value.value)
    }

    override get outputs(): OutputOperand[] {
        return [this.value]
    }

    get hasSideEffect(): boolean {
        return true
    }

    emit(asm: Assembler) {}

    isIdentical(other: Operation): boolean 
    {
        return other instanceof ArgumentPseudoIsn 
            && other.idx === this.idx
            && other.value.value === this.value.value
    }
}

export class RetvalPseudoIsn extends Operation implements CmIsn
{
    readonly value: InputOperand
    constructor(
        readonly idx: number,
        value: Value,
    ) {
        super();
        assert(idx < args.length)
        this.value = new InputOperand(this, value, allLowRegsBut(retVals[idx]))
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new RetvalPseudoIsn(this.idx, subs?.get(this.value.value) ?? this.value.value)
    }

    override get inputs(): InputOperand[] {
        return [this.value]
    }

    get hasSideEffect(): boolean {
        return true
    }

    emit(asm: Assembler) {}

    isIdentical(other: Operation): boolean 
    {
        return other instanceof RetvalPseudoIsn 
            && other.idx === this.idx
            && other.value.value === this.value.value
    }
}

// x = y
export class CopyIsn extends CopyOperation implements CmIsn
{
    copy(subs?: Map<Value, Value>): Operation {
        return new CopyIsn(
            subs?.get(this.destination.value) ?? this.destination.value,
            subs?.get(this.source.value) ?? this.source.value
        )
    }

    emit(asm: Assembler) 
    {
        assert(this.destination.value instanceof CoreReg)
        assert(this.source.value instanceof CoreReg)
        asm.mov(this.destination.value.reg, this.source.value.reg)
    }
}

// x = c
export class LiteralIsn extends LiteralOperation implements CmIsn 
{
    readonly flags = new OutputOperand(this, flagsReg)

    copy(subs?: Map<Value, Value>): Operation {
        return new LiteralIsn(
            subs?.get(this.result.value) ?? this.result.value,
            this.value
        )
    }

    private static unShift(v: number)
    {
        let shift = 0
        while (((v & 1) == 0) && (256 <= v))
        {
            shift++;
            v >>>= 1
        }

        return [v, shift]
    }

    emit(asm: Assembler) 
    {
        assert(this.result.value instanceof CoreReg)

        const r = this.result.value.reg

        const inv = (~this.value) >>> 0;
        if(0 <= inv && inv < 256)
        {
            asm.movs(r, inv as Imm8)
            asm.mvns(r, r)
        } 
        else
        {
            const [v, nLsh] = LiteralIsn.unShift(this.value)

            if(0 <= v && v < 256)
            {            
                asm.movs(r, v as Imm8)

                if(nLsh)
                {
                    assert(0 < nLsh && nLsh < 32)
                    asm.lsls(r, r, nLsh as Imm5)
                }
            }
            else
            {
                asm.load(r, this.value)
            }
        }
    }

    get outputs(): OutputOperand[] {
        return [this.result, this.flags]
    }
}

// x = y + z
export class AddSubRegRegReg extends ArithmeticOperation implements CmIsn 
{
    readonly flags = new OutputOperand(this, flagsReg)

    constructor(
        result: Value,
        left: Value,
        right: Value,
        readonly op: Arithmetic.Add | Arithmetic.Sub,
    ) {
        super(result, left, right, op);
    }

    copy(subs?: Map<Value, Value>): Operation 
    {
        return new AddSubRegRegReg(
            subs?.get(this.result.value) ?? this.result.value,
            subs?.get(this.left.value) ?? this.left.value,
            subs?.get(this.right.value) ?? this.right.value,
            this.op
        )
    }

    emit(asm: Assembler) 
    {
        assert(this.result.value instanceof CoreReg)
        assert(this.left.value instanceof CoreReg)
        assert(this.right.value instanceof CoreReg)

        switch(this.op)
        {
            case Arithmetic.Add:
                asm.adds(this.result.value.reg, this.left.value.reg, this.right.value.reg)
                break;
            case Arithmetic.Sub:
                asm.subs(this.result.value.reg, this.left.value.reg, this.right.value.reg)
                break;
        }
    }

    get outputs(): OutputOperand[] {
        return [this.result, this.flags]
    }
}

// x = y + c(<8)
export class AddSubRegRegImm3 extends Operation implements CmIsn 
{
    readonly flags = new OutputOperand(this, flagsReg)

    readonly result: OutputOperand
    readonly left: InputOperand

    constructor(
        result: Value,
        left: Value,
        readonly right: Imm3,
        readonly op: Arithmetic.Add | Arithmetic.Sub,
    ) {
        super();
        this.result = new OutputOperand(this, result)
        this.left = new InputOperand(this, left)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new AddSubRegRegImm3(
            subs?.get(this.result.value) ?? this.result.value,
            subs?.get(this.left.value) ?? this.left.value,
            this.right, 
            this.op
        )
    }

    override constValue(input?: Map<Value, number>): number | undefined {
        const l = this.left.definition!.op?.constValue(input);

        if (l !== undefined) {
            return arithmeticEval(this.op, l, this.right);
        }
    }

    override get inputs(): InputOperand[] {
        return [this.left]
    }

    override get outputs(): DefiningOperand[] {
        return [this.result, this.flags]
    }

    emit(asm: Assembler) 
    {
        assert(this.result.value instanceof CoreReg)
        assert(this.left.value instanceof CoreReg)

        switch(this.op)
        {
            case Arithmetic.Add:
                asm.adds(this.result.value.reg, this.left.value.reg, this.right)
                break;
            case Arithmetic.Sub:
                asm.subs(this.result.value.reg, this.left.value.reg, this.right)
                break;
        }
    }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof AddSubRegRegImm3
            && other.op === this.op
            && other.left.value === this.left.value
            && other.right === this.right
            && other.result.value === this.result.value
    }
}

// x = y << c(<32)
export class ShiftRegRegImm5 extends Operation implements CmIsn  
{
    readonly flags = new OutputOperand(this, flagsReg)

    readonly result: OutputOperand
    readonly left: InputOperand

    constructor(
        result: Value,
        left: Value,
        readonly right: Imm5,
        readonly op: Arithmetic.Shl | Arithmetic.Shr
    ) {
        super();
        this.result = new OutputOperand(this, result)
        this.left = new InputOperand(this, left)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new ShiftRegRegImm5(
            subs?.get(this.result.value) ?? this.result.value,
            subs?.get(this.left.value) ?? this.left.value,
            this.right, 
            this.op
        )
    }

    override constValue(input?: Map<Value, number>): number | undefined {
        const l = this.left.definition!.op?.constValue(input);

        if (l !== undefined) {
            return arithmeticEval(this.op, l, this.right);
        }
    }

    override get inputs(): InputOperand[] {
        return [this.left]
    }

    override get outputs(): DefiningOperand[] {
        return [this.result, this.flags]
    }

    emit(asm: Assembler) 
    {
        assert(this.result.value instanceof CoreReg)
        assert(this.left.value instanceof CoreReg)

        switch(this.op)
        {
            case Arithmetic.Shl:
                asm.lsls(this.result.value.reg, this.left.value.reg, this.right)
                break;
            case Arithmetic.Shr:
                asm.lsrs(this.result.value.reg, this.left.value.reg, this.right)
                break;
        }
    }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof ShiftRegRegImm5
            && other.op === this.op
            && other.left.value === this.left.value
            && other.right === this.right
            && other.result.value === this.result.value
    }
}

// x *= y
export class ArithRegReg extends Operation implements CmIsn  
{
    readonly flags = new OutputOperand(this, flagsReg)

    readonly leftResult: InOutOperand
    readonly right: InputOperand

    constructor(
        leftResult: Value,
        right: Value,
        readonly op: Arithmetic.Mul 
            | Arithmetic.Shl | Arithmetic.Shr 
            | Arithmetic.BitAnd | Arithmetic.BitOr | Arithmetic.BitXor
    ) {
        super();
        this.leftResult = new InOutOperand(this, leftResult)
        this.right = new InputOperand(this, right)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new ArithRegReg(
            subs?.get(this.leftResult.value) ?? this.leftResult.value,
            subs?.get(this.right.value) ?? this.right.value,
            this.op
        )
    }

    override constValue(input?: Map<Value, number>): number | undefined {
        const l = this.leftResult.definition!.op?.constValue(input);
        const r = this.right.definition!.op?.constValue(input);

        if (l !== undefined && r !== undefined) {
            return arithmeticEval(this.op, l, r);
        }
    }

    override get inputs(): InputOperand[] {
        return [this.leftResult, this.right]
    }

    override get outputs(): DefiningOperand[] {
        return [this.leftResult, this.flags]
    }

    emit(asm: Assembler) 
    {
        assert(this.leftResult.value instanceof CoreReg)
        assert(this.right.value instanceof CoreReg)

        switch(this.op)
        {
            case Arithmetic.Mul:
                asm.muls(this.leftResult.value.reg, this.right.value.reg)
                break;
            case Arithmetic.Shl:
                asm.lsls(this.leftResult.value.reg, this.right.value.reg)
                break;
            case Arithmetic.Shr:
                asm.lsrs(this.leftResult.value.reg, this.right.value.reg)
                break;
            case Arithmetic.BitAnd:
                asm.ands(this.leftResult.value.reg, this.right.value.reg)
                break;
            case Arithmetic.BitOr:
                asm.orrs(this.leftResult.value.reg, this.right.value.reg)
                break;
            case Arithmetic.BitXor:
                asm.eors(this.leftResult.value.reg, this.right.value.reg)
                break;
        }
    }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof ArithRegReg
            && other.op === this.op
            && other.leftResult.value === this.leftResult.value
            && other.right.value === this.right.value
    }
}

// $ = x - y
export class CompareRegReg extends Operation implements CmIsn 
{
    readonly flags = new OutputOperand(this, flagsReg)

    readonly left: InputOperand
    readonly right: InputOperand

    constructor(
        left: Value,
        right: Value
    ) {
        super();
        this.left = new InputOperand(this, left)
        this.right = new InputOperand(this, right)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new CompareRegReg(
            subs?.get(this.left.value) ?? this.left.value,
            subs?.get(this.right.value) ?? this.right.value
        )
    }

    override constValue(input?: Map<Value, number>): number | undefined {
        const l = this.left.definition!.op?.constValue(input);
        const r = this.right.definition!.op?.constValue(input);

        if (l !== undefined && r !== undefined) {
            return l - r
        }
    }

    override get inputs(): InputOperand[] {
        return [this.left, this.right]
    }

    override get outputs(): DefiningOperand[] {
        return [this.flags]
    }

    emit(asm: Assembler) 
    {
        assert(this.left.value instanceof CoreReg)
        assert(this.right.value instanceof CoreReg)

        asm.cmp(this.left.value.reg, this.right.value.reg)
    }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof CompareRegReg
            && other.left.value === this.left.value
            && other.right.value === this.right.value
    }
}

// $ = x - y
export class CompareNegRegReg extends Operation implements CmIsn 
{
    readonly flags = new OutputOperand(this, flagsReg)

    readonly left: InputOperand
    readonly right: InputOperand

    constructor(
        left: Value,
        right: Value
    ) {
        super();
        this.left = new InputOperand(this, left)
        this.right = new InputOperand(this, right)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new CompareNegRegReg(
            subs?.get(this.left.value) ?? this.left.value,
            subs?.get(this.right.value) ?? this.right.value
        )
    }

    override constValue(input?: Map<Value, number>): number | undefined {
        const l = this.left.definition!.op?.constValue(input);
        const r = this.right.definition!.op?.constValue(input);

        if (l !== undefined && r !== undefined) {
            return l + r
        }
    }

    override get inputs(): InputOperand[] {
        return [this.left, this.right]
    }

    override get outputs(): DefiningOperand[] {
        return [this.flags]
    }

    emit(asm: Assembler) 
    {
        assert(this.left.value instanceof CoreReg)
        assert(this.right.value instanceof CoreReg)

        asm.cmn(this.left.value.reg, this.right.value.reg)
    }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof CompareNegRegReg
            && other.left.value === this.left.value
            && other.right.value === this.right.value
    }
}

// $ = x & y
export class TestRegReg extends Operation implements CmIsn 
{
    readonly flags = new OutputOperand(this, flagsReg)

    readonly left: InputOperand
    readonly right: InputOperand

    constructor(
        left: Value,
        right: Value
    ) {
        super();
        this.left = new InputOperand(this, left)
        this.right = new InputOperand(this, right)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new TestRegReg(
            subs?.get(this.left.value) ?? this.left.value,
            subs?.get(this.right.value) ?? this.right.value
        )
    }

    override constValue(input?: Map<Value, number>): number | undefined {
        const l = this.left.definition!.op?.constValue(input);
        const r = this.right.definition!.op?.constValue(input);

        if (l !== undefined && r !== undefined) {
            return l & r
        }
    }

    override get inputs(): InputOperand[] {
        return [this.left, this.right]
    }

    override get outputs(): DefiningOperand[] {
        return [this.flags]
    }

    emit(asm: Assembler) 
    {
        assert(this.left.value instanceof CoreReg)
        assert(this.right.value instanceof CoreReg)

        asm.tst(this.left.value.reg, this.right.value.reg)
    }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof TestRegReg
            && other.left.value === this.left.value
            && other.right.value === this.right.value
    }
}


// x += c(<256)
export class AddSubRegImm8 extends Operation implements CmIsn  
{
    readonly flags = new OutputOperand(this, flagsReg)

    readonly leftResult: InOutOperand

    constructor(
        leftResult: Value,
        readonly right: Imm8,
        readonly op: Arithmetic.Add | Arithmetic.Sub
    ) {
        super();
        this.leftResult = new InOutOperand(this, leftResult)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new AddSubRegImm8(
            subs?.get(this.leftResult.value) ?? this.leftResult.value,
            this.right, 
            this.op
        )
    }

    override constValue(input?: Map<Value, number>): number | undefined {
        const l = this.leftResult.definition!.op?.constValue(input);

        if (l !== undefined) {
            return arithmeticEval(this.op, l, this.right);
        }
    }

    override get inputs(): InputOperand[] {
        return [this.leftResult]
    }

    override get outputs(): DefiningOperand[] {
        return [this.leftResult, this.flags]
    }

    emit(asm: Assembler) 
    {
        assert(this.leftResult.value instanceof CoreReg)

        switch(this.op)
        {
            case Arithmetic.Add:
                asm.adds(this.leftResult.value.reg, this.right)
                break;
            case Arithmetic.Sub:
                asm.subs(this.leftResult.value.reg, this.right)
                break;
        }
    }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof AddSubRegImm8
            && other.leftResult.value === this.leftResult.value
            && other.right === this.right
    }
}

// $ = x - c(<256)
export class CompareRegImm8 extends Operation implements CmIsn 
{
    readonly flags = new OutputOperand(this, flagsReg)
    readonly left: InputOperand

    constructor(
        left: Value,
        readonly right: Imm8,
    ) {
        super();
        this.left = new InputOperand(this, left)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new CompareRegImm8(
            subs?.get(this.left.value) ?? this.left.value,
            this.right
        )
    }

    override constValue(input?: Map<Value, number>): number | undefined {
        const l = this.left.definition!.op?.constValue(input);

        if (l !== undefined) {
            return l - this.right
        }
    }

    override get inputs(): InputOperand[] {
        return [this.left]
    }

    override get outputs(): DefiningOperand[] {
        return [this.flags]
    }

    emit(asm: Assembler) 
    {
        assert(this.left.value instanceof CoreReg)

        asm.cmp(this.left.value.reg, this.right)
    }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof CompareRegImm8
            && other.left.value === this.left.value
            && other.right === this.right
    }
}

// x <- [y + z]
export class LoadRegOffset extends Operation implements CmIsn  
{
    readonly value: OutputOperand
    readonly base: InputOperand
    readonly offset: InputOperand

    constructor(
        value: Value,
        base: Value,
        offset: Value,
        readonly width: LoadStoreWidth
    ) {
        super();
        this.value = new OutputOperand(this, value)
        this.base = new InputOperand(this, base)
        this.offset = new InputOperand(this, offset)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new LoadRegOffset(
            subs?.get(this.value.value) ?? this.value.value,
            subs?.get(this.base.value) ?? this.base.value,
            subs?.get(this.offset.value) ?? this.offset.value,
            this.width
        )
    }

    override get inputs(): InputOperand[] {
        return [this.base, this.offset]
    }

    override get outputs(): DefiningOperand[] {
        return [this.value]
    }

    emit(asm: Assembler) 
    {
        assert(this.value.value instanceof CoreReg)
        assert(this.base.value instanceof CoreReg)
        assert(this.offset.value instanceof CoreReg)

        switch(this.width)
        {
            case LoadStoreWidth.U1:
                asm.ldrb(this.value.value.reg, this.base.value.reg, this.offset.value.reg)
                break;
            case LoadStoreWidth.U2:
                asm.ldrh(this.value.value.reg, this.base.value.reg, this.offset.value.reg)
                break;
            case LoadStoreWidth.U4:
                asm.ldr(this.value.value.reg, this.base.value.reg, this.offset.value.reg)
                break;
        }
    }

    override get hasSideEffect(): boolean { return true }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof LoadRegOffset
            && other.base.value === this.base.value
            && other.offset.value === this.offset.value
            && other.value.value === this.value.value
            && other.width === this.width
    }
}

// x <- [y + c(<32*width)]
export class LoadImmOffset extends Operation implements CmIsn  
{
    readonly value: OutputOperand
    readonly base: InputOperand

    constructor(
        value: Value,
        base: Value,
        readonly offset: number,
        readonly width: LoadStoreWidth
    ) {
        super();
        this.value = new OutputOperand(this, value)
        this.base = new InputOperand(this, base)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new LoadImmOffset(
            subs?.get(this.value.value) ?? this.value.value,
            subs?.get(this.base.value) ?? this.base.value,
            this.offset, 
            this.width
        )
    }

    override get inputs(): InputOperand[] {
        return [this.base]
    }

    override get outputs(): DefiningOperand[] {
        return [this.value]
    }

    emit(asm: Assembler) 
    {
        assert(this.value.value instanceof CoreReg)
        assert(this.base.value instanceof CoreReg)

        switch(this.width)
        {
            case LoadStoreWidth.U1:
                assert(((this.offset & 1) == 0) && this.offset < 32)
                asm.ldrb(this.value.value.reg, this.base.value.reg, this.offset as Uoff05)
                break;
            case LoadStoreWidth.U2:
                assert(((this.offset & 1) == 0) && this.offset < 64)
                asm.ldrh(this.value.value.reg, this.base.value.reg, this.offset as Uoff15)
                break;
            case LoadStoreWidth.U4:
                assert(((this.offset & 3) == 0) && this.offset < 128)
                asm.ldr(this.value.value.reg, this.base.value.reg, this.offset as Uoff25)
                break;
        }
    }

    override get hasSideEffect(): boolean { return true }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof LoadImmOffset
            && other.base.value === this.base.value
            && other.offset === this.offset
            && other.value.value === this.value.value
            && other.width === this.width
    }
}

// x <- [y++]
export class LoadWordRegIncrement extends Operation implements CmIsn  
{
    readonly value: OutputOperand
    readonly address: InOutOperand

    constructor(
        value: Value,
        address: Value,
    ) {
        super();
        this.value = new OutputOperand(this, value)
        this.address = new InOutOperand(this, address)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new LoadWordRegIncrement(
            subs?.get(this.value.value) ?? this.value.value,
            subs?.get(this.address.value) ?? this.address.value,
        )
    }

    override get inputs(): InputOperand[] {
        return [this.address]
    }

    override get outputs(): DefiningOperand[] {
        return [this.value, this.address]
    }

    emit(asm: Assembler) 
    {
        assert(this.value.value instanceof CoreReg)
        assert(this.address.value instanceof CoreReg)

        const t = this.value.value.reg
        const a = this.address.value.reg
        assert(a.idx !== t.idx)
        asm.ldmia(a, [t])
    }

    override get hasSideEffect(): boolean { return true }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof LoadWordRegIncrement
            && other.value.value === this.value.value
            && other.address.value === this.value.value
    }
}

// [y + z] <- x
export class StoreRegOffset extends Operation implements CmIsn  
{
    readonly value: InputOperand
    readonly base: InputOperand
    readonly offset: InputOperand

    constructor(
        value: Value,
        base: Value,
        offset: Value,
        readonly width: LoadStoreWidth
    ) {
        super();
        this.value = new InputOperand(this, value)
        this.base = new InputOperand(this, base)
        this.offset = new InputOperand(this, offset)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new StoreRegOffset(
            subs?.get(this.value.value) ?? this.value.value,
            subs?.get(this.base.value) ?? this.base.value,
            subs?.get(this.offset.value) ?? this.offset.value,
            this.width
        )
    }

    override get inputs(): InputOperand[] {
        return [this.value, this.base, this.offset]
    }

    emit(asm: Assembler) 
    {
        assert(this.value.value instanceof CoreReg)
        assert(this.base.value instanceof CoreReg)
        assert(this.offset.value instanceof CoreReg)

        switch(this.width)
        {
            case LoadStoreWidth.U1:
                asm.strb(this.value.value.reg, this.base.value.reg, this.offset.value.reg)
                break;
            case LoadStoreWidth.U2:
                asm.strh(this.value.value.reg, this.base.value.reg, this.offset.value.reg)
                break;
            case LoadStoreWidth.U4:
                asm.str(this.value.value.reg, this.base.value.reg, this.offset.value.reg)
                break;
        }
    }

    override get hasSideEffect(): boolean { return true }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof StoreRegOffset
            && other.base.value === this.base.value
            && other.offset.value === this.offset.value
            && other.value.value === this.value.value
            && other.width === this.width
    }
}

// x <- [y + c(<32*width)]
export class StoreImmOffset extends Operation implements CmIsn  
{
    readonly value: InputOperand
    readonly base: InputOperand

    constructor(
        value: Value,
        base: Value,
        readonly offset: number,
        readonly width: LoadStoreWidth
    ) {
        super();
        this.value = new InputOperand(this, value)
        this.base = new InputOperand(this, base)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new StoreImmOffset(
            subs?.get(this.value.value) ?? this.value.value,
            subs?.get(this.base.value) ?? this.base.value,
            this.offset, 
            this.width
        )
    }

    override get inputs(): InputOperand[] {
        return [this.value, this.base]
    }

    emit(asm: Assembler) 
    {
        assert(this.value.value instanceof CoreReg)
        assert(this.base.value instanceof CoreReg)

        switch(this.width)
        {
            case LoadStoreWidth.U1:
                assert(((this.offset & 1) == 0) && this.offset < 32)
                asm.strb(this.value.value.reg, this.base.value.reg, this.offset as Uoff05)
                break;
            case LoadStoreWidth.U2:
                assert(((this.offset & 1) == 0) && this.offset < 64)
                asm.strh(this.value.value.reg, this.base.value.reg, this.offset as Uoff15)
                break;
            case LoadStoreWidth.U4:
                assert(((this.offset & 3) == 0) && this.offset < 128)
                asm.str(this.value.value.reg, this.base.value.reg, this.offset as Uoff25)
                break;
        }
    }

    override get hasSideEffect(): boolean { return true }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof StoreImmOffset
            && other.base.value === this.base.value
            && other.offset === this.offset
            && other.value.value === this.value.value
            && other.width === this.width
    }
}

// [y++] <- x
export class StoreWordRegIncrement extends Operation implements CmIsn  
{
    readonly value: InputOperand
    readonly address: InOutOperand

    constructor(
        value: Value,
        address: Value,
    ) {
        super();
        this.value = new InputOperand(this, value)
        this.address = new InOutOperand(this, address)
    }

    copy(subs?: Map<Value, Value>): Operation {
        return new StoreWordRegIncrement(
            subs?.get(this.value.value) ?? this.value.value,
            subs?.get(this.address.value) ?? this.address.value,
        )
    }

    override get inputs(): InputOperand[] {
        return [this.value, this.address]
    }

    override get outputs(): DefiningOperand[] {
        return [this.address]
    }

    emit(asm: Assembler) 
    {
        assert(this.value.value instanceof CoreReg)
        assert(this.address.value instanceof CoreReg)
        
        const t = this.value.value.reg
        const a = this.address.value.reg
        assert(a.idx !== t.idx)
        asm.ldmia(a, [t])
    }

    override get hasSideEffect(): boolean { return true }

    isIdentical(other: Operation): boolean 
    {
        return other instanceof StoreWordRegIncrement
            && other.value.value === this.value.value
            && other.address.value === this.value.value
    }
}

export const enum CmCondition
{
    Zero,
    NonZero,
    PositiveUnsigned,
    NonPositiveUnsigned,
    NegativeUnsigned,
    NonNegativeUnsigned
}

export const nonSignedCompare = [
    CmCondition.Zero,
    CmCondition.NonZero,
    CmCondition.PositiveUnsigned,
    CmCondition.NonPositiveUnsigned,
    CmCondition.NegativeUnsigned,
    CmCondition.NonNegativeUnsigned
]

export function cmConditionStr(cond: CmCondition): string
{
    switch(cond)
    {
        case CmCondition.Zero: return "== 0"
        case CmCondition.NonZero: return "!= 0"
        case CmCondition.PositiveUnsigned: return "> 0"
        case CmCondition.NonPositiveUnsigned: return "<= 0"
        case CmCondition.NegativeUnsigned: return "< 0"
        case CmCondition.NonNegativeUnsigned: return ">= 0"
    }
}

function invert(c: CmCondition): CmCondition {
    switch(c)
    {
        case CmCondition.Zero:                  return CmCondition.NonZero
        case CmCondition.NonZero:               return CmCondition.Zero
        case CmCondition.PositiveUnsigned:      return CmCondition.NonNegativeUnsigned
        case CmCondition.NonPositiveUnsigned:   return CmCondition.NegativeUnsigned
        case CmCondition.NegativeUnsigned:      return CmCondition.NonNegativeUnsigned
        case CmCondition.NonNegativeUnsigned:   return CmCondition.PositiveUnsigned
    }
}

export class CmConditional implements Conditional
{
    constructor(readonly condition: CmCondition) {}

    copy(subs?: Map<Value, Value>): Conditional {
        return new CmConditional(this.condition)
    }

    readonly flags = new InputOperand(undefined, flagsReg)
    get inputs(): InputOperand[] {
        return [this.flags]
    }

    emit(asm: Assembler, target: Label) 
    {
        switch(this.condition)
        {
            case CmCondition.Zero:                  asm.beq(target); break
            case CmCondition.NonZero:               asm.bne(target); break
            case CmCondition.PositiveUnsigned:      asm.bhi(target); break
            case CmCondition.NonPositiveUnsigned:   asm.bls(target); break
            case CmCondition.NegativeUnsigned:      asm.blo(target); break
            case CmCondition.NonNegativeUnsigned:   asm.bhs(target); break
        }
    }

    get inverse(): Conditional {
        return new CmConditional(invert(this.condition))
    }
}