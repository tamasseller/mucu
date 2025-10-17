import assert from "assert"
import { LoadStoreWidth } from "../program/common"
import { Arithmetic } from "../generic/arithmetic"
import { ArithmeticOperation, CopyOperation, LoadOperation, StoreOperation } from "../generic/operations"
import { CopyIsn, LoadImmOffset, LoadRegOffset, LoadWordRegIncrement, StoreImmOffset, StoreRegOffset, StoreWordRegIncrement } from "./instructions"
import { OpInfo } from "./machine"
import { Operation } from "../cfg/basicBlock"

function ldstrSize(width: LoadStoreWidth) 
{
    switch(width)
    {
        case LoadStoreWidth.U1:
            return 1
        case LoadStoreWidth.U2:
            return 2
        case LoadStoreWidth.U4:
            return 4
    }
}

function isLdstrImmOff(off: number, width: LoadStoreWidth) 
{
    if((off & ldstrSize(width) - 1) != 0)
    {
        return false
    }

    switch(width)
    {
        case LoadStoreWidth.U1:
            return 0 <= off && off < 32
        case LoadStoreWidth.U2:
            return 0 <= off && off < 64 
        case LoadStoreWidth.U4:
            return 0 <= off && off < 128
    }
}

function findNonCopyOrigin(op: Operation): Operation 
{
    while(op instanceof CopyOperation || op instanceof CopyIsn)
    {
        op = op.source.definition.op
    }

    return op
}

export function mapLoadStoreOp(op: LoadOperation | StoreOperation, ignore: Set<Operation>): Operation[]
{
    /*
    * Check for *mia opportunity
    */    
    if(!op.address.isLastUse)
    {
        const nextOp = op.address.nextUse!.op

        if(nextOp instanceof ArithmeticOperation && nextOp.op === Arithmetic.Add) 
        {
            const addend = (nextOp.left.value === op.address.value ? nextOp.right : nextOp.left).constValue()

            if(addend === 4)
            {
                ignore.add(nextOp)

                return [
                    op instanceof LoadOperation 
                        ? new LoadWordRegIncrement(op.address.value, op.value.value)
                        : new StoreWordRegIncrement(op.address.value, op.value.value),
                    
                    new CopyIsn(nextOp.result.value, op.address.value)
                ]
            }
        }
    }

    /*
    * Check if address value originates from addition
    */
    if(op.address.isLastUse)    // TODO check that all other uses are offsetable load/stores instead
    {
        const root = findNonCopyOrigin(op.address.definition.op)
        if(root instanceof ArithmeticOperation && root.op === Arithmetic.Add && !ignore.has(root))
        {
            const loi = new OpInfo(root.left)
            const roi = new OpInfo(root.right)

            /*
            * Reverse args if better
            */
            const [base, offset] = (loi.val === undefined && roi.val !== undefined)
                                || (loi.val !== undefined && roi.val !== undefined && roi.val < loi.val)
                ? [loi, roi]
                : [roi, loi]

            /*
            * Check if offset can be specified as immediate
            */
            const off = offset.val
            if(off !== undefined && isLdstrImmOff(off, op.width))
            {
                return op instanceof LoadOperation 
                    ? [new LoadImmOffset(op.value.value, base.iop.value, off, op.width)]
                    : [new StoreImmOffset(op.value.value, base.iop.value, off, op.width)]
            }
            
            if(true /* TODO contemplate if this is the right choice livenesswise */)
            {
                return op instanceof LoadOperation 
                    ? [new LoadRegOffset(op.value.value, base.iop.value, offset.iop.value, op.width)]
                    : [new StoreRegOffset(op.value.value, base.iop.value, offset.iop.value, op.width)]
            }
        }
    }

    return op instanceof LoadOperation 
        ? [new LoadImmOffset(op.value.value, op.address.value, 0, op.width)]
        : [new StoreImmOffset(op.value.value, op.address.value, 0, op.width)]
}