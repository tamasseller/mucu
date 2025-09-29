import * as armv6 from '../src/specific/armv6';
import * as asm from '../src/specific/assembler';

import test, { suite } from 'node:test';
import assert from 'node:assert';

const fromRaw = (...raw: number[]): Buffer => {
    const ret = Buffer.alloc(raw.length * 2)
    raw.forEach((v, idx) => ret.writeUInt16LE(v, 2 * idx))
    return ret
}

suite("asm", {}, () => {
    test("reg3", () => {
        const uut = new asm.Assembler();
        uut.adds(armv6.r0, armv6.r1, armv6.r2);
        uut.subs(armv6.r3, armv6.r4, armv6.r5);
        uut.adds(armv6.r6, armv6.r7, 0);
        uut.subs(armv6.r1, armv6.r2, 3);

        return assert.deepEqual(uut.assemble(), fromRaw(
            0x1888, // adds	r0, r1, r2
            0x1b63, // subs	r3, r4, r5
            0x1c3e, // adds	r6, r7, #0
            0x1ed1, // subs	r1, r2, #3
        ));
    });
    
    test("reg2", () => {
        const uut = new asm.Assembler();
        uut.ands(armv6.r0, armv6.r1);
        uut.eors(armv6.r1, armv6.r2);
        uut.adcs(armv6.r2, armv6.r3);
        uut.sbcs(armv6.r3, armv6.r4);
        uut.rors(armv6.r4, armv6.r5);
        uut.tst(armv6.r5, armv6.r6);
        uut.negs(armv6.r6, armv6.r7);
        uut.cmn(armv6.r7, armv6.r0);
        uut.orrs(armv6.r0, armv6.r1);
        uut.muls(armv6.r1, armv6.r2);
        uut.bics(armv6.r2, armv6.r3);
        uut.mvns(armv6.r3, armv6.r4);
        uut.sxth(armv6.r4, armv6.r5);
        uut.sxtb(armv6.r5, armv6.r6);
        uut.uxth(armv6.r6, armv6.r7);
        uut.uxtb(armv6.r7, armv6.r0);
        uut.rev(armv6.r0, armv6.r1);
        uut.rev16(armv6.r1, armv6.r2);
        uut.revsh(armv6.r2, armv6.r3);

        return assert.deepEqual(uut.assemble(), fromRaw(
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
            0xbada, // revsh	r2, r3
        ));
    })

    test("shift", () => {
        const uut = new asm.Assembler();
        uut.lsls(armv6.r0, armv6.r1);
        uut.lsrs(armv6.r1, armv6.r2);
        uut.asrs(armv6.r2, armv6.r3);
        uut.lsls(armv6.r3, armv6.r4, 3);
        uut.lsrs(armv6.r4, armv6.r5, 6);
        uut.asrs(armv6.r5, armv6.r6, 9);

        return assert.deepEqual(uut.assemble(), fromRaw(
            0x4088, // lsls	r0, r1
            0x40d1, // lsrs	r1, r2
            0x411a, // asrs	r2, r3
            0x00e3, // lsls	r3, r4, #3
            0x09ac, // lsrs	r4, r5, #6
            0x1275, // asrs	r5, r6, #9
        ));
    })

    test("cmp", () => {
        const uut = new asm.Assembler();
        uut.cmp(armv6.r0, armv6.r1);
        uut.cmp(armv6.r10, armv6.r2);
        uut.cmp(armv6.r1, armv6.r12);
        uut.cmp(armv6.r11, armv6.r12);
        uut.cmp(armv6.r7, 123);

        return assert.deepEqual(uut.assemble(), fromRaw(
            0x4288, // cmp	r0, r1
            0x4592, // cmp	r10, r2
            0x4561, // cmp	r1, r12
            0x45e3, // cmp	r11, r12
            0x2f7b, // cmp	r7, #123	@ 0x7b
        ));
    })

    test("loadStore", () => {
        const uut = new asm.Assembler();
        uut.str(armv6.r0, armv6.r1, armv6.r2);
        uut.str(armv6.r3, armv6.r4, 24);
        uut.strh(armv6.r5, armv6.r6, armv6.r7);
        uut.strh(armv6.r0, armv6.r1, 18);
        uut.strb(armv6.r2, armv6.r3, armv6.r4);
        uut.strb(armv6.r5, armv6.r6, 13);
        uut.ldr(armv6.r7, armv6.r0, armv6.r1);
        uut.ldr(armv6.r2, armv6.r3, 40);
        uut.ldrh(armv6.r4, armv6.r5, armv6.r6);
        uut.ldrh(armv6.r7, armv6.r0, 8);
        uut.ldrb(armv6.r1, armv6.r2, armv6.r3);
        uut.ldrb(armv6.r4, armv6.r5, 7);
        uut.ldrsb(armv6.r6, armv6.r7, armv6.r0);
        uut.ldrsh(armv6.r1, armv6.r2, armv6.r3);

        return assert.deepEqual(uut.assemble(), fromRaw(
            0x5088,  // str	r0, [r1, r2]
            0x61a3,  // str	r3, [r4, #24]
            0x53f5,  // strh	r5, [r6, r7]
            0x8248,  // strh	r0, [r1, #18]
            0x551a,  // strb	r2, [r3, r4]
            0x7375,  // strb	r5, [r6, #13]
            0x5847,  // ldr	r7, [r0, r1]
            0x6a9a,  // ldr	r2, [r3, #40]	@ 0x28
            0x5bac,  // ldrh	r4, [r5, r6]
            0x8907,  // ldrh	r7, [r0, #8]
            0x5cd1,  // ldrb	r1, [r2, r3]
            0x79ec,  // ldrb	r4, [r5, #7]
            0x563e, // ldrsb	r6, [r7, r0]
            0x5ed1, // ldrsh	r1, [r2, r3]
        ));
    })

    test("movs", () => {
        const uut = new asm.Assembler();
        uut.movs(armv6.r5, 234);

        return assert.deepEqual(uut.assemble(), fromRaw(
            0x25ea, // movs	r5, #234	@ 0xea
        ));
    })

    test("spRel", () => {
        const uut = new asm.Assembler();
        uut.incrSp(500);
        uut.decrSp(252);
        uut.strSp(armv6.r0, 132);
        uut.ldrSp(armv6.r1, 612);
        uut.addSp(armv6.r2, 984);

        return assert.deepEqual(uut.assemble(), fromRaw(
            0xb07d, // add	sp, #500	@ 0x1f4
            0xb0bf, // sub	sp, #252	@ 0xfc
            0x9021, // str	r0, [sp, #132]	@ 0x84
            0x9999, // ldr	r1, [sp, #612]	@ 0x264
            0xaaf6, // add	r2, sp, #984	@ 0x3d8
        ));        
    })

    test("pcRel", () => {
        const uut = new asm.Assembler();
        uut.ldrPc(armv6.r0, 248)
        uut.addPc(armv6.r1, 352)

        return assert.deepEqual(uut.assemble(), fromRaw(
            0x483e, // ldr	r0, [pc, #248]	@ (108 <fillStack+0x108>)
            0xa158, // add	r0, pc, #352	@ (adr r0, 174 <fillStack+0x174>)
        ));        
    })

    test("hiReg", () => {
        const uut = new asm.Assembler();

        uut.add(armv6.r0, armv6.r1)
        uut.add(armv6.r10, armv6.r11)
        uut.mov(armv6.r1, armv6.r2)
        uut.mov(armv6.r11, armv6.r12)
        uut.blx(armv6.r7)
        uut.blx(armv6.r8)
        uut.bx(armv6.r6)
        uut.bx(armv6.r9)

        return assert.deepEqual(uut.assemble(), fromRaw(
            0x4408, // add	r0, r1
            0x44da, // add	r10, r11
            0x4611, // mov	r1, r2
            0x46e3, // mov	r11, r12
            0x47b8, // blx	r7
            0x47c0, // blx	r8
            0x4730, // bx	r6
            0x4748, // bx	r9
        ));  
    })

    test("pushPop", () => {
        const uut = new asm.Assembler();
        uut.push([armv6.r0, armv6.r2, armv6.r3, armv6.r5, armv6.r0])
        uut.pushWithLr([armv6.r1, armv6.r4, armv6.r6, armv6.r7])
        uut.pop([armv6.r7, armv6.r5, armv6.r4, armv6.r2])
        uut.popWithPc([armv6.r6, armv6.r3, armv6.r1, armv6.r0])

        return assert.deepEqual(uut.assemble(), fromRaw(
            0xb42d, // push	{r0, r2, r3, r5}
            0xb5d2, // push	{r1, r4, r6, r7, r14}
            0xbcb4, // pop	{r2, r4, r5, r7}
            0xbd4b, // pop	{r0, r1, r3, r6, r15}
        ));  
    })

    test("mia", () => {
        const uut = new asm.Assembler();

        uut.stmia(armv6.r0, [armv6.r1, armv6.r3, armv6.r6, armv6.r7])
        uut.ldmia(armv6.r1, [armv6.r3, armv6.r4, armv6.r5, armv6.r6])

        return assert.deepEqual(uut.assemble(), fromRaw(
            0xc0ca, // stmia	r0!, {r1, r3, r6, r7}
            0xc978, // ldmia	r1!, {r3, r4, r5, r6}
        ));
    })

    test("special", () => {
        const uut = new asm.Assembler();
        uut.udf(12);
        uut.svc(23);
        uut.bkpt(34);

        return assert.deepEqual(uut.assemble(), fromRaw(
            0xde0c, // udf	#12
            0xdf17, // svc	23
            0xbe22, // bkpt	0x0022
        ));
    })

    test("noArg", () => {
        const uut = new asm.Assembler();
        uut.cpsie();
        uut.cpsid();
        uut.yell();
        uut.wfe();
        uut.wfi();
        uut.sev();

        return assert.deepEqual(uut.assemble(), fromRaw(
            0xb662, // cpsie	i
            0xb672, // cpsid	i
            0xbf10, // yield
            0xbf20, // wfe
            0xbf30, // wfi
            0xbf40, // sev
        ));
    })

    test("branch", () => {
        const uut = new asm.Assembler();
        const l = uut.label()
        uut.beq(l)
        uut.bne(l)
        uut.bhs(l)
        uut.blo(l)
        uut.bmi(l)
        uut.bpl(l)
        uut.bvs(l)
        uut.bvc(l)
        uut.bhi(l)
        uut.bls(l)
        uut.bge(l)
        uut.blt(l)
        uut.bgt(l)
        uut.ble(l)
        uut.b(l)

        return assert.deepEqual(uut.assemble(), fromRaw(
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
        ));
    })

    test("stackFill", () => {
        const uut = new asm.Assembler();
        uut.load(armv6.r0, 0x20001000)
        uut.mov(armv6.r1, armv6.sp)
        uut.load(armv6.r2, 0xa5a5a5a5)
        const l = uut.label()
        uut.stmia(armv6.r0, [armv6.r2])
        uut.cmp(armv6.r0, armv6.r1)
        uut.bcc(l)
        uut.bx(armv6.lr)

        return assert.deepEqual(uut.assemble(), fromRaw(
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
        ));
    })

    test("stackFillOffset", () => {
        const uut = new asm.Assembler();
        uut.mov(armv6.r8, armv6.r8)
        uut.load(armv6.r0, 0x20001000)
        uut.mov(armv6.r1, armv6.sp)
        uut.load(armv6.r2, 0xa5a5a5a5)
        const l = uut.label()
        uut.stmia(armv6.r0, [armv6.r2])
        uut.cmp(armv6.r0, armv6.r1)
        uut.bcc(l)
        uut.bx(armv6.lr)

        return assert.deepEqual(uut.assemble(), fromRaw(
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
        ));
    })

    test("copyString", () => {
        const uut = new asm.Assembler();
        uut.load(armv6.r0, Buffer.from("asdqwe123"))
        uut.load(armv6.r1, 0x20001230)
        uut.movs(armv6.r2, 9)
        uut.adds(armv6.r2, armv6.r2, armv6.r1)

        const start = uut.label()
        uut.cmp(armv6.r1, armv6.r2)
        const end = uut.bcs()

        uut.ldmia(armv6.r0, [armv6.r3])
        uut.stmia(armv6.r1, [armv6.r3])
        uut.b(start)

        uut.label(end)
        uut.bx(armv6.lr)

        assert.deepEqual(uut.assemble(), fromRaw(
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
        ));
    })
})
