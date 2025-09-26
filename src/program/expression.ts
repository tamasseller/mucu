import { BinaryOperator } from "./binaryOperator"
import { LoadStoreWidth } from "./common"
import { Assignment, Statement, Store } from "./statement"

export abstract class Expression 
{
    abstract get referencedVars(): Variable[]

    static exprize = (r: Expression | number): Expression => 
        r instanceof Expression ? r : new Constant(r >>> 0)
   
    add(r: Expression | number): Binary {
        return new Binary(BinaryOperator.Add, this, Expression.exprize(r))
    }

    sub(r: Expression | number): Binary {
        return new Binary(BinaryOperator.Sub, this, Expression.exprize(r))
    }

    mul(r: Expression | number): Binary {
        return new Binary(BinaryOperator.Mul, this, Expression.exprize(r))
    }

    shl(r: Expression | number): Binary {
        return new Binary(BinaryOperator.Shl, this, Expression.exprize(r))
    }

    shr(r: Expression | number): Binary {
        return new Binary(BinaryOperator.Shr, this, Expression.exprize(r))
    }

    bitand(r: Expression | number): Binary {
        return new Binary(BinaryOperator.BitAnd, this, Expression.exprize(r))
    }

    bitor(r: Expression | number): Binary {
        return new Binary(BinaryOperator.BitOr, this, Expression.exprize(r))
    }

    bitxor(r: Expression | number): Binary {
        return new Binary(BinaryOperator.BitXor, this, Expression.exprize(r))
    }

    eq(r: Expression | number): Binary {
        return new Binary(BinaryOperator.Eq, this, Expression.exprize(r))
    }

    ne(r: Expression | number): Binary {
        return new Binary(BinaryOperator.Ne, this, Expression.exprize(r))
    }

    lt(r: Expression | number): Binary {
        return new Binary(BinaryOperator.Lt, this, Expression.exprize(r))
    }

    gt(r: Expression | number): Binary {
        return new Binary(BinaryOperator.Gt, this, Expression.exprize(r))
    }

    le(r: Expression | number): Binary {
        return new Binary(BinaryOperator.Le, this, Expression.exprize(r))
    }

    ge(r: Expression | number): Binary {
        return new Binary(BinaryOperator.Ge, this, Expression.exprize(r))
    }

    logand(r: Expression | number): Binary {
        return new Binary(BinaryOperator.LogAnd, this, Expression.exprize(r))
    }

    logor(r: Expression | number): Binary {
        return new Binary(BinaryOperator.LogOr, this, Expression.exprize(r))
    }

    ternary(t: Expression | number, e: Expression | number): Ternary {
		return new Ternary(this, Expression.exprize(t), Expression.exprize(e))
	}

    load(w: LoadStoreWidth = LoadStoreWidth.U4): Expression {
        return new Load(w, this)
    }

    store(r: Expression | number, w: LoadStoreWidth = LoadStoreWidth.U4): Statement {
        return new Store(w, this, Expression.exprize(r))
    }
}

export class Variable extends Expression 
{   
    constructor() {
        super()
    }
    
    set(r: Expression | number): Statement {
        return new Assignment(this, Expression.exprize(r))
    }

    increment(r: Expression | number = 1): Statement {
        return this.set(this.add(Expression.exprize(r)))
    }

    decrement(r: Expression | number = 1): Statement {
        return this.set(this.sub(Expression.exprize(r)))
    }

    override get referencedVars(): Variable[] { return [this] }
}

export class Constant extends Expression {
    constructor(readonly value: number) {
        super()
    }

    override get referencedVars(): Variable[] { return [] }
}

export class Load extends Expression
{
    constructor(
        readonly width: LoadStoreWidth,
        readonly address: Expression
    ) {
        super()
    }

    override get referencedVars(): Variable[] { return this.address.referencedVars }
}

export class Binary extends Expression
{
    constructor(
        readonly operator: BinaryOperator,
        readonly left: Expression,
        readonly right: Expression,
    ) {
        super()
    }

    override get referencedVars(): Variable[] { return [...new Set([
        ...this.left.referencedVars, 
        ...this.right.referencedVars
    ]).keys()]}
}

export class Ternary extends Expression
{
    constructor(
        readonly condition: Expression,
        readonly then: Expression,
        readonly otherwise: Expression,
    ) {
        super()
    }

    override get referencedVars(): Variable[] { return [...new Set([
        ...this.condition.referencedVars, 
        ...this.then.referencedVars,
        ...this.otherwise.referencedVars
    ]).keys()]}
}
