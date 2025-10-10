import { Assignment, Store, Loop, Branch, Jump, Call } from "../program/statement";
import { Special } from "./special";

export interface Observer
{
    observeEntry(): void
    observeExit(): void
    observeSpecial(s: Special): void
    observeJump(s: Jump): void
    observeLoop(s: Loop): void
    observeBranch(s: Branch, taken: boolean): void
    observeWait(addr: number, mask: number, value: number): void
    observeStore(s: Store): void
    observeAssignment(s: Assignment): void
    observeCall(s: Call): void
    observerDiagnostic(msg: string): void;
}
