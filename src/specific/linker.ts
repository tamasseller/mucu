import * as armv6 from './armv6';

import assert from "assert"

export type Symbol = any

export type RelocAction = (isn: Buffer, selfAddr: number, targetAddr: number) => void

export class Relocation
{
    offset: number
    target: Symbol
    action: RelocAction
}

export interface RelocatableObject
{
    symbol: Symbol
    length: number
    alignmentBits?: number 
    content?: Buffer
    relocations: Relocation[]
}

export interface Fragment
{
    address: number
    content: Buffer
}

export interface Executable
{
    entry: number
    fragments: Fragment[]
    symbols: Map<Symbol, number>
}

export interface FragmentInput
{
    startAddress?: number
    fill?: string | Uint8Array | number
    objects: RelocatableObject[]
}

function align(v: number, bits: number): number
{
    const alignMask = (1 << bits) - 1
    return (v + alignMask) & ~alignMask
}

export function thumbBlReloc(isn: Buffer, selfAddr: number, targetAddr: number) 
{
    assert((selfAddr & 1) == 0)
    assert((targetAddr & 1) == 0)

    const off = (selfAddr >>> 1) - ((targetAddr >>> 1) + 2);

    assert(-8388608 <= off && off <= 8388607)
    isn.writeUint32LE(armv6.fmtBl(off))
}

export function link(entry: Symbol, inputs: FragmentInput[]): Executable
{
    let currentLocation = 0;
    
    const addresses = new Map<Symbol, number>()

    const fragments: Fragment[] = []

    for(const i of inputs)
    {
        currentLocation = i.startAddress ?? currentLocation
        let start: number | undefined

        for(const o of i.objects)
        {
            currentLocation = align(currentLocation, o.alignmentBits ?? 0)
            start ??= currentLocation

            addresses.set(o.symbol, currentLocation);
            currentLocation += o.length
        }

        if(start !== undefined)
        {
            const len = currentLocation - start
            fragments.push({
                address: start,
                content: Buffer.alloc(len, i.fill)
            })
        }
    }
    
    for(let idx = 0; idx < inputs.length; idx++)
    {
        const i = inputs[idx]
        const f = fragments[idx]

        for(const o of i.objects)
        {
            const addr = addresses.get(o.symbol)
            const off = addr - f.address

            if(o.content)
            {
                o.content.copy(f.content, 0, off)
            }
            
            for(const r of o.relocations)
            {
                const t = addresses.get(r.target)
                assert(t != undefined, "Undefined reference (TODO: add some info as to where and what somehow)")
                r.action(f.content.subarray(off + r.offset), addr + r.offset, t)
            }
        }
    }

    return {
        entry: addresses.get(entry),
        fragments: fragments,
        symbols: addresses
    }
}