import test from 'node:test';
import assert from 'node:assert';
import { disassemble } from '../src/specific/disassembler';

const fromRaw = (...raw: number[]): Buffer => {
    const ret = Buffer.alloc(raw.length * 2)
    raw.forEach((v, idx) => ret.writeUInt16LE(v, 2 * idx))
    return ret
}

test("reg3", () => assert.deepEqual(disassemble(fromRaw(
          0x1888, // adds	r0, r1, r2
          0x1b63, // subs	r3, r4, r5
          0x1c3e, // adds	r6, r7, #0
          0x1ed1, // subs	r1, r2, #3
     )), 
`     adds r0, r1, r2
     subs r3, r4, r5
     adds r6, r7, #0
     subs r1, r2, #3`
));

test("reg2", () => assert.deepEqual(disassemble(fromRaw(
    0x4008, // ands	r0, r1
    0x4051, // eors	r1, r2
    0x415a, // adcs	r2, r3
    0x41a3, // sbcs	r3, r4
    0x41ec, // rors	r4, r5
    0x4235, // tst	r5, r6
    0x427e, // negs	r6, r7
    0x42c7, // cmn	r7, r0
    0x4308, // orrs	r0, r1
    0x4351, // muls	r1, r2
    0x439a, // bics	r2, r3
    0x43e3, // mvns	r3, r4
    0xb22c, // sxth	r4, r5
    0xb275, // sxtb	r5, r6
    0xb2be, // uxth	r6, r7
    0xb2c7, // uxtb	r7, r0
    0xba08, // rev	r0, r1
    0xba51, // rev16	r1, r2
    0xbada
)),
    `     ands  r0, r1
     eors  r1, r2
     adcs  r2, r3
     sbcs  r3, r4
     rors  r4, r5
     tst   r5, r6
     rsbs  r6, r7
     cmn   r7, r0
     orrs  r0, r1
     muls  r1, r2
     bics  r2, r3
     mvns  r3, r4
     sxth  r4, r5
     sxtb  r5, r6
     uxth  r6, r7
     uxtb  r7, r0
     rev   r0, r1
     rev16 r1, r2
     revsh r2, r3`))

test("shift", () => assert.deepEqual(disassemble(fromRaw(
    0x4088, // lsls	r0, r1
    0x40d1, // lsrs	r1, r2
    0x411a, // asrs	r2, r3
    0x00e3, // lsls	r3, r4, #3
    0x09ac, // lsrs	r4, r5, #6
    0x1275
)),
`     lsls r0, r1
     lsrs r1, r2
     asrs r2, r3
     lsls r3, r4, #3
     lsrs r4, r5, #6
     asrs r5, r6, #9`))

test("cmp", () => assert.deepEqual(disassemble(fromRaw(
    0x4288, // cmp	r0, r1
    0x4592, // cmp	r10, r2
    0x4561, // cmp	r1, r12
    0x45e3, // cmp	r11, r12
    0x2f7b  // cmp	r7, #123
)),
`     cmp r0, r1
     cmp r10, r2
     cmp r1, r12
     cmp r11, r12
     cmp r7, #123`))

test("loadstore", () => assert.deepEqual(disassemble(fromRaw(
    0x5088, // str   r0, [r1, r2]
    0x61a3, // str   r3, [r4, #24]
    0x53f5, // strh  r5, [r6, r7]
    0x8248, // strh  r0, [r1, #18]
    0x551a, // strb  r2, [r3, r4]
    0x7375, // strb  r5, [r6, #13]
    0x5847, // ldr   r7, [r0, r1]
    0x6a9a, // ldr   r2, [r3, #40]	@ 0x28
    0x5bac, // ldrh  r4, [r5, r6]
    0x8907, // ldrh  r7, [r0, #8]
    0x5cd1, // ldrb  r1, [r2, r3]
    0x79ec, // ldrb  r4, [r5, #7]
    0x563e, // ldrsb r6, [r7, r0]
    0x5ed1, // ldrsh r1, [r2, r3]
)),
`     str   r0, [r1, r2]
     str   r3, [r4, #24]
     strh  r5, [r6, r7]
     strh  r0, [r1, #18]
     strb  r2, [r3, r4]
     strb  r5, [r6, #13]
     ldr   r7, [r0, r1]
     ldr   r2, [r3, #40]
     ldrh  r4, [r5, r6]
     ldrh  r7, [r0, #8]
     ldrb  r1, [r2, r3]
     ldrb  r4, [r5, #7]
     ldrsb r6, [r7, r0]
     ldrsh r1, [r2, r3]`))

test("loadstore", () => assert.deepEqual(disassemble(fromRaw(
    0x5088, // str   r0, [r1, r2]
    0x61a3, // str   r3, [r4, #24]
    0x53f5, // strh  r5, [r6, r7]
    0x8248, // strh  r0, [r1, #18]
    0x551a, // strb  r2, [r3, r4]
    0x7375, // strb  r5, [r6, #13]
    0x5847, // ldr   r7, [r0, r1]
    0x6a9a, // ldr   r2, [r3, #40]	@ 0x28
    0x5bac, // ldrh  r4, [r5, r6]
    0x8907, // ldrh  r7, [r0, #8]
    0x5cd1, // ldrb  r1, [r2, r3]
    0x79ec, // ldrb  r4, [r5, #7]
    0x563e, // ldrsb r6, [r7, r0]
    0x5ed1, // ldrsh r1, [r2, r3]
)),
`     str   r0, [r1, r2]
     str   r3, [r4, #24]
     strh  r5, [r6, r7]
     strh  r0, [r1, #18]
     strb  r2, [r3, r4]
     strb  r5, [r6, #13]
     ldr   r7, [r0, r1]
     ldr   r2, [r3, #40]
     ldrh  r4, [r5, r6]
     ldrh  r7, [r0, #8]
     ldrb  r1, [r2, r3]
     ldrb  r4, [r5, #7]
     ldrsb r6, [r7, r0]
     ldrsh r1, [r2, r3]`))

test("movs", () => assert.deepEqual(disassemble(fromRaw(
    0x25ea, // movs	r5, #234	@ 0xea
)),
`     movs r5, #234`))

test("spRel", () => assert.deepEqual(disassemble(fromRaw(
    0xb07d, // add	sp, #500	@ 0x1f4
    0xb0bf, // sub	sp, #252	@ 0xfc
    0x9021, // str	r0, [sp, #132]	@ 0x84
    0x9999, // ldr	r1, [sp, #612]	@ 0x264
    0xaaf6, // add	r2, sp, #984	@ 0x3d8
)),
`     add sp, #500
     sub sp, #252
     str r0, [sp, #132]
     ldr r1, [sp, #612]
     add r2, sp, #984`))

test("special", () => assert.deepEqual(disassemble(fromRaw(
    0xde0c, // udf	#12
    0xdf17, // svc	23
    0xbe22, // bkpt	0x0022
)),
`     udf  #12
     svc  #23
     bkpt #34`))

test("noArg", () => assert.deepEqual(disassemble(fromRaw(
    0xb662, // cpsie	i
    0xb672, // cpsid	i
    0xbf00, // nop
    0xbf10, // yield
    0xbf20, // wfe
    0xbf30, // wfi
    0xbf40, // sev
)),
`     cpsie i
     cpsid i
     nop   
     yield 
     wfe   
     wfi   
     sev   `))

test("hiReg", () => assert.deepEqual(disassemble(fromRaw(
    0x4408, // add	r0, r1
    0x44da, // add	r10, r11
    0x4611, // mov	r1, r2
    0x46e3, // mov	r11, r12
    0x47b8, // blx	r7
    0x47c0, // blx	r8
    0x4730, // bx	r6
    0x4748, // bx	r9
)),
`     add r0, r1
     add r10, r11
     mov r1, r2
     mov r11, r12
     blx r7
     blx r8
     bx  r6
     bx  r9`))

test("pushPop", () => assert.deepEqual(disassemble(fromRaw(
    0xb42d, // push	{r0, r2, r3, r5}
    0xb5d2, // push	{r1, r4, r6, r7, r14}
    0xbcb4, // pop	{r2, r4, r5, r7}
    0xbd4b, // pop	{r0, r1, r3, r6, r15}
)),
`     push {r0, r2, r3, r5}
     push {r1, r4, r6, r7, lr}
     pop  {r2, r4, r5, r7}
     pop  {r0, r1, r3, r6, pc}`))

test("mia", () => assert.deepEqual(disassemble(fromRaw(
    0xc0ca, // stmia	r0!, {r1, r3, r6, r7}
    0xc978, // ldmia	r1!, {r3, r4, r5, r6}
)),
`     stmia r0!, {r1, r3, r6, r7}
     ldmia r1!, {r3, r4, r5, r6}`))

test("branch", () => assert.deepEqual(disassemble(fromRaw(
    0xd0fe, // beq.n	e <l>
    0xd1fd, // bne.n	e <l>
    0xd2fc, // bcs.n	e <l>
    0xd3fb, // bcc.n	e <l>
    0xd4fa, // bmi.n	e <l>
    0xd5f9, // bpl.n	e <l>
    0xd6f8, // bvs.n	e <l>
    0xd7f7, // bvc.n	e <l>
    0xd8f6, // bhi.n	e <l>
    0xd9f5, // bls.n	e <l>
    0xdaf4, // bge.n	e <l>
    0xdbf3, // blt.n	e <l>
    0xdcf2, // bgt.n	e <l>
    0xddf1, // ble.n	e <l>
    0xe7f0, // b.n	e <l>
)),
`l0:  beq l0
     bne l0
     bhs l0
     blo l0
     bmi l0
     bpl l0
     bvs l0
     bvc l0
     bhi l0
     bls l0
     bge l0
     blt l0
     bgt l0
     ble l0
     b   l0`))

test("pcRel", () => assert.deepEqual(disassemble(fromRaw(
   0x4800, // ldr	r0, [pc, #0]	@ (4 <asd>)
   0xa100, // add	r1, pc, #0	@ (adr r1, 4 <asd>)
   0xbeef, // .word	0x1337beef
   0x1337
)),
`     ldr r0, L0 ; 0x1337beef
     adr r1, L0
L0:  0x1337beef`))

test("stackFill", () => assert.deepEqual(disassemble(fromRaw(
    0x4803, // ldr	r0, [pc, #12]	@ (10 <fillStack+0x10>)
    0x4669, // mov	r1, r13
    0x4a03, // ldr	r2, [pc, #12]	@ (14 <fillStack+0x14>)
    0xc004, // stmia	r0!, {r2}
    0x4288, // cmp	r0, r1
    0xd3fc, // bcc.n	6 <fillStack+0x6>
    0x4770, // bx	r14
    0xbf00, // .short	0xbf00
    0x1000, // .word	0x20001000
    0x2000,
    0xa5a5, // .word	0xa5a5a5a5
    0xa5a5, 
)),
`     ldr   r0, L0 ; 0x20001000
     mov   r1, sp
     ldr   r2, L1 ; 0xa5a5a5a5
l0:  stmia r0!, {r2}
     cmp   r0, r1
     blo   l0
     bx    lr
     nop   
L0:  0x20001000
L1:  0xa5a5a5a5`))

test("stackFillOffset", () => assert.deepEqual(disassemble(fromRaw(
    0x46c0, // nop			@ (mov r8, r8)
    0x4803, // ldr	r0, [pc, #12]	@ (10 <fillStack+0x10>)
    0x4669, // mov	r1, r13
    0x4a03, // ldr	r2, [pc, #12]	@ (14 <fillStack+0x14>)
    0xc004, // stmia	r0!, {r2}
    0x4288, // cmp	r0, r1
    0xd3fc, // bcc.n	6 <fillStack+0x6>
    0x4770, // bx	r14
    0x1000, // .word	0x20001000
    0x2000,
    0xa5a5, // .word	0xa5a5a5a5
    0xa5a5, 
)),
`     mov   r8, r8
     ldr   r0, L0 ; 0x20001000
     mov   r1, sp
     ldr   r2, L1 ; 0xa5a5a5a5
l0:  stmia r0!, {r2}
     cmp   r0, r1
     blo   l0
     bx    lr
L0:  0x20001000
L1:  0xa5a5a5a5`))

test("copyString", () => assert.deepEqual(disassemble(fromRaw(
    0xa004, // add	r0, pc, #16	@ (adr r0, 14 <data>)
    0x4907, // ldr	r1, [pc, #28]	@ (20 <data+0xc>)
    0x2209, // movs	r2, #9
    0x1852, // adds	r2, r2, r1
    0x4291, // cmp	r1, r2
    0xd202, // bcs.n	12 <memCopy+0x12>
    0xc808, // ldmia	r0!, {r3}
    0xc108, // stmia	r1!, {r3}
    0xe7fa, // b.n	8 <memCopy+0x8>
    0x4770, // bx	r14
    0x7361, // .word	0x71647361
    0x7164, 
    0x6577, // .word	0x32316577
    0x3231, 
    0x0033, // .word	0x00000033
    0x0000, 
    0x1230, // .word	0x20001230
    0x2000, 
)),
`     adr   r0, L0
     ldr   r1, L1 ; 0x20001230
     movs  r2, #9
     adds  r2, r2, r1
l0:  cmp   r1, r2
     bhs   l1
     ldmia r0!, {r3}
     stmia r1!, {r3}
     b     l0
l1:  bx    lr
L0:  0x71647361
     0x32316577
     0x00000033
L1:  0x20001230`))