import test, { suite } from "node:test";
import Procedure from "../src/program/procedure";
import { compile } from "../src/compiler";
import { disassemble } from "../src/specific/disassembler";
import assert from "assert";
import { Executable, link, RelocatableObject } from "../src/linker";
import { Block, Branch, Call, Loop, Statement } from "../src/program/statement";
import { sign } from "crypto";

function *walkCalls(stmt: Statement): Generator<Call, void, unknown>
{
    if(stmt instanceof Call) 
    {
        yield stmt
    }
    else if(stmt instanceof Loop) 
    {
        yield* walkCalls(stmt.body)
    }
    else if(stmt instanceof Branch) 
    {
        yield* walkCalls(stmt.then)

        if(stmt.otherwise !== undefined)
        {
            yield* walkCalls(stmt.otherwise)
        }
    }
    else if(stmt instanceof Block) 
    {
        for(const s of stmt.stmts)
        {
            yield* walkCalls(s)
        }
    }
}

function *findCallees(p: Procedure, calls = new Set<Procedure>()): Generator<Procedure, void, unknown>
{
    if(!calls.has(p))
    {
        yield p

        calls.add(p)

        for(const c of walkCalls(p.body))
        {
            findCallees(c.procedure, calls)
        }
    }
}

function build(
    options: {
        stack?: number,
        dataStart?: number,
        codeStart?: number,
    }, 
    p: Procedure, 
    ...args: (number | Buffer)[]): Executable
{
    const code: RelocatableObject[] = []
    
    for(const c of findCallees(p))
    {
        code.push(compile(c))
    }
    
    return link(p, [{
        objects: code,
    }])
}

suite("linker", {}, () => 
{
//     test("passThrough", () => 
//     {
//         const f = compile(Procedure.build($ => {
//             const [x] = $.args
//             $.return(x.mul(x))
//         }))

//         const img = link(f.symbol, [{startAddress: 0x2000_0000, objects: [f]}])

//         assert.deepStrictEqual(img.fragments.length, 1)
//         assert.deepStrictEqual(img.fragments[0].address, 0x2000_0000)
//         assert.deepStrictEqual(img.entry, img.fragments[0].address)
//         assert.deepStrictEqual(img.symbols.size, 1)
//         assert.deepStrictEqual(img.symbols.get(f.symbol), img.entry)

//         assert.deepStrictEqual(disassemble(img.fragments[0].content), 
// `     muls r0, r0
//      bx   lr`
//         )
//     })

    test("twoCalls", () => 
    {
        const f = Procedure.build($ => {
            const [x] = $.args
            $.return(x.mul(x))
        })

        const g = Procedure.build($ => {
            const [x, y] = $.args
            const [xsq] = $.call(f, x)
            const [ysq] = $.call(f, y)
            $.return(xsq.add(ysq))
        })

        const img = link(f, [{startAddress: 0x2000_0000, objects: [compile(f), compile(g)]}])

        assert.deepStrictEqual(img.fragments.length, 1)
        assert.deepStrictEqual(img.fragments[0].address, 0x2000_0000)
        assert.deepStrictEqual(img.entry, img.fragments[0].address)
        assert.deepStrictEqual(img.symbols.size, 1)
        assert.deepStrictEqual(img.symbols.get(f), img.entry)

        assert.deepStrictEqual(disassemble(img.fragments[0].content), 
`     muls r0, r0
     bx   lr`
        )
    })
})