import { LoadStoreWidth } from "../program/common"
import { Constant, Expression, Variable } from "../program/expression"
import { Statement } from "../program/statement"

export class ReadFromBuffer extends Expression
{
    constructor(readonly buffer: Buffer, readonly offset: Expression, readonly width: LoadStoreWidth = LoadStoreWidth.U1)
    {
        super()
    }

    get referencedVars(): Variable[] { return this.offset.referencedVars }
};

export class WriteToBuffer extends Statement
{
    constructor(readonly buffer: Buffer, readonly value: Expression, readonly offset: Expression, readonly width: LoadStoreWidth = LoadStoreWidth.U1)
    {
        super()
    }

    get referencedVars(): Variable[] { return this.offset.referencedVars }
};

export class BufferAccessor 
{
    constructor(private readonly buffer: Buffer) {}

    read(offset: Expression | number, width: LoadStoreWidth = LoadStoreWidth.U1) 
    {
        return new ReadFromBuffer(this.buffer, Expression.exprize(offset), width)
    }

    write(value: Expression | number, offset: Expression | number, width: LoadStoreWidth = LoadStoreWidth.U1) 
    {
        return new WriteToBuffer(this.buffer, Expression.exprize(value), Expression.exprize(offset), width)
    }

    get length() 
    {
        return new Constant(this.buffer.length)
    }
}
