import assert from 'assert';
import test from 'node:test';
import { compile } from '../src/compiler';
import Procedure from '../src//program/procedure';
import { Constant } from '../src/program/expression';
import { LoadStoreWidth } from '../src//program/common';
import { disassemble } from '../src/specific/disassembler';

test("returnArg", () => {
	assert.strictEqual(disassemble(compile(Procedure.build($ => {
		const [a] = $.args
		$.return(a)
	}))),
`     bx lr`
)})

test("multiply", () => {
	assert.strictEqual(disassemble(compile(Procedure.build($ => {
		const [a, b] = $.args
		$.return(a.mul(b))
	}))),
`     muls r0, r1
     bx   lr`
)})

test("square", () => {
	assert.strictEqual(disassemble(compile(Procedure.build($ => {
		const [a] = $.args
		$.return(a.mul(a))
	}))),
`     muls r0, r0
     bx   lr`
)})

test("branch", () => {
	assert.strictEqual(disassemble(compile(Procedure.build($ => {
		const [a] = $.args
		$.branch(a.sub(3), new Constant(100).store(a.mul(69), LoadStoreWidth.U1))
	}))),
`     cmp  r0, #3
     beq  l0
     movs r1, #69
     muls r0, r1
     strb r0, [r1, #31]
l0:  bx   lr`
)});

test("min", () => {
	assert.strictEqual(disassemble(compile(Procedure.build($ => {
		const [l, m] = $.args
		$.return(l.lt(m).ternary(l, m))
	}))),
`     cmp r0, r1
     blo l0
     mov r0, r1
l0:  bx  lr`
)})

test("sort", () => {
	assert.strictEqual(disassemble(compile(Procedure.build($ => {
		const [x, y] = $.args
		$.branch(x.lt(y), 
			b => b.return(x, y),
			b => b.return(y, x),
		)
	}))),
`     cmp r0, r1
     blo l0
     mov r2, r0
     mov r0, r1
     mov r1, r2
l0:  bx  lr`
)})

test("copy", () => {
	assert.strictEqual(disassemble(compile(Procedure.build($ => {
		const [d, s, e] = $.args
		$.loop(d.ne(e), b => {
			b.add(d.store(s.load(LoadStoreWidth.U1), LoadStoreWidth.U1))
			b.add(d.increment())
			b.add(s.increment())
		})
	}))),
`l0:  cmp  r0, r2
     beq  l1
     ldrb r3, [r1]
     strb r3, [r0]
     adds r1, r1, #1
     adds r0, r0, #1
     b    l0
l1:  bx   lr`
)})

test("reality", () => {
	assert.strictEqual(disassemble(compile(Procedure.build($ => 
	{
		const cr = new Constant(0x40023000);
		const sr = new Constant(0x40023004);

		const [dst, src, end] = $.args;
		const ret = $.declare(-1)

		$.add(cr.store(cr.load().bitand((~0x420) >>> 0).bitor(0x400))),

		$.loop(dst.lt(end), $ =>
		{
			const i = $.declare(16)
			$.loop(i.ne(0), $ =>
			{
				const x = $.declare(src.load())
				$.add(src.increment(4))
				const y = $.declare(src.load())
				$.add(src.increment(4))

				$.add(dst.store(x))
				$.add(dst.increment(4))
				$.add(dst.store(y))
				$.add(dst.increment(4))

				$.add(i.decrement())
			})

			$.loop(sr.load().bitand(0xdeff).ne(0xc0de), () => {})

			$.add(ret.set(sr.load().bitand(0x3f8)))

			$.branch(ret.ne(0), b => b.break())
		}),

		cr.store(cr.load().bitand((~0x420) >>> 0).bitor(0x020)),
		$.return(ret)
	}))),
`     push  {r4, r5, lr}
     mov   r4, r0
     ldr   r0, L0 ; 0x40023000
     ldr   r3, [r0]
     ldr   r5, L1 ; 0xfffffbdf
     ands  r3, r5
     movs  r5, #128
     lsls  r5, r5, #3
     orrs  r3, r5
     str   r3, [r0]
     movs  r0, #0
     mvns  r0, r0
l0:  cmp   r4, r2
     bhs   l3
     movs  r0, #16
l1:  ldmia r1!, {r3, r5}
     stmia r4!, {r3, r5}
     subs  r0, r0, #1
     bne   l1
l2:  ldr   r0, L0 ; 0x40023000
     ldr   r0, [r0, #4]
     ldr   r3, L2 ; 0x0000deff
     ands  r0, r3
     ldr   r3, L3 ; 0x0000c0de
     cmp   r0, r3
     bne   l2
     ldr   r0, L0 ; 0x40023000
     ldr   r0, [r0, #4]
     movs  r3, #254
     lsls  r3, r3, #2
     ands  r0, r3
     beq   l0
l3:  pop   {r4, r5, pc}
     nop   
L0:  0x40023000
L1:  0xfffffbdf
L2:  0x0000deff
L3:  0x0000c0de`
)})

test("logAndSingle", () => {
	assert.strictEqual(disassemble(compile(Procedure.build($ => {
		const [a] = $.args
		$.branch(a.ge(0).logand(a.lt(10)), new Constant(69).store(420))
	}))),
`     cmp  r0, #0
     blo  l0
     cmp  r0, #10
     bhs  l0
     movs r1, #210
     lsls r1, r1, #1
     movs r0, #69
     str  r1, [r0]
l0:  bx   lr`
)})

test("logAndOrChain", () => {
	assert.strictEqual(disassemble(compile(Procedure.build($ => {
		const [a] = $.args
		$.branch(
			a.ge(0)
			.logand(
				a.lt(10)
				.logor(
					a.eq(1337)
				)
			), 
			new Constant(69).store(420)
		)
	}))),
`     cmp  r0, #0
     blo  l1
     cmp  r0, #10
     blo  l0
     ldr  r1, L0 ; 0x00000539
     cmp  r0, r1
     bne  l1
l0:  movs r1, #210
     lsls r1, r1, #1
     movs r0, #69
     str  r1, [r0]
l1:  bx   lr
L0:  0x00000539`
)})

test("ternaryConditional", () => {
	assert.strictEqual(disassemble(compile(Procedure.build($ => {
		const [a] = $.args
		$.branch(
			a.load().ge(a.gt(123).ternary(456, 789)),
			new Constant(69).store(420)
		)
	}))),
`     ldr  r1, [r0]
     cmp  r0, #123
     bhi  l0
     ldr  r0, L0 ; 0x00000315
     b    l1
l0:  movs r0, #228
     lsls r0, r0, #1
l1:  cmp  r1, r0
     blo  l2
     movs r1, #210
     lsls r1, r1, #1
     movs r0, #69
     str  r1, [r0]
l2:  bx   lr
L0:  0x00000315`
)})

test("parabola", () => 
{

	assert.strictEqual(disassemble(compile(Procedure.build($ =>
		{
			const [x] = $.args
			$.return(x.mul(x).sub(x.mul(2)).add(1))
		}))),
`     mov  r1, r0
     muls r1, r0
     lsls r0, r0, #1
     subs r0, r1, r0
     adds r0, r0, #1
     bx   lr`
)})

test("call", () => 
{
	const f = Procedure.build($ => {
		const [x] = $.args
		$.return(x.mul(x))
	})

	const g = Procedure.build($ => {
		const [x] = $.args
		const [xsq] = $.call(f, x)
		$.return(xsq.sub(x.mul(2)).add(1))
	})

	assert.strictEqual(disassemble(compile(g)),
`     push {r4, lr}
     mov  r4, r0
     bl   0x00000004 # relocation
     lsls r1, r4, #1
     subs r0, r0, r1
     adds r0, r0, #1
     pop  {r4, pc}`
)})

