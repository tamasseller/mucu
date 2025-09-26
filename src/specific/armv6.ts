export abstract class AnyReg { public abstract get idx(): number; }
export abstract class LoReg extends AnyReg {}

class R0 extends LoReg { public get idx(): number { return 0; } }
class R1 extends LoReg { public get idx(): number { return 1; } }
class R2 extends LoReg { public get idx(): number { return 2; } }
class R3 extends LoReg { public get idx(): number { return 3; } }
class R4 extends LoReg { public get idx(): number { return 4; } }
class R5 extends LoReg { public get idx(): number { return 5; } }
class R6 extends LoReg { public get idx(): number { return 6; } }
class R7 extends LoReg { public get idx(): number { return 7; } }
class R8 extends AnyReg { public get idx(): number { return 8; } }
class R9 extends AnyReg { public get idx(): number { return 9; } }
class R10 extends AnyReg { public get idx(): number { return 10; } }
class R11 extends AnyReg { public get idx(): number { return 11; } }
class R12 extends AnyReg { public get idx(): number { return 12; } }
class Sp extends AnyReg { public get idx(): number { return 13; } }
class Lr extends AnyReg { public get idx(): number { return 14; } }
class Pc extends AnyReg { public get idx(): number { return 15; } }

export const r0 = new R0();
export const r1 = new R1();
export const r2 = new R2();
export const r3 = new R3();
export const r4 = new R4();
export const r5 = new R5();
export const r6 = new R6();
export const r7 = new R7();
export const r8 = new R8();
export const r9 = new R9();
export const r10 = new R10();
export const r11 = new R11();
export const r12 = new R12();
export const sp = new Sp();
export const lr = new Lr();
export const pc = new Pc();

export const enum Reg2Op
{
    //            opcode  m   dn
    AND   = 0b0100000000_000_000,
    EOR   = 0b0100000001_000_000,
    LSL   = 0b0100000010_000_000,
    LSR   = 0b0100000011_000_000,
    ASR   = 0b0100000100_000_000,
    ADC   = 0b0100000101_000_000,
    SBC   = 0b0100000110_000_000,
    ROR   = 0b0100000111_000_000,
    TST   = 0b0100001000_000_000,
    RSB   = 0b0100001001_000_000,
    CMP   = 0b0100001010_000_000,
    CMN   = 0b0100001011_000_000,
    ORR   = 0b0100001100_000_000,
    MUL   = 0b0100001101_000_000,
    BIC   = 0b0100001110_000_000,
    MVN   = 0b0100001111_000_000,
    SXH   = 0b1011001000_000_000,
    SXB   = 0b1011001001_000_000,
    UXH   = 0b1011001010_000_000,
    UXB   = 0b1011001011_000_000,
    REV   = 0b1011101000_000_000,
    REV16 = 0b1011101001_000_000,
    REVSH = 0b1011101011_000_000,
};

export const enum Reg3Op
{
    // 	        opcode  m   n  d/t
    ADDREG = 0b0001100_000_000_000,
    SUBREG = 0b0001101_000_000_000,
    ADDIMM = 0b0001110_000_000_000,
    SUBIMM = 0b0001111_000_000_000,
    STR    = 0b0101000_000_000_000,
    STRH   = 0b0101001_000_000_000,
    STRB   = 0b0101010_000_000_000,
    LDRSB  = 0b0101011_000_000_000,
    LDR    = 0b0101100_000_000_000,
    LDRH   = 0b0101101_000_000_000,
    LDRB   = 0b0101110_000_000_000,
    LDRSH  = 0b0101111_000_000_000,
};

export const enum Imm5Op
{
    //      opcode  imm5 m/n d/t
    LSL  = 0b00000_00000_000_000,
    LSR  = 0b00001_00000_000_000,
    ASR  = 0b00010_00000_000_000,
    STR  = 0b01100_00000_000_000,
    LDR  = 0b01101_00000_000_000,
    STRB = 0b01110_00000_000_000,
    LDRB = 0b01111_00000_000_000,
    STRH = 0b10000_00000_000_000,
    LDRH = 0b10001_00000_000_000,
};

export const enum Imm7Op
{
    //            opcode   imm7
    INCRSP = 0b101100000_0000000,
    DECRSP = 0b101100001_0000000,
};

export const enum Imm8Op
{
    //       opcode d/n   imm8
    MOV   = 0b00100_000_00000000,
    CMP   = 0b00101_000_00000000,
    ADD   = 0b00110_000_00000000,
    SUB   = 0b00111_000_00000000,
    STRSP = 0b10010_000_00000000,
    LDRSP = 0b10011_000_00000000,
    LDR   = 0b01001_000_00000000,
    ADR   = 0b10100_000_00000000,
    ADDSP = 0b10101_000_00000000,
};

export const enum NoArgOp
{
    CPSIE = 0b1011_0110_0110_0010,
    CPSID = 0b1011_0110_0111_0010,
    NOP   = 0b1011_1111_0000_0000,
    YIELD = 0b1011_1111_0001_0000,
    WFE   = 0b1011_1111_0010_0000,
    WFI   = 0b1011_1111_0011_0000,
    SEV   = 0b1011_1111_0100_0000,
};

export const enum BranchOp
{
    EQ   = 0b1101_0000_00000000,	// Equal 					  Z == 1
    NE   = 0b1101_0001_00000000,	// Not equal 				  Z == 0
    HS   = 0b1101_0010_00000000,	// Unsigned higher or same 	  C == 1
    LO   = 0b1101_0011_00000000,	// Unsigned lower 			  C == 0
    MI   = 0b1101_0100_00000000,	// Minus, negative 			  N == 1
    PL   = 0b1101_0101_00000000,	// Plus, positive 			  N == 0
    VS   = 0b1101_0110_00000000,	// Overflow 				  V == 1
    VC   = 0b1101_0111_00000000,	// No overflow 				  V == 0
    HI   = 0b1101_1000_00000000,	// Unsigned higher 			  C == 1 && Z == 0
    LS   = 0b1101_1001_00000000,	// Unsigned lower or same 	  C == 0 && Z == 1
    GE   = 0b1101_1010_00000000,	// Signed greater or equal    N == V
    LT   = 0b1101_1011_00000000,	// Signed less than           N != V
    GT   = 0b1101_1100_00000000,	// Signed greater than        Z == 0 && N == V
    LE   = 0b1101_1101_00000000,	// Signed less than or equal  Z == 1 || N != V
    UDF  = 0b1101_1110_00000000,	// Permanently undefined
    SVC  = 0b1101_1111_00000000,	// Supervisor call
    BKPT = 0b1011_1110_00000000,	// Breakpoint
};

export const enum HiRegOp
{
    ADD = 0b01000100_00000000,
    CMP = 0b01000101_00000000,
    MOV = 0b01000110_00000000,
    JMP = 0b01000111_00000000,
};

export const fmtReg2 = (op: Reg2Op, dn: number, m: number): number => op | (m << 3) | dn;
export const fmtReg3 = (op: Reg3Op, dt: number, n: number, m: number): number => op | (m << 6) | (n << 3) | dt;
export const fmtImm5 = (op: Imm5Op, dt: number, mn: number, imm5: number): number => op | (imm5 << 6) | (mn << 3) | dt;
export const fmtImm7 = (op: Imm7Op, imm7: number): number => op | imm7;
export const fmtImm8 = (op: Imm8Op, r: number, imm8: number): number => op | (r << 8) | imm8;
export const fmtNoArg = (op: NoArgOp): number => op
export const fmtBranchSvc = (op: BranchOp, imm8: number): number => op | (imm8 & 0xff);
export const fmtHiReg = (op: HiRegOp, dn: number, m: number): number => op | ((dn >>> 3) << 7) | (m << 3) | (dn & 0b0111);

export const fmtPushPop = (popNpush: boolean, includeExtra: boolean, regFlags: number): number => 
    0b1011_0_10_0_00000000 | (popNpush ? (1 << 11) : 0) | (includeExtra ? (1 << 8) : 0) | regFlags;

export const lsMia = (loadNstore: boolean, n: number, regFlags: number): number => 
    0b11000_00000000000 | (loadNstore ? (1 << 11) : 0) | (n << 8) | regFlags;

