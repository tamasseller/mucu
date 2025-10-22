import {Relocation} from "../linker"
import { b, BranchOp, fmtBl, HiRegOp, Imm5Op, Imm7Op, Imm8Op, NoArgOp, Reg2Op, Reg3Op, SYSm, WideOps } from "./armv6";

const enum Masks
{
    noArg  = 0b1111111111111111,
    reg2   = 0b1111111111_000_000,
    imm7   = 0b111111111_0000000,
    hiReg  = 0b11111111_00000000,
    reg3   = 0b1111111_000_000_000,
    imm8   = 0b11111_000_00000000,
    imm5   = 0b11111_00000_000_000,
    b      = 0b11111_00000000000,
    branch = 0b1111_1111_00000000,
    lsMia  = 0b1111_0_000_00000000,
    pshPop = 0b1111_0_11_0_00000000,
    msr    = 0b11111_1111110_0000_1_101_0000_00000000,
    mrs    = 0b11111_1111110_0000_1_101_0000_00000000,
    bl     = 0b11110_0_0000000000_11_0_1_0_00000000000
}

const lsMiaOp   = 0b1100_0_000_00000000
const pushPopOp = 0b1011_0_10_0_00000000

const r = (idx: number) => {
    switch(idx)
    {
        default: return `r${idx}`
        case 13: return 'sp'
        case 14: return 'lr'
        case 15: return 'pc'
    }
}

const sysr = (sysm: number) =>
{
    switch(sysm as SYSm) 
    {
        case SYSm.APSR:    return "APSR"
        case SYSm.IAPSR:   return "IAPSR"
        case SYSm.EAPSR:   return "EAPSR"
        case SYSm.XPSR:    return "XPSR"
        case SYSm.IPSR:    return "IPSR"
        case SYSm.EPSR:    return "EPSR"
        case SYSm.IEPSR:   return "IEPSR"
        case SYSm.MSP:     return "MSP"
        case SYSm.PSP:     return "PSP"
        case SYSm.PRIMASK: return "PRIMASK"
        case SYSm.CONTROL: return "CONTROL"
        default: return `sys${sysm}?`
    }
}

interface Isn
{
    readonly access?: number
    readonly branch?: number
    readonly isWide?: boolean
    print(indices: Iterable<number>): Iterable<string>
}

const lutNoArg = new Map<number, () => Isn>([
    [NoArgOp.CPSIE, () => ({print: () => ["cpsie", "i"]})],
    [NoArgOp.CPSID, () => ({print: () => ["cpsid", "i"]})],
    [NoArgOp.NOP,   () => ({print: () => ["nop"]})],
    [NoArgOp.YIELD, () => ({print: () => ["yield"]})],
    [NoArgOp.WFE,   () => ({print: () => ["wfe"]})],
    [NoArgOp.WFI,   () => ({print: () => ["wfi"]})],
    [NoArgOp.SEV,   () => ({print: () => ["sev"]})],
    [WideOps.DSB,   () => ({print: () => ["dsb"]})],
    [WideOps.DMB,   () => ({print: () => ["dmb"]})],
    [WideOps.ISB,   () => ({print: () => ["isb"]})],
])

const lutReg2 = new Map<number, (dn: number, m: number) => Isn>([
    [Reg2Op.AND,   (dn, m) => ({print: () => ["ands",  r(dn), r(m)]})],
    [Reg2Op.EOR,   (dn, m) => ({print: () => ["eors",  r(dn), r(m)]})],
    [Reg2Op.LSL,   (dn, m) => ({print: () => ["lsls",  r(dn), r(m)]})],
    [Reg2Op.LSR,   (dn, m) => ({print: () => ["lsrs",  r(dn), r(m)]})],
    [Reg2Op.ASR,   (dn, m) => ({print: () => ["asrs",  r(dn), r(m)]})],
    [Reg2Op.ADC,   (dn, m) => ({print: () => ["adcs",  r(dn), r(m)]})],
    [Reg2Op.SBC,   (dn, m) => ({print: () => ["sbcs",  r(dn), r(m)]})],
    [Reg2Op.ROR,   (dn, m) => ({print: () => ["rors",  r(dn), r(m)]})],
    [Reg2Op.TST,   (dn, m) => ({print: () => ["tst",   r(dn), r(m)]})],
    [Reg2Op.RSB,   (dn, m) => ({print: () => ["rsbs",  r(dn), r(m)]})],
    [Reg2Op.CMP,   (dn, m) => ({print: () => ["cmp",   r(dn), r(m)]})],
    [Reg2Op.CMN,   (dn, m) => ({print: () => ["cmn",   r(dn), r(m)]})],
    [Reg2Op.ORR,   (dn, m) => ({print: () => ["orrs",  r(dn), r(m)]})],
    [Reg2Op.MUL,   (dn, m) => ({print: () => ["muls",  r(dn), r(m)]})],
    [Reg2Op.BIC,   (dn, m) => ({print: () => ["bics",  r(dn), r(m)]})],
    [Reg2Op.MVN,   (dn, m) => ({print: () => ["mvns",  r(dn), r(m)]})],
    [Reg2Op.SXH,   (dn, m) => ({print: () => ["sxth",  r(dn), r(m)]})],
    [Reg2Op.SXB,   (dn, m) => ({print: () => ["sxtb",  r(dn), r(m)]})],
    [Reg2Op.UXH,   (dn, m) => ({print: () => ["uxth",  r(dn), r(m)]})],
    [Reg2Op.UXB,   (dn, m) => ({print: () => ["uxtb",  r(dn), r(m)]})],
    [Reg2Op.REV,   (dn, m) => ({print: () => ["rev",   r(dn), r(m)]})],
    [Reg2Op.REV16, (dn, m) => ({print: () => ["rev16", r(dn), r(m)]})],
    [Reg2Op.REVSH, (dn, m) => ({print: () => ["revsh", r(dn), r(m)]})]
])

const lutImm7 = new Map<number, (imm7: number) => Isn>([
    [Imm7Op.INCRSP, (imm7) => ({print: () => ["add", "sp", `#${imm7 << 2}`]})],
    [Imm7Op.DECRSP, (imm7) => ({print: () => ["sub", "sp", `#${imm7 << 2}`]})],
])

const lutHiReg = new Map<number, (dn: number, m: number) => Isn>([
    [HiRegOp.ADD, (dn, m) => ({print: () => ["add", r(dn), r(m)]})],
    [HiRegOp.CMP, (dn, m) => ({print: () => ["cmp", r(dn), r(m)]})],
    [HiRegOp.JMP, (dn, m) => ({print: () => [dn === 0b1000 ? "blx" : "bx", r(m)]})],
    [HiRegOp.MOV, (dn, m) => ({print: () => ["mov", r(dn), r(m)]})],
])

const lutReg3 = new Map<number, (dt: number, n: number, m: number) => Isn>([
    [Reg3Op.ADDREG, (dt, n, m) => ({print: () => ["adds", r(dt), r(n), r(m)]})],
    [Reg3Op.SUBREG, (dt, n, m) => ({print: () => ["subs", r(dt), r(n), r(m) ]})],
    [Reg3Op.ADDIMM, (dt, n, m) => ({print: () => ["adds", r(dt), r(n), `#${m}`]})],
    [Reg3Op.SUBIMM, (dt, n, m) => ({print: () => ["subs", r(dt), r(n), `#${m}`]})],
    [Reg3Op.STR,    (dt, n, m) => ({print: () => ["str",  r(dt), `[${r(n)}, ${r(m)}]`]})],
    [Reg3Op.STRH,   (dt, n, m) => ({print: () => ["strh", r(dt), `[${r(n)}, ${r(m)}]`]})],
    [Reg3Op.STRB,   (dt, n, m) => ({print: () => ["strb", r(dt), `[${r(n)}, ${r(m)}]`]})],
    [Reg3Op.LDRSB,  (dt, n, m) => ({print: () => ["ldrsb",r(dt), `[${r(n)}, ${r(m)}]`]})],
    [Reg3Op.LDR,    (dt, n, m) => ({print: () => ["ldr",  r(dt), `[${r(n)}, ${r(m)}]`]})],
    [Reg3Op.LDRH,   (dt, n, m) => ({print: () => ["ldrh", r(dt), `[${r(n)}, ${r(m)}]`]})],
    [Reg3Op.LDRB,   (dt, n, m) => ({print: () => ["ldrb", r(dt), `[${r(n)}, ${r(m)}]`]})],
    [Reg3Op.LDRSH,  (dt, n, m) => ({print: () => ["ldrsh",r(dt), `[${r(n)}, ${r(m)}]`]})],
])

const hex = (val: number) => {
    const x = "0".repeat(8) + val.toString(16)
    return "0x" + x.substring(x.length - 8);
}

const lutImm8 = new Map<number, (r: number, imm8: number) => Isn>([
    [Imm8Op.MOV,   (reg, imm8) => ({print: () => ["movs", r(reg), `#${imm8}`]})],
    [Imm8Op.CMP,   (reg, imm8) => ({print: () => ["cmp", r(reg), `#${imm8}`]})],
    [Imm8Op.ADD,   (reg, imm8) => ({print: () => ["adds", r(reg), `#${imm8}`]})],
    [Imm8Op.SUB,   (reg, imm8) => ({print: () => ["subs", r(reg), `#${imm8}`]})],
    [Imm8Op.STRSP, (reg, imm8) => ({print: () => ["str", r(reg), `[sp, #${imm8 << 2}]`]})],
    [Imm8Op.LDRSP, (reg, imm8) => ({print: () => ["ldr", r(reg), `[sp, #${imm8 << 2}]`]})],
    [Imm8Op.LDR,   (reg, imm8) => ({access: imm8, print: ([L, val]) => ["ldr", r(reg), `L${L} ; ${hex(val)}`]})],
    [Imm8Op.ADR,   (reg, imm8) => ({access: imm8, print: ([L]) => ["adr", r(reg),      `L${L}`]})],
    [Imm8Op.ADDSP, (reg, imm8) => ({print: () => ["add", r(reg), `sp, #${imm8 << 2}`]})]
])

const lutImm5 = new Map<number, (t: number, mn: number, imm5: number) => Isn>([
    [Imm5Op.LSL,  (t, mn, imm5) => ({print: () => ["lsls", r(t), r(mn), `#${imm5}`]})],
    [Imm5Op.LSR,  (t, mn, imm5) => ({print: () => ["lsrs", r(t), r(mn), `#${imm5}`]})],
    [Imm5Op.ASR,  (t, mn, imm5) => ({print: () => ["asrs", r(t), r(mn), `#${imm5}`]})],
    [Imm5Op.STR,  (t, mn, imm5) => ({print: () => ["str", r(t), `[${r(mn)}${imm5 ? ", #" + (imm5 << 2) : ''}]`]})],
    [Imm5Op.LDR,  (t, mn, imm5) => ({print: () => ["ldr", r(t), `[${r(mn)}${imm5 ? ", #" + (imm5 << 2) : ''}]`]})],
    [Imm5Op.STRB, (t, mn, imm5) => ({print: () => ["strb", r(t), `[${r(mn)}${imm5 ? ", #" + imm5 : ''}]`]})],
    [Imm5Op.LDRB, (t, mn, imm5) => ({print: () => ["ldrb", r(t), `[${r(mn)}${imm5 ? ", #" + imm5 : ''}]`]})],
    [Imm5Op.STRH, (t, mn, imm5) => ({print: () => ["strh", r(t), `[${r(mn)}${imm5 ? ", #" + (imm5 << 1) : ''}]`]})],
    [Imm5Op.LDRH, (t, mn, imm5) => ({print: () => ["ldrh", r(t), `[${r(mn)}${imm5 ? ", #" + (imm5 << 1) : ''}]`]})],
])

const lutBranchSvc = new Map<number, (imm8: number) => Isn>([
    [BranchOp.EQ,   (imm8) => ({branch: (imm8 << 24) >> 24, print: ([l]) => ["beq", `l${l}`]})],
    [BranchOp.NE,   (imm8) => ({branch: (imm8 << 24) >> 24, print: ([l]) => ["bne", `l${l}`]})],
    [BranchOp.HS,   (imm8) => ({branch: (imm8 << 24) >> 24, print: ([l]) => ["bhs", `l${l}`]})],
    [BranchOp.LO,   (imm8) => ({branch: (imm8 << 24) >> 24, print: ([l]) => ["blo", `l${l}`]})],
    [BranchOp.MI,   (imm8) => ({branch: (imm8 << 24) >> 24, print: ([l]) => ["bmi", `l${l}`]})],
    [BranchOp.PL,   (imm8) => ({branch: (imm8 << 24) >> 24, print: ([l]) => ["bpl", `l${l}`]})],
    [BranchOp.VS,   (imm8) => ({branch: (imm8 << 24) >> 24, print: ([l]) => ["bvs", `l${l}`]})],
    [BranchOp.VC,   (imm8) => ({branch: (imm8 << 24) >> 24, print: ([l]) => ["bvc", `l${l}`]})],
    [BranchOp.HI,   (imm8) => ({branch: (imm8 << 24) >> 24, print: ([l]) => ["bhi", `l${l}`]})],
    [BranchOp.LS,   (imm8) => ({branch: (imm8 << 24) >> 24, print: ([l]) => ["bls", `l${l}`]})],
    [BranchOp.GE,   (imm8) => ({branch: (imm8 << 24) >> 24, print: ([l]) => ["bge", `l${l}`]})],
    [BranchOp.LT,   (imm8) => ({branch: (imm8 << 24) >> 24, print: ([l]) => ["blt", `l${l}`]})],
    [BranchOp.GT,   (imm8) => ({branch: (imm8 << 24) >> 24, print: ([l]) => ["bgt", `l${l}`]})],
    [BranchOp.LE,   (imm8) => ({branch: (imm8 << 24) >> 24, print: ([l]) => ["ble", `l${l}`]})],
    [BranchOp.UDF,  (imm8) => ({print: () => ["udf", `#${imm8}`]})],
    [BranchOp.SVC,  (imm8) => ({print: () => ["svc", `#${imm8}`]})],
    [BranchOp.BKPT, (imm8) => ({print: () => ["bkpt", `#${imm8}`]})],
])

const lutWideNoArg = new Map<number, () => Isn>([
    [WideOps.DSB,   () => ({isWide: true, print: () => ["dsb"]})],
    [WideOps.DMB,   () => ({isWide: true, print: () => ["dmb"]})],
    [WideOps.ISB,   () => ({isWide: true, print: () => ["isb"]})],
])

function* bm2idxs(bitmap: number)
{
    for(let i = 0; i < 8; i++)
    {
        if((bitmap & (1 << i)) !== 0)
        {
            yield i
        }
    }
}

const ppOp = (popNpush: boolean, includeExtra: boolean, regFlags: number) => ({
    print: () => [
        popNpush ? "pop" : "push",
        `{${[...bm2idxs(regFlags), ...(includeExtra ? [popNpush ? 15 : 14] : [])].map(r).join(", ")}}`
    ]
})

const miaOp = (loadNstore: boolean, n: number, regFlags: number) => ({
    print: () => [
        loadNstore ? "ldmia" : "stmia",
        `${r(n)}!`,
        `{${[...bm2idxs(regFlags)].map(r).join(", ")}}`
    ]
})

const msrOp = (rn: number, sysm: number) => ({
    isWide: true, 
    print: () => ["msr", `${sysr(sysm)}`, `${r(rn)}`]
})

const mrsOp = (dn: number, sysm: number) => ({
    isWide: true, 
    print: () => ["mrs", `${r(dn)}`, `${sysr(sysm)}`]
})

const blOp = (S: number, J1: number, J2: number, imm10: number, imm11: number) => {
    const I1 = J1 ^ S ^ 1
    const I2 = J2 ^ S ^ 1
    const u24 = (S << 24) | (I1 << 23) | (I2 << 22) | (imm10 << 12) | (imm11 << 1)
    const i24 = (u24 << 8) >> 8

    return ({
        isWide: true, 
        print: ([addr]) => ["bl", `0x${("0".repeat(8) + (addr + 4 + i24).toString(16)).slice(-8)}`],
    })
}

const bOp = (offset: number) => ({
    print: ([l]) => ["b", `l${l}`],
    branch: (offset << 21) >> 21
})

function parseInstruction(isn: number): Isn | undefined
{
    if(((isn & Masks.msr) >>> 0) === ((WideOps.MSR & Masks.msr) >>> 0)) return msrOp((isn >> 16) & 0xf, isn & 0xff)
    if(((isn & Masks.mrs) >>> 0) === ((WideOps.MRS & Masks.mrs) >>> 0)) return mrsOp((isn >> 8) & 0xf, isn & 0xff)
    if(((isn & Masks.bl) >>> 0) === ((WideOps.BL & Masks.bl) >>> 0)) return blOp((isn >>> 26) & 1, (isn >>> 13) & 1, (isn >>> 11) & 1, (isn >>> 16) & 0x3ff, (isn >>> 0) & 0x7ff)

    const wideNoArg = lutWideNoArg.get(isn)
    if(wideNoArg) return wideNoArg()

    if((isn & Masks.pshPop) === pushPopOp) return ppOp((isn & (1 << 11)) !== 0, (isn & (1 << 8)) !== 0, isn & 255)
    if((isn & Masks.lsMia) === lsMiaOp) return miaOp((isn & (1 << 11)) !== 0, ((isn >>> 8) & 7), isn & 255)
    if((isn & Masks.b) === b) return bOp(isn & 0x7ff)

    return lutNoArg.get(isn & Masks.noArg)?.()
        ?? lutReg2.get(isn & Masks.reg2)?.(isn & 7, (isn >>> 3) & 7)
        ?? lutImm7.get(isn & Masks.imm7)?.(isn & 127)
        ?? lutHiReg.get(isn & Masks.hiReg)?.((((isn >>> 7) & 1) << 3) | (isn & 7), (isn >>> 3) & 15)
        ?? lutReg3.get(isn & Masks.reg3)?.(isn & 7, (isn >>> 3) & 7, (isn >>> 6) & 7)
        ?? lutImm8.get(isn & Masks.imm8)?.((isn >>> 8) & 7, isn & 255)
        ?? lutImm5.get(isn & Masks.imm5)?.(isn & 7, (isn >>> 3) & 7, (isn >>> 6) & 31)
        ?? lutBranchSvc.get(isn & Masks.branch)?.(isn & 0xff)
}

function pcRelIndex(pcIdx: number, off: number)
{
    const wordAlignedPcInOff16 = (pcIdx + 2) & ~1;
    return ((off << 1) + wordAlignedPcInOff16) << 1
}

function readIsn(bin: Buffer, offset: number): {rawIsn: number, width: number}
{
    const halfWord = bin.readUint16LE(offset)

    if(halfWord >>> 11 === 0b11110)
    {
        return {
            rawIsn: ((halfWord << 16) | bin.readUint16LE(offset + 2)) >>> 0,
            width: 4
        }
    }
        
    return {
        rawIsn: halfWord,
        width: 2
    }
}

function* traverseInstructions(bin: Buffer): Generator<Isn, void, unknown>
{
    let poolStart = undefined;
    for(let off = 0; off < bin.byteLength && (poolStart === undefined || off < poolStart); )
    {
        const readed = readIsn(bin, off)

        const isn = parseInstruction(readed.rawIsn)

        if(isn.access !== undefined) {
            poolStart = Math.min(pcRelIndex(off >> 1, isn.access), ...(poolStart !== undefined ? [poolStart] : []))
        }

        yield isn

        off += readed.width
    }
}

function branchTargetIndex(pcIdx: number, off: number)
{
    return off + 2 + pcIdx;
}

function collectLabels(isns: Iterable<Isn>)
{
    const branchUses = new Set<number>()
    const literalUses = new Set<number>()

    let hwOff = 0;
    for(const isn of isns)
    {
        if(isn.branch !== undefined) branchUses.add(branchTargetIndex(hwOff, isn.branch))
        else if(isn.access !== undefined) literalUses.add(pcRelIndex(hwOff, isn.access))
        hwOff += isn.isWide ? 2 : 1;
    }

    return [
        new Map<number, number>([...branchUses.values()].toSorted((a, b) => a - b).map((x, n) => [x, n])), 
        new Map<number, number>([...literalUses.values()].toSorted((a, b) => a - b).map((x, n) => [x, n]))
    ]
}
                
export function disassemble(input: {content?: Buffer, relocations?: Relocation[], address?: number}): string
{
    const address = input.address ?? 0
    const rel = new Map<number, Relocation>(input.relocations?.map(r => [r.offset, r]) ?? [])
    const bin = input.content
    if(bin === undefined) return "¯\_(ツ)_/¯"

    const isns = [...traverseInstructions(bin)]
    const [branchLabels, literalLabels] = collectLabels(isns);

    const isnParts: string[][] = []
    let hwOff = 0

    for(const isn of isns) 
    {
        const i = []
        
        if(isn.branch !== undefined)
        {
            i.push(branchLabels.get(isn.branch + 2 + hwOff))
        }
        else if(isn.access !== undefined)
        {
            const addr = pcRelIndex(hwOff, isn.access)
            i.push(literalLabels.get(addr))

            if(addr + 4 <= bin.byteLength)
            {
                i.push(bin.readUint32LE(addr))
            }
            else
            {
                i.push(0xdeadc0de)
            }
        }

        i.push(address + 2 * hwOff)
        const [first, ...rest] = isn.print(i)

        const strRel = rel.has(hwOff << 1) ? " # relocation" : ""

        const label = branchLabels.get(hwOff)
        const strLabel = (label === undefined ? '' : `l${label}:`)

        isnParts.push([
            (strLabel + " ".repeat(5)).substring(0, 5) + first, 
            rest.join(", ") + strRel,
        ])

        hwOff += isn.isWide ? 2 : 1
    }

    const width = Math.max(...isnParts.map(x => x[0].length))
    const padding = " ".repeat(width)

    const codeLen = isns.reduce((a, isn) => a + ((isn.isWide ?? false) ? 4 : 2), 0)
    const poolStart = (codeLen + 3) & ~3;

    return [
        ...isnParts.map((fr) => `${(fr[0] + padding).substring(0, width)} ${fr[1]}`),
        ...((function*(){
            for(let off = poolStart; off < bin.byteLength; off += 4)
            {
                const label = literalLabels.get(off)
                const l = ((label === undefined ? '' : `L${label}:`) + " ".repeat(5)).substring(0, 5)
                yield `${l}${hex(bin.readUint32LE(off))}`
            }
        })())
    ].join("\n")
}