import assert from "assert"
import { BasicBlock, BranchTermination, StraightTermination } from "../cfg/basicBlock"
import { Value } from "../cfg/value"
import { LoReg, lr } from "./armv6"
import { calleeSaved, CoreReg, flagsReg, lowRegs } from "./registers"
import { Assembler, Label, Uoff27 } from "./assembler"
import { CmConditional, CmIsn } from "./instructions"

function collectCalleeSaves(bbs: BasicBlock[]): LoReg[] | undefined
{
    const calleeSaves = new Set<LoReg>();
    let pushLrPopPc = false;

    for(const bb of bbs)
    {
        for(const op of bb.ops)
        {
            // TODO if(op isntanceof InvokeProcedure) pushLrPopPc = true

            for(const operand of [...op.inputs, ...op.outputs])
            {
                if(operand.value !== flagsReg)
                {
                    assert(operand.value instanceof CoreReg)
                    const reg = operand.value.reg

                    if(3 < reg.idx)
                    {
                        calleeSaves.add(lowRegs[reg.idx])
                        pushLrPopPc = true
                    }
                }
            }
        }
    }

    if(pushLrPopPc) return [...calleeSaves.values()]       
}

function addPrelude(asm: Assembler, calleeSaves: LoReg[], spillSlotsUsed: number) 
{   
    if(calleeSaves !== undefined) 
    {
        asm.pushWithLr(calleeSaves)
    } 
    
    if(0 < spillSlotsUsed) 
    {
        assert(spillSlotsUsed < 128);
        asm.decrSp((spillSlotsUsed * 4) as Uoff27);
    }
}

function addPostlude(asm: Assembler, calleeSaves: LoReg[], spillSlotsUsed: number) 
{
    if(0 < spillSlotsUsed) 
    {
        asm.incrSp((spillSlotsUsed * 4) as Uoff27);
    }

    if(calleeSaves !== undefined) 
    {
        asm.popWithPc(calleeSaves.values())
    } 
    else
    {
        asm.bx(lr);
    }
}

function generateBody(asm: Assembler, bbs: BasicBlock[]) 
{
    const labels = bbs.map(() => new Label())

    for(let i = 0; i < bbs.length; i++)
    {
        asm.label(labels[i]);

        const bb = bbs[i];

        for(const op of bb.ops)
        {
            const cmOp = op as CmIsn;
            assert(cmOp.emit !== undefined);

            cmOp.emit(asm);
        }

        const term = bb.termination 
        let next = undefined

        if(term instanceof BranchTermination)
        {
            next = term.owise

            const cond = term.conditional;
            assert(cond instanceof CmConditional)

            const idx = bbs.findIndex(x => x === term.then);
            assert(0 <= idx && idx < bbs.length);

            cond.emit(asm, labels[idx])
        }
        else if(term instanceof StraightTermination)
        {
            next = term.next
        }

        if(i < bbs.length - 1)
        {
            assert(next !== undefined)

            if(next !== bbs[i + 1])
            {
                const idx = bbs.findIndex(x => x === next);
                assert(0 <= idx && idx < bbs.length);
                asm.b(labels[idx])
            }
        }
        else
        {
            assert(next === undefined)
        }
    }
}

export function generateCode(bbs: BasicBlock[]): Buffer<ArrayBufferLike> 
{
    /*
     * Collect register usage information for pre/postlude generation.
     */
    const calleeSaves = collectCalleeSaves(bbs)
    
    const spillSlotsUsed = 0

    /*
     * Start assembling the binary by adding the neceassary prelude.
     */
    const asm = new Assembler();
    addPrelude(asm, calleeSaves, spillSlotsUsed)

    generateBody(asm, bbs)
    
    addPostlude(asm, calleeSaves, spillSlotsUsed);

    return asm.assemble()
}
