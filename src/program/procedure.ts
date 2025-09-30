import assert from "assert"
import { Expression, Variable } from "./expression"
import { Block, Branch, Call, Jump, JumpKind, Loop, Statement } from "./statement"

export interface Builder
{
    args: Iterable<Variable>
    add(stmt: Statement): void
    declare(value: number | Expression): Variable
    loop(condition: Expression, body?: Statement | ((b: Builder) => any)): void
    branch(condition: Expression, then?: Statement | ((b: Builder) => any), owise?: Statement | ((b: Builder) => any)): void
    break(): void
    continue(): void
    return(...retVals: Expression[])
    call(p: Procedure, ...args: (Expression | number)[] ): Iterable<Variable>
}

interface VariableReferenceValidator
{
    validateVariableReference(variable: Variable): boolean 
}

function* autoArray(builder: () => Variable, max?: number): Generator<Variable, void, unknown>
{
    while(true)
    {
        if(max !== undefined)
        {
            assert(0 < max--)
        }

        yield builder()
    }
}

class ConcreteBuilder implements Builder, VariableReferenceValidator
{
    constructor(
        readonly args: Iterable<Variable>,
        readonly rets: Variable[][],
        readonly parent: VariableReferenceValidator
    ) {}

    stmts: Statement[] = []
    readonly declaredVars = new Set<Variable>()

    validateVariableReference(variable: Variable): boolean 
    {
        return this.declaredVars.has(variable) 
            || this.parent.validateVariableReference(variable)
    } 

    add(stmt: Statement): void 
    {
        const refd = stmt.referencedVars
        assert(refd.every(x => this.validateVariableReference(x)))
        this.stmts.push(stmt);
    }

    declare(value: number | Expression): Variable
    {
        const ret = new Variable()
        this.add(ret.set(value))
        this.declaredVars.add(ret)
        return ret
    }

    private toStatement(s: Statement | ((b: Builder) => any) | undefined): Statement
    {
        if(s === undefined) return new Block()
        if(s instanceof Statement) return s;

        const b = new ConcreteBuilder(this.args, this.rets, this)
        s(b)

        return new Block(...b.stmts)
    }

    loop(condition: Expression, body?: Statement | ((b: Builder) => any)): void 
    {
        this.add(new Loop(condition, this.toStatement(body)));
    }

    branch(condition: Expression, then?: Statement | ((b: Builder) => any), owise?: Statement | ((b: Builder) => any)): void 
    {
        return this.add(new Branch(
            condition, 
            this.toStatement(then), 
            owise !== undefined ? this.toStatement(owise) : undefined
        ));
    }

    break(): void 
    {
        this.add(new Jump(JumpKind.Break));
    }

    continue(): void 
    {
        this.add(new Jump(JumpKind.Continue));
    }

    return (...retVals: (Expression | number)[]): void 
    {
        if(this.rets.length == 0)
        {
            this.rets.push(retVals.map(() => new Variable()))
        }

        assert(this.rets[0].length === retVals.length)

        for(let i = 0; i < retVals.length; i++)
        {
            this.add(this.rets[0][i].set(retVals[i]))
        }

        this.add(new Jump(JumpKind.Return))
    }

    call(p: Procedure, ...args: (Expression | number)[] ): Iterable<Variable>
    {
        const rets: Variable[] = []

        this.add(new Call(p, args.map(x => Expression.exprize(x)), rets));

        return autoArray(() => 
        {
            const v = new Variable()

            this.declaredVars.add(v)
            rets.push(v)

            return v
        }, p.args.length)
    }
}

export default class Procedure
{
    constructor(
        readonly args: Variable[], 
        readonly retvals: Variable[], 
        readonly body: Block) {
    }

    public static build(s: (b: Builder) => any): Procedure
    {
        const args: Variable[] = []
        const rets: Variable[][] = []

        const autoArgs = autoArray(() => 
        {
            const ret = new Variable()
            args.push(ret)
            return ret
        });

        const b = new ConcreteBuilder(autoArgs, rets, {validateVariableReference: v => args.includes(v)})
        s(b)

        return new Procedure(args, rets.at(0) ?? [], new Block(...b.stmts))
    }
}
