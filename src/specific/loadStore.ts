import assert from "assert"
import { LoadStoreWidth } from "../program/common"
import { Arithmetic } from "../generic/arithmetic"
import { ArithmeticOperation, CopyOperation, LoadOperation, StoreOperation } from "../generic/operations"
import { CopyIsn, LoadImmOffset, LoadRegOffset, StoreImmOffset, StoreRegOffset } from "./instructions"
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

/*
 * For a word load/store operation:
 *
 *    [x] <- y
 *  
 * Find a succeding operation:
 * 
 *    z = x + 4    (or 4 + x)
 * 
 * And there are no other uses of 'x'
 */
function findMiaInc(op: LoadOperation | StoreOperation): ArithmeticOperation | undefined 
{
    /*
     * Ignore non word accesses
     */
    if(op.width === LoadStoreWidth.U4)
    {
        /*
         * Check that the address value has only one more use that is an addition
         */
        const next = op.address.nextUse
        if(next !== undefined 
            && next.op instanceof ArithmeticOperation 
            && next.op.op === Arithmetic.Add
            && next.isLastUse)
        {
            /*
             * Find the other (non 'x') operand of the addition
             */
            const incOp = next.op
            const [other, ...empty] = incOp.inputs.filter(x => x !== next)
            assert(empty.length === 0)

            /*
             * Check that it's 4
             */
            if(other.definition.op?.constValue() === 4)
            {
                return incOp
            }
        } 
    }
}

export function mapLoadStoreOp(op: LoadOperation | StoreOperation): Operation[]
{
    /*
    * Check if address value originates from addition
    */
    const root = findNonCopyOrigin(op.address.definition.op)
    if(root instanceof ArithmeticOperation && root.op === Arithmetic.Add)
    {
        const loi = new OpInfo(root.left)
        const roi = new OpInfo(root.right)

        /*
        * Do not process offset if result is constant (weird?)
        */
        if(loi.val === undefined || roi.val === undefined)
        {
            /*
            * Reverse args if better
            */
            const [base, offset] = roi.val !== undefined
                ? [loi, roi]
                : [roi, loi]

            /*
            * Check if offset can be specified as immediate
            */
            const off = offset.val
            if(off !== undefined && isLdstrImmOff(off, op.width))
            {
                if(true /* TODO contemplate if this is the right choice livenesswise */)
                {
                    return op instanceof LoadOperation 
                        ? [new LoadImmOffset(op.value.value, base.iop.value, off, op.width)]
                        : [new StoreImmOffset(op.value.value, base.iop.value, off, op.width)]
                }
            }
            
            if(true /* TODO contemplate if this is the right choice livenesswise */)
            {
                return op instanceof LoadOperation 
                    ? [new LoadRegOffset(op.value.value, base.iop.value, offset.iop.value, op.width)]
                    : [new StoreRegOffset(op.value.value, base.iop.value, offset.iop.value, op.width)]
            }
        }
    }

    /*
     * Decide early that it can by *mia-ed.
     */
    // const miaInc = findMiaInc(op)
    // if(miaInc)
    // {
    //     const ret = op instanceof LoadOperation 
    //             ? new LoadWordRegIncrement(op.debugInfo, op.value.value, op.address.value)
    //             : new StoreWordRegIncrement(op.debugInfo, op.value.value, op.address.value)

    //     /*
    //      * Pull succeding addition into the *mia
    //      */
    //     const copy = new CopyIsn(miaInc.debugInfo, miaInc.result.value, op.address.value);
    //     copy.source.definition = ret.address
    //     copy.destination.uses.push(...miaInc.result.uses)
    //     copy.destination.uses.forEach(u => u.definition = copy.destination)
    //     substitute.set(miaInc, copy)

    //     return [ret]
    // }

    return op instanceof LoadOperation 
        ? [new LoadImmOffset(op.value.value, op.address.value, 0, op.width)]
        : [new StoreImmOffset(op.value.value, op.address.value, 0, op.width)]
}