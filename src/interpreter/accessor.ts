export interface MemoryAccessor 
{
    write(address: number, values: Buffer, done: () => void, fail: (e: Error) => void): any;
    read(address: number, length: number, done: (v: Buffer) => void, fail: (e: Error) => void): any;
    wait(address: number, mask: number, value: number, done: () => void, fail: (e: Error) => void): any;

    special(param: any): any;

    flush(handles: any[]): void;
}
