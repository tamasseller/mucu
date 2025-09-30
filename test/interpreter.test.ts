import {MemoryAccessor} from '../src/interpreter/accessor'
import Interpreter, {} from '../src/interpreter/intepreter'
import {BufferAccessor} from '../src/interpreter/buffer'

import test, { suite } from 'node:test';
import assert from 'node:assert';
import Procedure from '../src/program/procedure';
import { LoadStoreWidth } from '../src/program/common';
import { Constant } from '../src/program/expression';

class MockAccessor implements MemoryAccessor
{
    readonly log: string[] = []
    readonly mem = new Map<number, number>()
    private readonly queue: (()=>void)[] = []
    private done = 0

    write(address: number, values: Buffer, done: () => void, fail: (e: Error) => void): number 
    {
        let value: number

        switch(values.byteLength)
        {
            case 1:
                value = values.readUInt8()
                break

            case 2:
                value = values.readUInt16LE()
                break

            default:
                assert(values.byteLength == 4)
                value = values.readUInt32LE()
                break
        }

        this.queue.push(() => {
            this.mem.set(address, value)
        })

        this.log.push(`${this.queue.length} WRITE ${address} <- ${value}`)

        return this.queue.length
    }

    read(address: number, length: number, done: (v: Buffer) => void, fail: (e: Error) => void): number 
    {
        this.queue.push(() => 
        {
            const b = Buffer.alloc(length)
            const v = this.mem.get(address) ?? address + 1;
            switch(length)
            {
                case 4:
                    b.writeUint32LE(v)
                    break
                case 2:
                    b.writeUint16LE(v)
                    break
                default:
                    assert(length == 1)
                    b.writeUint8(v)
            }
            
            done(b)
        })

        this.log.push(`${this.queue.length} READ ${address}`)
        return this.queue.length
    }

    wait(address: number, mask: number, value: number): number {
        this.log.push(`${this.queue.length} WAIT ${address} & ${mask} == ${value}`)

        return this.queue.length
    }

    special(param: any) {
        throw new Error('Method not implemented.');
    }

    flush(handles: number[]): void 
    {
        if(handles.length)
        {
            const end = handles.reduce((a, b) => Math.max(a, b))
            // assert(end <= this.queue.length)

            this.log.push(`FLUSH ${end}`)

            if(this.done < end)
            {
                this.queue.slice(this.done, end).forEach(w => w())
                this.done = end
            }
        }
    }
}

suite("interpreter", {}, () => {
    test("storeConstantToConstant", async () => {
        const m = new MockAccessor()
        await new Interpreter(m).run(Procedure.build($ => $.add(new Constant(123).store(456))))
        assert.deepStrictEqual(m.log, ['1 WRITE 123 <- 456', 'FLUSH 1'])
        assert.deepStrictEqual([...m.mem.entries()], [[123, 456]])
    })

    test("storeVariableToConstant", async () => {
        const m = new MockAccessor()
        await new Interpreter(m).run(Procedure.build($ => {
            const [x] = $.args
            $.add(new Constant(123).store(x))
        }), 456)
        assert.deepStrictEqual(m.log, ['1 WRITE 123 <- 456', 'FLUSH 1'])
        assert.deepStrictEqual([...m.mem.entries()], [[123, 456]])
    })

    test("storeLoadToConstant", async () => {
        const m = new MockAccessor()
        await new Interpreter(m).run(Procedure.build($ => $.add(new Constant(123).store(new Constant(456).load()))))

        assert.deepStrictEqual(m.log, [
            '1 READ 456', 
            'FLUSH 1',
            '2 WRITE 123 <- 457', 
            'FLUSH 2'
        ])
    })

    test("storeVarToConstant", async () => {
        const m = new MockAccessor()

        await new Interpreter(m).run(Procedure.build($ => {
            const v = $.declare(456)
            $.add(new Constant(123).store(v))
        }))

        assert.deepStrictEqual(m.log, [
            '1 WRITE 123 <- 456', 
            'FLUSH 1'
        ])

        assert.deepStrictEqual([...m.mem.entries()], [[123, 456]])
    })

    test("loadLoadStoreStore", async () => {
        const m = new MockAccessor()

        await new Interpreter(m).run(Procedure.build($ => {
            const v = $.declare(new Constant(10).load())
            const u = $.declare(new Constant(20).load())
            $.add(new Constant(100).store(v))
            $.add(new Constant(200).store(u))
        }))

        assert.deepStrictEqual(m.log, [
            "1 READ 10",
            "2 READ 20",
            "FLUSH 1",
            "3 WRITE 100 <- 11",
            "FLUSH 2",
            "4 WRITE 200 <- 21",
            "FLUSH 4",
        ])

        assert.deepStrictEqual([...m.mem.entries()], [[100, 11], [200, 21]])
    })

    test("search", async () => {
        const m = new MockAccessor()
        const [r] = await new Interpreter(m).run(Procedure.build($ => {
            const p = $.declare(0)
            $.loop(p.load().ne(5), p.increment())
            $.return(p)
        }))
            
        assert.deepEqual(r, 4)

        assert.deepStrictEqual(m.log, [
            "1 READ 0",
            "FLUSH 1",
            "2 READ 1",
            "FLUSH 2",
            "3 READ 2",
            "FLUSH 3",
            "4 READ 3",
            "FLUSH 4",
            "5 READ 4",
            "FLUSH 5",
        ])

        assert.deepStrictEqual([...m.mem.entries()], [])    
    })

    test("fill", async () => {
        const m = new MockAccessor()
        await new Interpreter(m).run(Procedure.build($ => {
            const p = $.declare(0)
            $.loop(p.ne(4), $ => {
                $.add(p.store(69))
                $.add(p.increment())
            })
        }))
            
        assert.deepStrictEqual(m.log, [
            "1 WRITE 0 <- 69",
            "2 WRITE 1 <- 69",
            "3 WRITE 2 <- 69",
            "4 WRITE 3 <- 69",
            "FLUSH 4",
        ])

        assert.deepStrictEqual([...m.mem.entries()], [
            [0, 69], [1, 69], [2, 69], [3, 69]
        ])
    })

    test("copy", async () => {
        const m = new MockAccessor()
        await new Interpreter(m).run(
            Procedure.build($ => {
                const [src, dst, len] = $.args
                const end = $.declare(src.add(len))
                $.loop(src.ne(end), $ => {
                    $.add(dst.store(src.load()))
                    $.add(src.increment())
                    $.add(dst.increment())
                })
            }),
            10, 0, 2
        )

        assert.deepStrictEqual(m.log, [
            "1 READ 10",
            "FLUSH 1",
            "2 WRITE 0 <- 11",
            "3 READ 11",
            "FLUSH 3",
            "4 WRITE 1 <- 12",
            "FLUSH 4",
        ])

        assert.deepStrictEqual([...m.mem.entries()], [
            [0, 11], [1, 12]
        ])
    })

    test("memFib", async () => {
        const m = new MockAccessor()
        await new Interpreter(m).run(
            Procedure.build($ => {
                const [out, n] = $.args

                $.add(out.store(1))
                $.add((out.add(1)).store(1))

                const end = $.declare(out.add(n))
                $.add(out.increment(2))

                $.loop(out.ne(end), $ => {
                    $.add(out.store(out.sub(2).load().add(out.sub(1).load())))
                    $.add(out.increment())
                })
            }),
            10, 5
        )

        assert.deepStrictEqual(m.log, [
            "1 WRITE 10 <- 1",
            "2 WRITE 11 <- 1",
            "3 READ 10",
            "4 READ 11",
            "FLUSH 4",
            "5 WRITE 12 <- 2",

            "6 READ 11",
            "7 READ 12",
            "FLUSH 7",
            "8 WRITE 13 <- 3",

            "9 READ 12",
            "10 READ 13",
            "FLUSH 10",
            "11 WRITE 14 <- 5",
            "FLUSH 11",
        ])

        assert.deepStrictEqual([...m.mem.entries()], [
            [10, 1], [11, 1], [12, 2], [13, 3], [14, 5]
        ])
    })

    test("indexedCopy", async () => {
        const m = new MockAccessor()
        
        await new Interpreter(m).run(
            Procedure.build($ => {
                const i = $.declare(0)
                $.loop(i.ne(2), $ => {
                    $.add(i.store(i.add(10).load()))
                    $.add(i.increment())
                })
            })
        )

        assert.deepStrictEqual(m.log, [
            "1 READ 10",
            "FLUSH 1",
            "2 WRITE 0 <- 11",
            "3 READ 11",
            "FLUSH 3",
            "4 WRITE 1 <- 12",
            "FLUSH 4",
        ])
    })

    test("sieveOfErastothenes", async () => {
        const m = new MockAccessor()

        await new Interpreter(m).run(Procedure.build($ => {
            const [limit] = $.args
            const i = $.declare(0)
            $.loop(i.ne(limit), $ => 
            {
                $.add(i.store(i))
                $.add(i.increment())
            })

            $.add(i.set(2))

            $.loop(i.ne(limit), $ => 
            {
                const j = $.declare(i.shl(1))
                $.loop(j.lt(limit), $ => 
                {
                    $.add(j.store(0))
                    $.add(j.increment(i))
                })

                $.add(i.increment())
            })
        }), 100)

        assert.deepStrictEqual([...m.mem.values()].filter(x => x != 0), [
            1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 
            43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97
        ])       
    })

    test("fillBreak", async () => {
        const m = new MockAccessor()
        await new Interpreter(m).run(Procedure.build($ => {
            const p = $.declare(0)
            $.loop(new Constant(1), $ => {
                $.add(p.store(69))
                $.branch(p.lt(3), p.increment(), $ => $.break())
            })
        }))
            
        assert.deepStrictEqual(m.log, [
            "1 WRITE 0 <- 69",
            "2 WRITE 1 <- 69",
            "3 WRITE 2 <- 69",
            "4 WRITE 3 <- 69",
            "FLUSH 4",
        ])
    })

    test("fillContinueBreak", async () => {
        const m = new MockAccessor()

        await new Interpreter(m).run(Procedure.build($ => {
            const p = $.declare(0)
            $.loop(new Constant(1), $ => {
                $.add(p.store(69))
                $.add(p.increment())
                $.branch(p.lt(4), $ => $.continue())
                $.break()
            })
        }))

        assert.deepStrictEqual(m.log, [
            "1 WRITE 0 <- 69",
            "2 WRITE 1 <- 69",
            "3 WRITE 2 <- 69",
            "4 WRITE 3 <- 69",
            "FLUSH 4",
        ])
    })

    test("return", async () => {
        const m = new MockAccessor()
        const [ret] = await new Interpreter(m).run(Procedure.build(b => {
            const ret = b.declare(0)
            b.loop(new Constant(1), b => {
                b.branch(new Constant(1), b => {
                    b.add(ret.set(1)),
                    b.return(ret),
                    b.add(ret.set(2))
                })
                b.add(ret.set(3))
            }),
            b.add(ret.set(4))
            b.return(ret)
        }))

        assert.equal(ret, 1)
    })

    test("loadIntoRetval", async () => {
        const m = new MockAccessor()
        const [r] = await new Interpreter(m).run(Procedure.build($ => {
            $.return(new Constant(123).load())
        }))
        assert.deepStrictEqual(r, 124)
        assert.deepStrictEqual(m.log, ['1 READ 123', 'FLUSH 1'])
        assert.deepStrictEqual([...m.mem.entries()], [])
    })

    test("call", async () => {
        const m = new MockAccessor()

        const min = Procedure.build($ => {
            const [x, y] = $.args
            $.return(x.lt(y).ternary(x, y));
        })

        const max = Procedure.build($ => {
            const [x, y] = $.args
            $.return(x.lt(y).ternary(y, x));
        })

        const clamp = Procedure.build($ => 
        {
            const [x, y, z] = $.args
            const [m] = $.call(min, y, z)
            const [r] = $.call(max, x, m)
            $.return(r)
        })

        {
            const [ret] = await new Interpreter(m).run(clamp, 1, 2, 3)
            assert.equal(ret, 2)
        }

        {
            const [ret] = await new Interpreter(m).run(clamp, 1, 4, 3)
            assert.equal(ret, 3)
        }

        {
            const [ret] = await new Interpreter(m).run(clamp, 1, 0, 3)
            assert.equal(ret, 1)
        }
    })
    
    test("copyBlockFromBuffer", async () => 
    {
        const m = new MockAccessor()
        const b = new BufferAccessor(Buffer.from("asdqwe", "utf8"))
        await new Interpreter(m).run(Procedure.build($ => 
        {
            const [dst, end] = $.args
            const idx = $.declare(0)
            $.loop(dst.lt(end), $ => {
                $.add(dst.store(b.read(idx, LoadStoreWidth.U1), LoadStoreWidth.U1))
                $.add(dst.increment())
                $.add(idx.increment())
            })
        }), 69, 72)

        assert.deepStrictEqual(m.log, [
            "1 WRITE 69 <- 97",
            "2 WRITE 70 <- 115",
            "3 WRITE 71 <- 100",
            "FLUSH 3",
        ])
    })


    test("copyBlockToBuffer", async () => 
    {
        const m = new MockAccessor()
        const data = Buffer.alloc(3)
        const b = new BufferAccessor(data)
        await new Interpreter(m).run(Procedure.build($ => 
        {
            const [src, end] = $.args
            const idx = $.declare(0)
            $.loop(src.lt(end), $ => {
                $.add(b.write(src.load(LoadStoreWidth.U1), idx, LoadStoreWidth.U1))
                $.add(src.increment())
                $.add(idx.increment())
            })
        }), 69, 72)

        assert.deepStrictEqual(m.log, [
            "1 READ 69",
            "FLUSH 1",
            "2 READ 70",
            "FLUSH 2",
            "3 READ 71",
            "FLUSH 3"
        ])

        assert.deepStrictEqual([...data], [70, 71, 72])
    })
})
