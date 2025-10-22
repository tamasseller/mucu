import Procedure from './program/procedure';

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

export interface SymInfo
{
    address: number,
    size: number
}

export interface Executable
{
    entry: number
    fragments: Fragment[]
    symbols: Map<Symbol, SymInfo>
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

export function link(entry: Procedure, inputs: FragmentInput[]): Executable
{
    let currentLocation = 0;
    
    const addresses = new Map<Symbol, SymInfo>()

    const fragments: Fragment[] = []

    for(const i of inputs)
    {
        currentLocation = i.startAddress ?? currentLocation
        let start: number | undefined

        for(const o of i.objects)
        {
            currentLocation = align(currentLocation, o.alignmentBits ?? 0)
            start ??= currentLocation

            addresses.set(o.symbol, {address: currentLocation, size: o.length});
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
            assert(o.content?.length ?? 0 <= o.length)

            const addr = addresses.get(o.symbol).address
            const off = addr - f.address

            if(o.content)
            {
                o.content.copy(f.content, off)
            }
            
            for(const r of o.relocations)
            {
                const t = addresses.get(r.target).address
                assert(t != undefined, "Undefined reference (TODO: add some info as to where and what somehow)")
                r.action(f.content.subarray(off + r.offset), addr + r.offset, t)
            }
        }
    }

    return {
        entry: addresses.get(entry).address,
        fragments: fragments,
        symbols: addresses
    }
}