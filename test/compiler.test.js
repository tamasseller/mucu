"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const node_test_1 = __importDefault(require("node:test"));
const compiler_1 = require("../src/compiler");
const procedure_1 = __importDefault(require("../src//program/procedure"));
const expression_1 = require("../src//program/expression");
const disassembler_1 = require("../src/specific/disassembler");
(0, node_test_1.default)("returnArg", () => {
    assert_1.default.strictEqual((0, disassembler_1.disassemble)((0, compiler_1.compile)(procedure_1.default.build(b => {
        const [a] = b.args;
        b.return(a);
    }))), `     bx lr`);
});
(0, node_test_1.default)("branch", () => {
    assert_1.default.strictEqual((0, disassembler_1.disassemble)((0, compiler_1.compile)(procedure_1.default.build($ => {
        const [a] = $.args;
        $.branch(a.sub(3), new expression_1.Constant(123).store(a.mul(69)));
    }))), `     cmp  r0, #3
     beq  l0
     movs r1, #69
     muls r0, r1
     movs r1, #123
     str  r0, [r1]
l0:  bx   lr`);
});
(0, node_test_1.default)("min", () => {
    assert_1.default.strictEqual((0, disassembler_1.disassemble)((0, compiler_1.compile)(procedure_1.default.build(b => {
        const [l, m] = b.args;
        b.return(l.lt(m).ternary(l, m));
    }))), `     cmp r0, r1
     blo l0
     mov r0, r1
l0:  bx  lr`);
});
(0, node_test_1.default)("sort", () => {
    assert_1.default.strictEqual((0, disassembler_1.disassemble)((0, compiler_1.compile)(procedure_1.default.build(b => {
        const [x, y] = b.args;
        b.branch(x.lt(y), b => b.return(x, y), b => b.return(y, x));
    }))), `     cmp r0, r1
     blo l0
     mov r2, r1
     mov r1, r0
     mov r0, r2
l0:  bx  lr`);
});
(0, node_test_1.default)("copy", () => {
    assert_1.default.strictEqual((0, disassembler_1.disassemble)((0, compiler_1.compile)(procedure_1.default.build(b => {
        const [d, s, e] = b.args;
        b.loop(d.ne(e), b => {
            b.add(d.store(s.load(0 /* LoadStoreWidth.U1 */), 0 /* LoadStoreWidth.U1 */));
            b.add(d.increment());
            b.add(s.increment());
        });
    }))), `l0:  cmp  r0, r2
     beq  l1
     ldrb r3, [r1]
     strb r3, [r0]
     adds r1, r1, #1
     adds r0, r0, #1
     b    l0
l1:  bx   lr`);
});
(0, node_test_1.default)("reality", () => {
    assert_1.default.strictEqual((0, disassembler_1.disassemble)((0, compiler_1.compile)(procedure_1.default.build(b => {
        const cr = new expression_1.Constant(0x12345678);
        const sr = new expression_1.Constant(0x76543210);
        const [dst, src, end] = b.args;
        const ret = b.declare(-1);
        b.add(cr.store(cr.load().bitand((~0x420) >>> 0).bitor(0x400))),
            b.loop(dst.lt(end), b => {
                const i = b.declare(32);
                b.loop(i.ne(0), b => {
                    const x = b.declare(src.load());
                    b.add(src.increment(4));
                    // const y = b.declare(src.load())
                    // b.add(src.increment(4))
                    b.add(dst.store(x));
                    b.add(dst.increment(4));
                    // b.add(dst.store(y))
                    // b.add(dst.increment(4))
                    b.add(i.decrement());
                });
                b.loop(sr.load().bitand(0xdeff).ne(0xc0de), () => { });
                b.add(ret.set(sr.load().bitand(0x3f8)));
                b.branch(ret.ne(0), b => b.break());
            }),
            cr.store(cr.load().bitand((~0x420) >>> 0).bitor(0x020)),
            b.return(ret);
    }))), `     push {r4, r5, lr}
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
L5:  0x76543210`);
});
(0, node_test_1.default)("logAndSingle", () => {
    assert_1.default.strictEqual((0, disassembler_1.disassemble)((0, compiler_1.compile)(procedure_1.default.build($ => {
        const [a] = $.args;
        $.branch(a.ge(0).logand(a.lt(10)), new expression_1.Constant(69).store(420));
    }))), `     cmp  r0, #0
     blo  l0
     cmp  r0, #10
     bhs  l0
     movs r1, #210
     lsls r1, r1, #1
     movs r0, #69
     str  r1, [r0]
l0:  bx   lr`);
});
(0, node_test_1.default)("logAndOrChain", () => {
    assert_1.default.strictEqual((0, disassembler_1.disassemble)((0, compiler_1.compile)(procedure_1.default.build($ => {
        const [a] = $.args;
        $.branch(a.ge(0)
            .logand(a.lt(10)
            .logor(a.eq(1337))), new expression_1.Constant(69).store(420));
    }))), `     cmp  r0, #0
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
L0:  0x00000539`);
});
(0, node_test_1.default)("ternaryConditional", () => {
    assert_1.default.strictEqual((0, disassembler_1.disassemble)((0, compiler_1.compile)(procedure_1.default.build($ => {
        const [a] = $.args;
        $.branch(a.load().ge(a.gt(123).ternary(456, 789)), new expression_1.Constant(69).store(420));
    }))), `     ldr  r1, [r0]
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
L0:  0x00000315`);
});
