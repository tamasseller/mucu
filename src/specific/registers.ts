import { Value } from "../cfg/value";
import * as armv6 from "./armv6";

export class CoreReg extends Value
{
    constructor(readonly reg: armv6.LoReg) {
        super();
    }
}

export const reg0 = new CoreReg(armv6.r0)
export const reg1 = new CoreReg(armv6.r1)
export const reg2 = new CoreReg(armv6.r2)
export const reg3 = new CoreReg(armv6.r3)
export const reg4 = new CoreReg(armv6.r4)
export const reg5 = new CoreReg(armv6.r5)
export const reg6 = new CoreReg(armv6.r6)
export const reg7 = new CoreReg(armv6.r7)
export const flagsReg = new Value()

export const lowRegs = [
    reg0,
    reg1,
    reg2,
    reg3,
    reg4,
    reg5,
    reg6,
    reg7,
]

export function allLowRegsBut(reg: CoreReg): CoreReg[]
{
    return lowRegs.filter(r => r !== reg);
}

export const args = [
    reg0,
    reg1,
    reg2,
    reg3,
]

export const retVals = [...args]

export const calleeSaved = [
    reg4,
    reg5,
    reg6,
    reg7,
]

