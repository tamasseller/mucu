import assert from "assert"
import { LoadStoreWidth } from "./common"
import { Expression, Variable } from "./expression"
import Procedure from "./procedure"

export abstract class Statement {
    abstract get referencedVars(): Variable[]
}

export class Block extends Statement 
{
    readonly stmts: Statement[]

    constructor(...stmts: Statement[]) {
        super()
        this.stmts = stmts
    }

    get referencedVars(): Variable[] { return [] }
}

export class Assignment extends Statement
{
    constructor(readonly target: Variable, readonly value: Expression) {
        super()
    }

    get referencedVars(): Variable[] {
        return this.value.referencedVars
    }
}

export class Store extends Statement
{
    constructor(
        readonly width: LoadStoreWidth,
        readonly address: Expression,
        readonly value: Expression
    ) {
        super();
    }

    override get referencedVars(): Variable[] { return [...new Set([
        ...this.address.referencedVars, 
        ...this.value.referencedVars
    ]).keys()]}
}

export class Branch extends Statement
{
    constructor(
        readonly condition: Expression,
        readonly then: Statement,
        readonly otherwise?: Statement
    ) {
        super()
    }

    get referencedVars(): Variable[] { return this.condition.referencedVars }
}

export const enum JumpKind 
{
    Break, Continue, Return
}

export class Jump extends Statement
{
    constructor(readonly kind: JumpKind) {
        super()
    }

    get referencedVars(): Variable[] { return [] }
}

export class Loop extends Statement
{
    constructor(
        readonly preCondition: Expression,
        readonly body: Statement
    ) {
        super()
    }

    get referencedVars(): Variable[] { return this.preCondition.referencedVars }
}

export class Call extends Statement
{
    constructor(
        readonly procedure: Procedure,
        readonly args: Expression[],
        readonly retvals: Variable[]
    ) {
        super()
        assert(procedure.args.length === args.length)
    }

    get referencedVars(): Variable[] { 
        return [
            ...this.args.map(a => a.referencedVars).flat(),
            ...this.retvals
        ]
    }
}