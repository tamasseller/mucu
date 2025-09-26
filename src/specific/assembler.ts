import assert from "assert";
import * as armv6 from "./armv6";

type Enumerate<N extends number, Acc extends number[] = []> = Acc['length'] extends N ? Acc[number] : Enumerate<N, [...Acc, Acc['length']]>
type Enumerate2<N extends number, Acc extends number[] = []> = Acc['length'] extends N ? Acc[number] : Enumerate2<N, [0, ...Acc, Acc['length']]>
type Enumerate4<N extends number, Acc extends number[] = []> = Acc['length'] extends N ? Acc[number] : Enumerate4<N, [0, 0, 0, ...Acc, Acc['length']]>

export type LoRegs = Iterable<armv6.LoReg>

export type Imm3 = Enumerate<8>
export type Imm5 = Enumerate<32>
export type Imm8 = Enumerate<256>
export type Uoff05 = Enumerate<32>
export type Uoff15 = Enumerate2<64>
export type Uoff25 = Enumerate4<128>
export type Uoff27 = Enumerate4<512>
export type Uoff28 = Enumerate4<1024>

type cmpArgs =
    [n: armv6.LoReg, imm: Imm8] |
    [n: armv6.AnyReg, m: armv6.AnyReg]

type addsSubsArgs =
    [d: armv6.LoReg, n: armv6.LoReg, m: armv6.LoReg] |
    [d: armv6.LoReg, n: armv6.LoReg, imm: Imm3] |
    [dn: armv6.LoReg, imm: Imm8]

export class Label
{
    offset?: number;   
}

export class Assembler
{
    private isns: ((offset: number) => number)[] = [];
    private pool: {label: Label, data: Buffer}[] = [];

    private addIsn(isn: number) {
        this.isns.push(() => isn);
    }

    private addData(data: Buffer): Label {
        const l = new Label();
        this.pool.push({label: l, data: data});
        return l;
    }

    private addConstant32(c: number): Label {
        const b = Buffer.alloc(4)
        b.writeUInt32LE(c)
        return this.addData(b)
    }

    public ands =  (dn: armv6.LoReg, m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.AND,  dn.idx, m.idx))
    public eors =  (dn: armv6.LoReg, m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.EOR,  dn.idx, m.idx))
    public adcs =  (dn: armv6.LoReg, m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.ADC,  dn.idx, m.idx))
    public sbcs =  (dn: armv6.LoReg, m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.SBC,  dn.idx, m.idx))
    public rors =  (dn: armv6.LoReg, m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.ROR,  dn.idx, m.idx))
    public tst =   (n: armv6.LoReg,  m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.TST,   n.idx, m.idx))
    public negs =  (d: armv6.LoReg,  m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.RSB,   d.idx, m.idx))
    public cmn =   (n: armv6.LoReg,  m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.CMN,   n.idx, m.idx))
    public orrs =  (dn: armv6.LoReg, m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.ORR,  dn.idx, m.idx))
    public muls =  (dn: armv6.LoReg, m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.MUL,  dn.idx, m.idx))
    public bics =  (dn: armv6.LoReg, m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.BIC,  dn.idx, m.idx))
    public mvns =  (dn: armv6.LoReg, m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.MVN,  dn.idx, m.idx))
    public sxth =  (d: armv6.LoReg,  m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.SXH,   d.idx, m.idx))
    public sxtb =  (d: armv6.LoReg,  m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.SXB,   d.idx, m.idx))
    public uxth =  (d: armv6.LoReg,  m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.UXH,   d.idx, m.idx))
    public uxtb =  (d: armv6.LoReg,  m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.UXB,   d.idx, m.idx))
    public rev =   (d: armv6.LoReg,  m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.REV,   d.idx, m.idx))
    public rev16 = (d: armv6.LoReg,  m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.REV16, d.idx, m.idx))
    public revsh = (d: armv6.LoReg,  m: armv6.LoReg) => this.addIsn(armv6.fmtReg2(armv6.Reg2Op.REVSH, d.idx, m.idx))

    public lsls =  (dn_d: armv6.LoReg, m: armv6.LoReg, imm?: Imm5) => this.addIsn((imm === undefined) 
        ? armv6.fmtReg2(armv6.Reg2Op.LSL, dn_d.idx, m.idx) 
        : armv6.fmtImm5(armv6.Imm5Op.LSL, dn_d.idx, m.idx, imm))

    public lsrs =  (dn_d: armv6.LoReg, m: armv6.LoReg, imm?: Imm5) => this.addIsn((imm === undefined) 
        ? armv6.fmtReg2(armv6.Reg2Op.LSR, dn_d.idx, m.idx)
        : armv6.fmtImm5(armv6.Imm5Op.LSR, dn_d.idx, m.idx, imm))

    public asrs =  (dn_d: armv6.LoReg, m: armv6.LoReg, imm?: Imm5) => this.addIsn((imm === undefined) 
        ? armv6.fmtReg2(armv6.Reg2Op.ASR, dn_d.idx, m.idx)
        : armv6.fmtImm5(armv6.Imm5Op.ASR, dn_d.idx, m.idx, imm))

    public cmp = (...args: cmpArgs) => {
        if(args[1] instanceof armv6.AnyReg) {
            const [n, m] = args
            this.addIsn((n.idx < 8 && m.idx < 8) 
                ? armv6.fmtReg2(armv6.Reg2Op.CMP, n.idx, m.idx)
                : armv6.fmtHiReg(armv6.HiRegOp.CMP, n.idx, m.idx))
        } else {
            const [n, imm] = args
            this.addIsn(armv6.fmtImm8(armv6.Imm8Op.CMP, n.idx, imm))
        }
    }

    public adds = (...args: addsSubsArgs) => {
        if(args.length == 3)
        {
            const [d, n, m_imm]: [armv6.LoReg, armv6.LoReg, armv6.LoReg | Imm3] = args
            this.addIsn((m_imm instanceof armv6.LoReg) 
                ? armv6.fmtReg3(armv6.Reg3Op.ADDREG, d.idx, n.idx, m_imm.idx)
                : armv6.fmtReg3(armv6.Reg3Op.ADDIMM, d.idx, n.idx, m_imm))
        } else {
            const [dn, imm]: [armv6.LoReg, Imm8] = args
            this.addIsn(armv6.fmtImm8(armv6.Imm8Op.ADD, dn.idx, imm))
        }
    }

    public subs = (...args: addsSubsArgs) => {
        if(args.length == 3)
        {
            const [d, n, m_imm]: [armv6.LoReg, armv6.LoReg, armv6.LoReg | Imm3] = args
            this.addIsn((m_imm instanceof armv6.LoReg) 
                ? armv6.fmtReg3(armv6.Reg3Op.SUBREG, d.idx, n.idx, m_imm.idx)
                : armv6.fmtReg3(armv6.Reg3Op.SUBIMM, d.idx, n.idx, m_imm))
        } else {
            const [dn, imm]: [armv6.LoReg, Imm8] = args
            this.addIsn(armv6.fmtImm8(armv6.Imm8Op.SUB, dn.idx, imm))
        }
    }

    public str =   (t: armv6.LoReg, n: armv6.LoReg, m_imm: armv6.LoReg | Uoff25) => this.addIsn((m_imm instanceof armv6.LoReg) 
        ? armv6.fmtReg3(armv6.Reg3Op.STR, t.idx, n.idx, m_imm.idx)
        : armv6.fmtImm5(armv6.Imm5Op.STR, t.idx, n.idx, m_imm >>> 2))

    public strh =   (t: armv6.LoReg, n: armv6.LoReg, m_imm: armv6.LoReg | Uoff15) => this.addIsn((m_imm instanceof armv6.LoReg) 
        ? armv6.fmtReg3(armv6.Reg3Op.STRH, t.idx, n.idx, m_imm.idx)
        : armv6.fmtImm5(armv6.Imm5Op.STRH, t.idx, n.idx, m_imm >>> 1))

    public strb =   (t: armv6.LoReg, n: armv6.LoReg, m_imm: armv6.LoReg | Uoff05) => this.addIsn((m_imm instanceof armv6.LoReg) 
        ? armv6.fmtReg3(armv6.Reg3Op.STRB, t.idx, n.idx, m_imm.idx)
        : armv6.fmtImm5(armv6.Imm5Op.STRB, t.idx, n.idx, m_imm >>> 0))

    public ldr =   (t: armv6.LoReg, n: armv6.LoReg, m_imm: armv6.LoReg | Uoff25) => this.addIsn((m_imm instanceof armv6.LoReg) 
        ? armv6.fmtReg3(armv6.Reg3Op.LDR, t.idx, n.idx, m_imm.idx)
        : armv6.fmtImm5(armv6.Imm5Op.LDR, t.idx, n.idx, m_imm >>> 2))

    public ldrh =   (t: armv6.LoReg, n: armv6.LoReg, m_imm: armv6.LoReg | Uoff15) => this.addIsn((m_imm instanceof armv6.LoReg) 
        ? armv6.fmtReg3(armv6.Reg3Op.LDRH, t.idx, n.idx, m_imm.idx)
        : armv6.fmtImm5(armv6.Imm5Op.LDRH, t.idx, n.idx, m_imm >>> 1))

    public ldrb =   (t: armv6.LoReg, n: armv6.LoReg, m_imm: armv6.LoReg | Uoff05) => this.addIsn((m_imm instanceof armv6.LoReg) 
        ? armv6.fmtReg3(armv6.Reg3Op.LDRB, t.idx, n.idx, m_imm.idx)
        : armv6.fmtImm5(armv6.Imm5Op.LDRB, t.idx, n.idx, m_imm >>> 0))

    public ldrsb = (t: armv6.LoReg, n: armv6.LoReg, m: armv6.LoReg) => this.addIsn(armv6.fmtReg3(armv6.Reg3Op.LDRSB,  t.idx, n.idx, m.idx))
    public ldrsh = (t: armv6.LoReg, n: armv6.LoReg, m: armv6.LoReg) => this.addIsn(armv6.fmtReg3(armv6.Reg3Op.LDRSH,  t.idx, n.idx, m.idx))

    public incrSp = (imm: Uoff27) => this.addIsn(armv6.fmtImm7(armv6.Imm7Op.INCRSP, imm >> 2))
    public decrSp = (imm: Uoff27) => this.addIsn(armv6.fmtImm7(armv6.Imm7Op.DECRSP, imm >> 2))

    public movs =  ( d: armv6.LoReg, imm: Imm8) => this.addIsn(armv6.fmtImm8(armv6.Imm8Op.MOV,    d.idx,  imm))
    public strSp = ( t: armv6.LoReg, imm: Uoff28) => this.addIsn(armv6.fmtImm8(armv6.Imm8Op.STRSP, t.idx,  imm >>> 2))
    public ldrSp = ( t: armv6.LoReg, imm: Uoff28) => this.addIsn(armv6.fmtImm8(armv6.Imm8Op.LDRSP, t.idx,  imm >>> 2))
    public addSp = ( d: armv6.LoReg, imm: Uoff28) => this.addIsn(armv6.fmtImm8(armv6.Imm8Op.ADDSP, d.idx,  imm >>> 2))

    public ldrPc = ( t: armv6.LoReg, imm: Uoff28) => this.addIsn(armv6.fmtImm8(armv6.Imm8Op.LDR,   t.idx,  imm >>> 2))
    public addPc = ( d: armv6.LoReg, imm: Uoff28) => this.addIsn(armv6.fmtImm8(armv6.Imm8Op.ADR,   d.idx,  imm >>> 2))

    public add =   (dn: armv6.AnyReg, m: armv6.AnyReg) => this.addIsn(armv6.fmtHiReg(armv6.HiRegOp.ADD, dn.idx, m.idx))
    public mov =   (dn: armv6.AnyReg, m: armv6.AnyReg) => this.addIsn(armv6.fmtHiReg(armv6.HiRegOp.MOV, dn.idx, m.idx))
    public blx =   (m: armv6.AnyReg) => this.addIsn(armv6.fmtHiReg(armv6.HiRegOp.JMP, 0b1000, m.idx))
    public bx =    (m: armv6.AnyReg) => this.addIsn(armv6.fmtHiReg(armv6.HiRegOp.JMP, 0b0000, m.idx))

    private loRegFlags = (l: LoRegs): number => [...(new Set(l).keys())].reduce((m, r) => m | (1 << r.idx), 0)

    public push       = (l: LoRegs) => this.addIsn(armv6.fmtPushPop(false, false, this.loRegFlags(l)))
    public pushWithLr = (l: LoRegs) => this.addIsn(armv6.fmtPushPop(false, true,  this.loRegFlags(l)))
    public pop        = (l: LoRegs) => this.addIsn(armv6.fmtPushPop(true,  false, this.loRegFlags(l)))
    public popWithPc  = (l: LoRegs) => this.addIsn(armv6.fmtPushPop(true,  true,  this.loRegFlags(l)))

    public stmia = (n: armv6.LoReg, l: LoRegs) => this.addIsn(armv6.lsMia(false, n.idx, this.loRegFlags(l)))
    public ldmia = (n: armv6.LoReg, l: LoRegs) => this.addIsn(armv6.lsMia(true,  n.idx, this.loRegFlags(l)))

    public udf =   (off: Imm8) => this.addIsn(armv6.fmtBranchSvc(armv6.BranchOp.UDF, off))
    public svc =   (imm: Imm8) => this.addIsn(armv6.fmtBranchSvc(armv6.BranchOp.SVC, imm))
    public bkpt =  (imm: Imm8) => this.addIsn(0b10111110_00000000 | imm)

    public cpsie = () => this.addIsn(armv6.fmtNoArg(armv6.NoArgOp.CPSIE))
    public cpsid = () => this.addIsn(armv6.fmtNoArg(armv6.NoArgOp.CPSID))
    public nop =   () => this.addIsn(armv6.fmtNoArg(armv6.NoArgOp.NOP))
    public yell = () => this.addIsn(armv6.fmtNoArg(armv6.NoArgOp.YIELD))
    public wfe =   () => this.addIsn(armv6.fmtNoArg(armv6.NoArgOp.WFE))
    public wfi =   () => this.addIsn(armv6.fmtNoArg(armv6.NoArgOp.WFI))
    public sev =   () => this.addIsn(armv6.fmtNoArg(armv6.NoArgOp.SEV))

    public label(l: Label = new Label()): Label {
        l.offset = this.isns.length;
        return l
    }

    load(n: armv6.LoReg, data: number | Buffer) 
    {
        let op: armv6.Imm8Op;
        let label: Label;

        if(data instanceof Buffer)
        {
            label = this.addData(data)
            op = armv6.Imm8Op.ADR;
        }
        else
        {
            assert(typeof data === "number")
            label = this.addConstant32(data)
            op = armv6.Imm8Op.LDR;
        }

        this.isns.push((here) => { 
            assert(label.offset !== undefined)
            const wordAlignedPcInOff16 = (here + 2) & ~1;
            const off = label.offset - wordAlignedPcInOff16;
            assert(0 <= off && off < 512)
            return armv6.fmtImm8(op, n.idx, off >>> 1)
        })
    }

    private addCondBranch(cond: armv6.BranchOp, l: Label): Label
    {
        this.isns.push((here) => { 
            assert(l.offset !== undefined)
            const off = l.offset - (here + 2);
            assert(-128 <= off && off <= 127)
            assert(-128 <= off && off <= 127)
            return armv6.fmtBranchSvc(cond, off);
        })

        return l
    }

    public beq = (l: Label = new Label()): Label => this.addCondBranch(armv6.BranchOp.EQ, l)
    public bne = (l: Label = new Label()): Label => this.addCondBranch(armv6.BranchOp.NE, l)
    public bhs = (l: Label = new Label()): Label => this.addCondBranch(armv6.BranchOp.HS, l)
    public bcs = this.bhs
    public blo = (l: Label = new Label()): Label => this.addCondBranch(armv6.BranchOp.LO, l)
    public bcc = this.blo
    public bmi = (l: Label = new Label()): Label => this.addCondBranch(armv6.BranchOp.MI, l)
    public bpl = (l: Label = new Label()): Label => this.addCondBranch(armv6.BranchOp.PL, l)
    public bvs = (l: Label = new Label()): Label => this.addCondBranch(armv6.BranchOp.VS, l)
    public bvc = (l: Label = new Label()): Label => this.addCondBranch(armv6.BranchOp.VC, l)
    public bhi = (l: Label = new Label()): Label => this.addCondBranch(armv6.BranchOp.HI, l)
    public bls = (l: Label = new Label()): Label => this.addCondBranch(armv6.BranchOp.LS, l)
    public bge = (l: Label = new Label()): Label => this.addCondBranch(armv6.BranchOp.GE, l)
    public blt = (l: Label = new Label()): Label => this.addCondBranch(armv6.BranchOp.LT, l)
    public bgt = (l: Label = new Label()): Label => this.addCondBranch(armv6.BranchOp.GT, l)
    public ble = (l: Label = new Label()): Label => this.addCondBranch(armv6.BranchOp.LE, l)

    public b(l: Label = new Label()): Label
    {       
        this.isns.push((here) => { 
            assert(l.offset !== undefined)
            const off = l.offset - (here + 2);
            assert(-2048 <= off && off < 2048)
            return (0b11100_00000000000 >>> 0) | (off & 0x7ff);
        })

        return l;
    }

    public assemble(): Buffer
    {
        const codeLen = this.isns.length * 2
        const poolStart = (codeLen + 3) & ~3
        const poolLen = this.pool.reduce((acc, curr) => acc + ((curr.data.byteLength + 3) & ~3), 0)

        const ret = Buffer.alloc((0 < poolLen) ? (poolStart + poolLen) : codeLen)

        if(0 < poolLen)
        {
            for(let offset = codeLen; offset < poolStart; offset += 2)
            {
                ret.writeUint16LE(armv6.fmtNoArg(armv6.NoArgOp.NOP) >>> 0, offset)
            }

            let offset = poolStart;
            for(const p of this.pool)
            {
                p.label.offset = offset >> 1;
                ret.set(p.data, offset)
                offset += (p.data.byteLength + 3) & ~3
            }
        }

        this.isns.forEach((isn, idx) => ret.writeUInt16LE(isn(idx) >>> 0, 2 * idx))

        return ret;
    }
}
