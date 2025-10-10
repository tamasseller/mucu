import assert from "assert";

import { Assignment, Block, Branch, Call, Diagnostic, FormattedNumber, Jump, JumpKind, Loop, Statement, Store, WriteToBuffer } from "../program/statement";
import { Binary, Constant, Expression, Load, ReadFromBuffer, Ternary, Variable } from "../program/expression";
import { asBytes, LoadStoreWidth } from "../program/common";
import { BinaryOperator, evaluteOperator } from "../program/binaryOperator";
import { Special } from "./special";
import { Observer } from "./observer";
import Procedure from "../program/procedure";
import { MemoryAccessor } from "./accessor";

function formatHex(v: number, pad: number): string {
    return "0x" + ("0".repeat(pad) + v.toString(16)).slice(-pad);
}

function format32(v: number): string {
    return formatHex(v, 8)
}

class EvaluationResult
{
    constructor(readonly flushHandles: any[], readonly value: Promise<number>) {}

    static literal(value: number): EvaluationResult {
        return new EvaluationResult([], Promise.resolve(value))
    }
}

const enum BlockEscape
{
    Proceed, RestartBlock, ExitBlock, Terminate
}

interface ExecuteResult 
{
    escape: BlockEscape
    flushHandles: any[]
}

class BufferMapping
{
    readonly entries: {base: number, buffer: Buffer}[] = []
    
    private get nextOffset()
    {
        if(this.entries.length === 0) return 0;

        const last = this.entries[this.entries.length - 1]
        return last.base + last.buffer.length
    }

    private find(address: number, width: LoadStoreWidth): { base: number; buffer: Buffer; }
    {
        const end = address + asBytes(width)

        for(const e of this.entries)
        {
            if(e.base <= address && end <= e.base + e.buffer.length)
            {
                return e
            }
        }

        throw new Error(`No buffer at ${format32(address)} - ${format32(end)}`)
    }

    add(b: Buffer): number
    {
        const off = this.nextOffset
        this.entries.push({base: off, buffer: b})

        return off;
    }

    read(address: number, width: LoadStoreWidth): number 
    {
        const { base, buffer } = this.find(address, width)

        switch(width)
        {
            case LoadStoreWidth.U1: return buffer.readUInt8(address - base)
            case LoadStoreWidth.U2: return buffer.readUInt16LE(address - base)
            case LoadStoreWidth.U4: return buffer.readUInt32LE(address - base)
        }
    }

    write(address: number, value: number, width: LoadStoreWidth): any 
    {
        const { base, buffer } = this.find(address, width)

        switch(width)
        {
            case LoadStoreWidth.U1: buffer.writeUInt8(value, address - base); break
            case LoadStoreWidth.U2: buffer.writeUInt16LE(value, address - base); break
            case LoadStoreWidth.U4: buffer.writeUInt32LE(value, address - base); break
        }
    }
}

class Context
{
    readonly variables = new Map<Variable, EvaluationResult>()

    constructor(readonly accessor: MemoryAccessor, readonly buffers: BufferMapping) {}

    private load(address: number, width: LoadStoreWidth): EvaluationResult 
    {
        let handle: any;

        const promise = new Promise<number>((res, rej) => {
            switch(width)
            {
                case LoadStoreWidth.U1:
                    handle = this.accessor.read(address, 1, (b) => res(b.readUInt8()), rej)
                    break

                case LoadStoreWidth.U2:
                    handle = this.accessor.read(address, 2, (b) => res(b.readUInt16LE()), rej)
                    break

                case LoadStoreWidth.U4:
                    handle = this.accessor.read(address, 4, (b) => res(b.readUInt32LE()), rej)
                    break
            }
        })

        return {flushHandles: [handle], value: promise}
    }

    private store(address: number, value: number, width: LoadStoreWidth): any 
    {
        let b: Buffer;
        switch(width)
        {
            case LoadStoreWidth.U1:
                b = Buffer.alloc(1)
                b.writeUInt8(value)
                break

            case LoadStoreWidth.U2:
                b = Buffer.alloc(2)
                b.writeUInt16LE(value)
                break

            case LoadStoreWidth.U4:
                b = Buffer.alloc(4)
                b.writeUInt32LE(value)
                break
        }

        return this.accessor.write(address, b, () => {}, e => {throw e})
    }

    flush(handles: any[]): void {
        this.accessor.flush(handles)
    }

    set(variable: Variable, value: EvaluationResult): void {
        this.variables.set(variable, value)
    }

    get(variable: Variable): EvaluationResult
    {
        if(this.variables.has(variable))
        {
            return this.variables.get(variable)!
        }
        else
        {
            throw new Error("Runtime error: tried to read unset variable")
        }
    }

    walkConstant(e: Constant): EvaluationResult {
        return EvaluationResult.literal(e.value)
    }

    walkVariable(e: Variable): EvaluationResult {
        return this.get(e)
    }

    async walkLoad(e: Load): Promise<EvaluationResult> {
        return this.load((await this.evaluate(e.address)), e.width)
    }

    async walkBinary(e: Binary): Promise<EvaluationResult> 
    {
        const [lval, rval] = await Promise.all([
            this.walkExpression(e.left),
            this.walkExpression(e.right)
        ]) ;

        return new EvaluationResult([...lval.flushHandles, ...rval.flushHandles],
            Promise.all([lval.value, rval.value]).then(arr => 
                evaluteOperator(e.operator, arr[0], arr[1]))
        )
    }

    async walkTernary(e: Ternary): Promise<EvaluationResult | PromiseLike<EvaluationResult>> 
    {
        const cond = await this.walkExpression(e.condition);

        this.flush(cond.flushHandles)
        const ret = (!!(await cond.value)) ? e.then : e.otherwise

        return await this.walkExpression(ret);
    }

    async walkRead(e: ReadFromBuffer): Promise<EvaluationResult> 
    {
        const addr = await this.walkExpression(e.address);

        return {
            flushHandles: addr.flushHandles,
            value: addr.value.then(v => this.buffers.read(v, e.width))
        }
    }

    async walkExpression(e: Expression): Promise<EvaluationResult>
    {
        if(e instanceof Constant)
        {
            return this.walkConstant(e)
        }
        else if(e instanceof Variable)
        {
            return this.walkVariable(e)
        }
        else if(e instanceof Load)
        {
            return this.walkLoad(e)
        }
        else if(e instanceof Binary)
        {
            return this.walkBinary(e)
        }
        else if(e instanceof Ternary)
        {
            return this.walkTernary(e)
        }
        else
        {
            assert(e instanceof ReadFromBuffer)
            return this.walkRead(e)
        }
    }

    async evaluate(e: Expression): Promise<number>
    {
        const res = await this.walkExpression(e)

        if(res.flushHandles.length)
        {
            this.flush(res.flushHandles)
        }

        return await res.value
    }

    async executeBlock(s: Block, observer: Observer | undefined): Promise<ExecuteResult>
    {
        const handles: any[] = []

        for(const stmt of s.stmts)
        {
            const result = await this.execute(stmt, observer)
            handles.push(...result.flushHandles)

            if(result.escape != BlockEscape.Proceed)
            {
                return {
                    flushHandles: handles, 
                    escape: result.escape
                }
            }
        }

        return {flushHandles: handles, escape: BlockEscape.Proceed};
    }

    async executeAssignment(s: Assignment, observer: Observer | undefined): Promise<ExecuteResult>
    {
        observer?.observeAssignment(s)

        const rhs = await this.walkExpression(s.value)
        this.set(s.target, rhs);
        
        return {flushHandles: [...rhs.flushHandles], escape: BlockEscape.Proceed};
    }

    async executeStore(s: Store, observer: Observer | undefined): Promise<ExecuteResult>
    {
        observer?.observeStore(s)

        const lval = await this.evaluate(s.address)
        const rval = await this.evaluate(s.value)

        return {escape: BlockEscape.Proceed, flushHandles: [
            this.store(lval, rval, s.width)
        ]};
    }

    async executeBranch(s: Branch, observer: Observer | undefined): Promise<ExecuteResult>
    {
        const cond = await this.evaluate(s.condition)
        const take = cond != 0

        observer?.observeBranch(s, take)

        if(take)
        {
            observer?.observeEntry()
            const res = await this.execute(s.then, observer);
            observer?.observeExit()
            return res;
        } 
        else if(s.otherwise)
        {
            observer?.observeEntry()
            const res = await this.execute(s.otherwise, observer);
            observer?.observeExit()
            return res;
        }

        return {flushHandles: [], escape: BlockEscape.Proceed};
    }

    static hasLoad(e: Expression): boolean
    {
        if(e instanceof Load)
        {
            return true;
        }
        else if(e instanceof Binary)
        {
            return Context.hasLoad(e.left) || Context.hasLoad(e.right);
        }

        return false;
    }

    async executeWait(addr: Expression, mask: Expression, value: Expression, observer: Observer | undefined): Promise<ExecuteResult>
    {
        const ares = await this.walkExpression(addr)
        const mres = await this.walkExpression(mask)
        const vres = await this.walkExpression(value)

        this.flush([...ares.flushHandles, ...mres.flushHandles, ...vres.flushHandles])
        const [a, m, v] = await Promise.all([ares.value, mres.value, vres.value])

        observer?.observeWait(a, m, v)

        return {
            escape: BlockEscape.Proceed,
            flushHandles: [this.accessor.wait(a, m, v, () => {}, e => {throw e})]
        }
    }

    tryFitWait(s: Loop, observer: Observer | undefined): Promise<ExecuteResult> | undefined
    {
        const isConstant = (e: Expression) => !Context.hasLoad(e)
        const isConstLoad = (e: Expression) => e instanceof Load && isConstant(e.address)
        const isMaskedLoad = (e: Expression) => 
            e instanceof Binary 
            && e.operator == BinaryOperator.BitAnd
            && ((  isConstLoad(e.left) && isConstant(e.right))
                || isConstLoad(e.right) && isConstant(e.left))

        const isMaskedLoadCheck = (e: Expression) => 
            e instanceof Binary 
            && e.operator == BinaryOperator.Ne
            && ((  isMaskedLoad(e.left) && isConstant(e.right))
                || isMaskedLoad(e.right) && isConstant(e.left))

        const isEmptyBlock = (e: Statement) => 
            e instanceof Block && e.stmts.length === 0

        if(!isEmptyBlock(s.body) || !isMaskedLoadCheck(s.preCondition))
        {
            return undefined
        }

        const cond = s.preCondition as Binary
        const [addrMask, value] = isMaskedLoad(cond.left) 
            ? [cond.left, cond.right] 
            : [cond.right, cond.left]

        const am = addrMask as Binary
        const [load, mask] = isConstLoad(am.left)
            ? [am.left, am.right]
            : [am.right, am.left]
        
        const addr = (load as Load).address
        return this.executeWait(addr, mask, value, observer)
    }

    async executeLoop(s: Loop, observer: Observer | undefined): Promise<ExecuteResult>
    {
        const handles: any[] = []

        const ret = this.tryFitWait(s, observer)
        if(ret !== undefined) return ret
        
        observer?.observeLoop(s)

        while(true)
        {
            const cond = await this.evaluate(s.preCondition)
            if(cond == 0)
            {
                break;
            }

            observer?.observeEntry()
            const result = await this.execute(s.body, observer);
            observer?.observeExit()

            handles.push(...result.flushHandles)

            if(result.escape == BlockEscape.ExitBlock)
            {
                break;
            } 
            else if(result.escape == BlockEscape.Terminate)
            {
                return {flushHandles: handles, escape: BlockEscape.Terminate};
            }
        }

        return {flushHandles: handles, escape: BlockEscape.Proceed};
    }

    async executeJump(s: Jump, observer: Observer | undefined): Promise<ExecuteResult>
    {
        observer?.observeJump(s)

        switch(s.kind)
        {
            case JumpKind.Break: return {flushHandles: [], escape: BlockEscape.ExitBlock}
            case JumpKind.Continue: return {flushHandles: [], escape: BlockEscape.RestartBlock}
            case JumpKind.Return: return {flushHandles: [], escape: BlockEscape.Terminate}
        }
    }

    async executeCall(s: Call, observer: Observer): Promise<ExecuteResult> 
    {
        observer?.observeCall(s)

        assert(s.args.length == s.procedure.args.length)
        assert(s.retvals.length <= s.procedure.retvals.length)

        const ctx = new Context(this.accessor, this.buffers);

        const ers = await Promise.all(s.args.map(a => this.walkExpression(a)))
        s.procedure.args.forEach((v, idx) => ctx.set(v, ers[idx]));

        const fhs = await ctx.run(s.procedure.body, observer);

        s.retvals.forEach((v, idx) => this.set(v, ctx.get(s.procedure.retvals[idx])))

        return {flushHandles: fhs, escape: BlockEscape.Proceed}
    }

    async executeWrite(s: WriteToBuffer, observer: Observer): Promise<ExecuteResult>
    {
        const [addr, val] = await Promise.all([
            this.walkExpression(s.address),
            this.walkExpression(s.value)
        ])

        this.flush([...addr.flushHandles, ...val.flushHandles])
        const [a, v] = await Promise.all([addr.value, val.value]);

        this.buffers.write(a, v, s.width)

        return { flushHandles: [], escape: BlockEscape.Proceed }
    }

    async executeDiagnostic(s: Diagnostic, observer: Observer): Promise<ExecuteResult> 
    {
        const promises = s.content.map(async c => 
        {
            if(c instanceof FormattedNumber)
            {
                const n = await this.evaluate(c.value)
                const s = n.toString(c.radix)
                return c.minWidth < s.length ? s : ("0".repeat(c.minWidth) + s).slice(-c.minWidth)
            }
            else
            {
                return c
            }
        })
        
        observer.observerDiagnostic((await Promise.all(promises)).join(""))

        return {
            escape: BlockEscape.Proceed,
            flushHandles: []
        }
    }

    async executeSpecial(s: Special, observer: Observer | undefined): Promise<ExecuteResult>
    {
        observer?.observeSpecial(s)

        return {
            escape: BlockEscape.Proceed,
            flushHandles: [this.accessor.special(s.param)]
        }
    }

    async execute(s: Statement, observer: Observer | undefined): Promise<ExecuteResult>
    {
        if(s instanceof Block)
        {
            return this.executeBlock(s, observer)
        }
        else if(s instanceof Assignment)
        {
            return this.executeAssignment(s, observer)
        }
        else if(s instanceof Store)
        {
            return this.executeStore(s, observer)
        }
        else if(s instanceof Branch)
        {
            return this.executeBranch(s, observer)
        }
        else if(s instanceof Loop)
        {
            return this.executeLoop(s, observer)
        }
        else if(s instanceof Special)
        {
            return this.executeSpecial(s, observer)
        }
        else if(s instanceof Jump)
        {
            return this.executeJump(s, observer)
        }
        else if(s instanceof Call)
        {
            return this.executeCall(s, observer)
        }
        else if(s instanceof WriteToBuffer)
        {
            return this.executeWrite(s, observer)
        }
        else 
        {
            assert(s instanceof Diagnostic)
            return this.executeDiagnostic(s, observer)
        }
    }
    
    public async run(root: Block, observer: Observer | undefined): Promise<any[]>
    {
        const result = await this.executeBlock(root, observer);
        assert([BlockEscape.Proceed, BlockEscape.Terminate].includes(result.escape))

        return result.flushHandles
    }
}

export default class Interpreter
{   
    readonly accessor: MemoryAccessor
    readonly observerBuilder?: (args: Variable[], retvals: Variable[]) => Observer;

    constructor(accessor: MemoryAccessor, observerBuilder?: (args: Variable[], retvals: Variable[]) => Observer)
    {
        this.accessor = accessor
        this.observerBuilder = observerBuilder
    }

    async run(procedure: Procedure, ...args: (number | Buffer)[]): Promise<number[]> 
    {
        if(args.length !== procedure.args.length)
        {
            throw new Error(`Runtime error: expected ${procedure.args.length} arguments, got ${args.length}`)
        }

        const buffers = new BufferMapping()
        const mappedArgs = args.map<number>(a => a instanceof Buffer ? buffers.add(a) : a as number)

        const ctx = new Context(this.accessor, buffers);
        procedure.args.forEach((v, idx) => ctx.set(v, EvaluationResult.literal(mappedArgs[idx])));

        const observer = this.observerBuilder?.(procedure.args, procedure.retvals)

        const fvals = await ctx.run(procedure.body, observer)
        this.accessor.flush(fvals)

        return Promise.all((procedure.retvals.map(v => ctx.get(v))).map(v => v.value))
    }
}
