import assert from "assert";
import Procedure from "../program/procedure";
import { BasicBlock, Operation } from "../cfg/basicBlock";
import { LiteralOperation, ArithmeticOperation, CopyOperation, LoadOperation, StoreOperation, Relation, TacConditional, ArgumentOperation, RetvalOperation } from "./operations";
import { Binary, Constant, Expression, Load, Ternary, Variable } from "../program/expression";
import { Assignment, Block, Branch, Jump, JumpKind, Loop, Statement, Store } from "../program/statement";
import { BinaryOperator, comparisonOperators, logicOperators } from "../program/binaryOperator";
import { Arithmetic } from "./arithmetic";
import { Value } from "../cfg/value";
import { CfgBuilder, CodeBuilder } from "../cfg/cfgBuilder";

interface MaterializedValue { cb: CodeBuilder, value: Value }
type StatementGenerator = (cb: CodeBuilder) => CodeBuilder
type ValueMaterializer = (cb: CodeBuilder) => MaterializedValue

const arithmetic = (left: ValueMaterializer, right: ValueMaterializer, op: Arithmetic): ValueMaterializer => (cb) => {
    const l = left(cb);
    const r = right(l.cb);

    const value = new Value();
    cb.add(new ArithmeticOperation(value, pullThroughIfNeedBe(l, r), r.value, op))
    return { cb: cb, value }
}

function manifestTernaryValue(expr: Expression, temp: Variable, next: CodeBuilder) 
{
    const cb = new CodeBuilder()

    const v = expressionValue(expr)(cb)

    const copy = new Value()
    v.cb.add(new CopyOperation(copy, v.value)) // TODO XXX
    v.cb.exportVariableValue(temp, copy)
    v.cb.terminateStraight(next)

    return cb
}

function ternary(cond: Expression, ifTrue: Expression, ifFalse: Expression): ValueMaterializer 
{
    return entry => 
    {
        const exit = new CodeBuilder()
        const result = new Variable()
        const trueCb = manifestTernaryValue(ifTrue, result, exit)
        const falseCb = manifestTernaryValue(ifFalse, result, exit)
        expressionControl({ expr: cond, entry: entry, then: trueCb, owise: falseCb })
        return { cb: exit, value: exit.importVariableValue(result) }
    }
}

function expressionValue(expr: Expression): ValueMaterializer 
{
    if (expr instanceof Constant) 
    {
        return cb => 
        {
            const value = new Value();
            cb.add(new LiteralOperation(value, expr.value))
            return { cb: cb, value };
        }
    }
    else if (expr instanceof Variable) 
    {
        return cb => 
        {
            const value = cb.importVariableValue(expr);
            return { cb: cb, value };
        }
    }
    else if (expr instanceof Load) 
    {
        const addr = expressionValue(expr.address);

        return cb => 
        {
            const a = addr(cb);
            const value = new Value();
            cb.add(new LoadOperation(value, a.value, expr.width))
            return { cb: cb, value };
        }

    }
    else if (expr instanceof Binary) 
    {
        if (logicOperators.includes(expr.operator)) 
        {
            return ternary(expr, new Constant(1), new Constant(0));
        }
        else
        {
            const l = expressionValue(expr.left);
            const r = expressionValue(expr.right);

            switch (expr.operator) 
            {
                case BinaryOperator.Add: return arithmetic(l, r, Arithmetic.Add);
                case BinaryOperator.Sub: return arithmetic(l, r, Arithmetic.Sub);
                case BinaryOperator.Mul: return arithmetic(l, r, Arithmetic.Mul);
                case BinaryOperator.Shl: return arithmetic(l, r, Arithmetic.Shl);
                case BinaryOperator.Shr: return arithmetic(l, r, Arithmetic.Shr);
                case BinaryOperator.BitAnd: return arithmetic(l, r, Arithmetic.BitAnd);
                case BinaryOperator.BitOr: return arithmetic(l, r, Arithmetic.BitOr);
                default:
                    assert(expr.operator == BinaryOperator.BitXor)
                    return arithmetic(l, r, Arithmetic.BitXor);
            }
        }

    }
    else 
    {
        assert(expr instanceof Ternary);
        return ternary(expr.condition, expr.then, expr.otherwise);
    }
}

const pullThroughIfNeedBe = (l: MaterializedValue, r: MaterializedValue) => 
{
    if (l.cb !== r.cb) 
    {
        const t = new Variable();
        l.cb.exportVariableValue(t, l.value);
        return r.cb.importVariableValue(t);
    }

    return l.value;
}

const logic = (left: ValueMaterializer, right: ValueMaterializer, cond: Relation, entry: CodeBuilder, then: CodeBuilder, owise: CodeBuilder) => 
{
    const l = left(entry);
    const r = right(l.cb);

    r.cb.terminateBranch(then, owise, new TacConditional(pullThroughIfNeedBe(l, r), r.value, cond))
}

function expressionControl({ expr, entry, then, owise }: {
    expr: Expression;
    entry: CodeBuilder;
    then: CodeBuilder;
    owise: CodeBuilder;
}): void 
{
    if (expr instanceof Binary && logicOperators.includes(expr.operator)) {
        if(comparisonOperators.includes(expr.operator)) {
            const l = expressionValue(expr.left);
            const r = expressionValue(expr.right);

            switch (expr.operator) {
                case BinaryOperator.Eq: logic(l, r, Relation.Equal, entry, then, owise); return;
                case BinaryOperator.Ne: logic(l, r, Relation.Equal, entry, owise, then); return;
                case BinaryOperator.Lt: logic(l, r, Relation.Less, entry, then, owise); return;
                case BinaryOperator.Gt: logic(r, l, Relation.Less, entry, then, owise); return;
                case BinaryOperator.Le: logic(r, l, Relation.Less, entry, owise, then); return;
                default:
                    assert(expr.operator == BinaryOperator.Ge)
                    logic(l, r, Relation.Less, entry, owise, then);
                    return;
            }
        }
        else 
        {
            const second = new CodeBuilder();
            expressionControl({ expr: expr.right, entry: second, then, owise })

            if (expr.operator == BinaryOperator.LogAnd) {
                expressionControl({ expr: expr.left, entry: entry, then: second, owise })
            }
            else {
                assert(expr.operator == BinaryOperator.LogOr)
                expressionControl({ expr: expr.left, entry: entry, then, owise: second })
            }

            return;
        }
    }

    expressionControl({ expr: expr.ne(0), entry: entry, then, owise })
}

const enum Continuation {
    Proceed, Restart, Break, Return
}

interface IndirectTargets {
    exit: CodeBuilder
    loop?: {
        start: CodeBuilder;
        end: CodeBuilder;
    }
}

interface JumpTargets extends IndirectTargets {
    next: CodeBuilder
}

function realizeBlock(stmt: Statement, targets: JumpTargets): CodeBuilder 
{
    const [cont, bbb] = statement(stmt, targets);

    const first = new CodeBuilder()
    const last = bbb(first)

    switch (cont)
    {
        case Continuation.Proceed:
            last.terminateStraight(targets.next)
            break

        case Continuation.Restart:
            assert(targets.loop !== undefined)
            last.terminateStraight(targets.loop.start)
            break

        case Continuation.Break:
            assert(targets.loop !== undefined)
            last.terminateStraight(targets.loop.end)
            break

        default:
            assert(cont === Continuation.Return)
            last.terminateStraight(targets.exit)
    }

    return first
}

function statement(stmt: Statement, targets: IndirectTargets): [Continuation, StatementGenerator] 
{
    if (stmt instanceof Assignment) 
    {
        const val = expressionValue(stmt.value)
        
        return [Continuation.Proceed, 
            cb => {
                const v = val(cb)
                let value = v.value

                if(!(v.cb.getDefinition(value) instanceof Operation))
                {
                    const copy = new Value()
                    v.cb.add(new CopyOperation(copy, value))
                    value = copy
                }

                v.cb.exportVariableValue(stmt.target, value)
                return v.cb;
            }
        ]
    }
    else if (stmt instanceof Store) 
    {
        const val = expressionValue(stmt.value)
        const addr = expressionValue(stmt.address)

        return [Continuation.Proceed, 
            cb => {
                const v = val(cb)
                const a = addr(v.cb)

                a.cb.add(new StoreOperation(pullThroughIfNeedBe(v, a), a.value, stmt.width))
                return a.cb
            }
        ]
    }
    else if (stmt instanceof Block) 
    {
        let ret: StatementGenerator[] = []
        let rCont = Continuation.Proceed

        for (let i = 0; i < stmt.stmts.length; i++) 
        {
            const [cont, bbb] = statement(stmt.stmts[i], targets);
            ret.push(bbb);

            if (cont !== Continuation.Proceed) 
            {
                if (i !== stmt.stmts.length - 1) 
                {
                    // TODO warn dead code
                }

                rCont = cont
                break
            }
        }

        return [rCont, ret.reduce((acc, bbb) => (bb) => bbb(acc(bb)), bb => bb)];
    }
    else if (stmt instanceof Branch)
    {
        return [
            Continuation.Proceed,
            entry => {
                const exit = new CodeBuilder()
                expressionControl({
                    expr: stmt.condition,
                    entry: entry,
                    then: realizeBlock(stmt.then, { ...targets, next: exit }),
                    owise: stmt.otherwise !== undefined
                        ? realizeBlock(stmt.otherwise, { ...targets, next: exit })
                        : exit
                })

                return exit
            }
        ]
    }
    else if (stmt instanceof Loop) 
    {
        return [
            Continuation.Proceed,
            (entry) => 
            {
                let start = new CodeBuilder()

                if (entry.hasOps) {
                    entry.terminateStraight(start)
                } else {
                    start = entry
                }

                const end = new CodeBuilder()

                expressionControl({
                    expr: stmt.preCondition,
                    entry: start,
                    then: realizeBlock(stmt.body, {
                        exit: targets.exit,
                        next: start,
                        loop: { start: start, end: end }
                    }),
                    owise: end
                })

                return end
            }
        ]
    }
    else
    {
        assert(stmt instanceof Jump);

        switch (stmt.kind) {
            case JumpKind.Break: return [Continuation.Break, cb => cb];
            case JumpKind.Continue: return [Continuation.Restart, cb => cb];
            case JumpKind.Return: return [Continuation.Return, cb => cb];
        }
    }
}

export function generateCfg(ast: Procedure): BasicBlock 
{
    const entry = new CodeBuilder()

    ast.args.forEach((a, idx) => {
        const val = new Value()
        entry.add(new ArgumentOperation(idx, val))
        entry.exportVariableValue(a, val);
    });

    const exit = new CodeBuilder()
    const [cont, bbb] = statement(ast.body, { exit });
    assert([Continuation.Proceed, Continuation.Return].includes(cont));

    const first = new CodeBuilder()
    const last = bbb(first)

    entry.terminateStraight(first)
    last.terminateStraight(exit)

    ast.retvals.forEach((r, idx) => {
        exit.add(new RetvalOperation(idx, exit.importVariableValue(r)))
    });

    exit.terminateExit()

    return CfgBuilder.build(entry)
}
