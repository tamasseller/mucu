import assert from 'assert';
import test from 'node:test';
import { compile } from '../src/compiler';
import Procedure from '../src//program/procedure';
import { Constant } from '../src/program/expression';
import { LoadStoreWidth } from '../src//program/common';
import { disassemble } from '../src/specific/disassembler';

test("returnArg", () => {
	assert.strictEqual(disassemble(compile(Procedure.build(b => {
		const [a] = b.args
		b.return(a)
	}))),
`     bx lr`
)})

test("branch", () => {
	assert.strictEqual(disassemble(compile(Procedure.build($ => {
		const [a] = $.args
		$.branch(a.sub(3), new Constant(123).store(a.mul(69)))
	}))),
`     cmp  r0, #3
     beq  l0
     movs r1, #69
     muls r0, r1
     movs r1, #123
     str  r0, [r1]
l0:  bx   lr`
)});

test("min", () => {
	assert.strictEqual(disassemble(compile(Procedure.build(b => {
		const [l, m] = b.args
		b.return(l.lt(m).ternary(l, m))
	}))),
`     cmp r0, r1
     blo l0
     mov r0, r1
l0:  bx  lr`
)})

test("sort", () => {
	assert.strictEqual(disassemble(compile(Procedure.build(b => {
		const [x, y] = b.args
		b.branch(x.lt(y), 
			b => b.return(x, y),
			b => b.return(y, x),
		)
	}))),
`     cmp r0, r1
     blo l0
     mov r2, r1
     mov r1, r0
     mov r0, r2
l0:  bx  lr`
)})

test("copy", () => {
	assert.strictEqual(disassemble(compile(Procedure.build(b => {
		const [d, s, e] = b.args
		b.loop(d.ne(e), b => {
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
	assert.strictEqual(disassemble(compile(Procedure.build(b => 
	{
		const cr = new Constant(0x12345678);
		const sr = new Constant(0x76543210);

		const [dst, src, end] = b.args;
		const ret = b.declare(-1)

		b.add(cr.store(cr.load().bitand((~0x420) >>> 0).bitor(0x400))),
		
		b.loop(dst.lt(end), b => {
			const i = b.declare(32)
			b.loop(i.ne(0), b => {
                    const x = b.declare(src.load())
				b.add(src.increment(4))
                    // const y = b.declare(src.load())
				// b.add(src.increment(4))

                    b.add(dst.store(x))
				b.add(dst.increment(4))
                    // b.add(dst.store(y))
				// b.add(dst.increment(4))
                    
				b.add(i.decrement())
			})

			b.loop(sr.load().bitand(0xdeff).ne(0xc0de), () => {})

			b.add(ret.set(sr.load().bitand(0x3f8)))
			
			b.branch(ret.ne(0), b => b.break())
		}),

		cr.store(cr.load().bitand((~0x420) >>> 0).bitor(0x020)),
		b.return(ret)
	}))),
`     push {r4, r5, lr}
     ldr  r4, L0 ; 0x12345678
     ldr  r5, [r4]
     ldr  r3, L1 ; 0xfffffbdf
     ands r5, r3
     movs r3, #128
     lsls r3, r3, #3
     orrs r5, r3
     str  r5, [r4]
     movs r3, #0
     mvns r3, r3
l0:  cmp  r0, r2
     bhs  l3
     movs r3, #32
l1:  cmp  r3, #0
     beq  l2
     ldr  r4, [r1]
     str  r4, [r0]
     adds r1, r1, #4
     adds r0, r0, #4
     subs r3, r3, #1
     b    l1
l2:  ldr  r3, L2 ; 0x76543210
     ldr  r4, [r3]
     ldr  r3, L3 ; 0x0000deff
     ands r4, r3
     ldr  r3, L4 ; 0x0000c0de
     cmp  r4, r3
     bne  l2
     ldr  r3, L5 ; 0x76543210
     ldr  r3, [r3]
     movs r4, #254
     lsls r4, r4, #2
     ands r3, r4
     beq  l0
l3:  mov  r0, r3
     pop  {r4, r5, pc}
     nop  
L0:  0x12345678
L1:  0xfffffbdf
L2:  0x76543210
L3:  0x0000deff
L4:  0x0000c0de
L5:  0x76543210`
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