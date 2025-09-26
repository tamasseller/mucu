import { Operation } from "../cfg/basicBlock"
import { Arithmetic } from "../generic/arithmetic"
import { ArithmeticOperation } from "../generic/operations"
import { Imm3, Imm5, Imm8 } from "./assembler"
import { AddSubRegImm8, AddSubRegRegImm3, AddSubRegRegReg, ArithRegReg, CopyIsn, LiteralIsn, ShiftRegRegImm5 } from "./instructions"

export function mapArithmeticOp(op: ArithmeticOperation): Operation[]
{
    const c = op.constValue()
    if(c !== undefined)
    {
        return [new LiteralIsn(op.result.value, c)]
    }
    else
    {
        switch(op.op)
        {
            case Arithmetic.Add:
                {
                    const l = op.left.definition.op?.constValue()
                    if(l !== undefined)
                    {
                        if(l < 8)
                        {
                            return [new AddSubRegRegImm3(op.result.value, op.right.value, l as Imm3, Arithmetic.Add)]
                        }
                        else if(l < 256)
                        {
                            return [
                                new CopyIsn(op.result.value, op.right.value),
                                new AddSubRegImm8(op.result.value, l as Imm8, Arithmetic.Add)
                            ]
                        }
                    }
                }

                // NO BREAK
            case Arithmetic.Sub:
                {
                    const r = op.right.definition.op?.constValue()
                    if(r !== undefined)
                    {
                        if(r < 8)
                        {
                            return [new AddSubRegRegImm3(op.result.value, op.left.value, r as Imm3, op.op)]
                        }
                        else if(r < 256)
                        {
                            return [
                                new CopyIsn(op.result.value, op.left.value),
                                new AddSubRegImm8(op.result.value, r as Imm8, op.op)
                            ]
                        }
                    }
                }

                return [new AddSubRegRegReg(op.result.value, op.left.value, op.right.value, op.op)]

            case Arithmetic.Shl:
            case Arithmetic.Shr:
                const r = op.right.definition.op?.constValue()
                if(r !== undefined && r < 32)
                {
                    return [new ShiftRegRegImm5(op.result.value, op.left.value, (r & 31) as Imm5, op.op)]
                }

                // NO BREAK                    
            default: 
                // Arithmetic.Mul | Arithmetic.BitAnd | Arithmetic.BitOr | Arithmetic.BitXor
            
                return [
                    new CopyIsn(op.result.value, op.left.value),
                    new ArithRegReg(op.result.value, op.right.value, op.op)
                ]
        }
    }
}