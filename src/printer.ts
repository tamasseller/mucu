import assert from "assert";
import { BasicBlock, BranchTermination, Conditional, ExitTermination, Operation, StraightTermination, Termination } from "./cfg/basicBlock";
import { ArgumentOperation, ArithmeticOperation, conditionStr, CopyOperation, LiteralOperation, LoadOperation, RetvalOperation, StoreOperation, TacConditional } from "./generic/operations";
import { reversePostOrderBlocks } from "./cfg/traversal";
import { Variable } from "./program/expression";
import { arithmeticStr } from "./generic/arithmetic";
import { InputOperand, Operand } from "./cfg/value";
import { AddSubRegImm8, AddSubRegRegImm3, AddSubRegRegReg, ArgumentPseudoIsn, ArithRegReg, CmConditional, cmConditionStr, CompareNegRegReg, CompareRegImm8, CompareRegReg, LiteralIsn, LoadImmOffset, LoadRegOffset, LoadWordRegIncrement, RetvalPseudoIsn, ShiftRegRegImm5, StoreImmOffset, StoreRegOffset, StoreWordRegIncrement, TestRegReg } from "./specific/instructions";
import { CoreReg, flagsReg } from "./specific/registers";

function formatHex(v: number, pad: number): string {
    return "0x" + ("0".repeat(pad) + v.toString(16)).slice(-pad);
}

function format32(v: number): string {
    return formatHex(v, 8)
}

class Numberer<T> {
    private n = 0
    private map = new Map<T, number>()

    get(k: T) {
        const old = this.map.get(k)
        if (old !== undefined) return old

        const neu = this.n++
        this.map.set(k, neu)
        return neu
    }
}

export class ProcedurePrinter {
    readonly varNum = new Numberer<Variable>()
    readonly blkNum = new Map<BasicBlock, number>()

    public name(t: Variable, addCv = false) {
        assert(t instanceof Variable)
        return `v${this.varNum.get(t)}`
    }

    public goto(target: BasicBlock): string {
        return (target !== undefined) ? `goto #${this.blkNum.get(target)}` : 'return'
    }

    public value(t: Operand) {
        const cv = (t instanceof InputOperand) ? t.definition?.op?.constValue() : undefined

        
        const name = t.value === flagsReg 
            ? "$" 
            : t.value instanceof CoreReg
                ? `r${t.value.reg.idx}`
                : `x${t.value.idx}`

        return name + ((cv !== undefined) ? `(${format32(cv)})` : "")
    }

    private heading = (bb: BasicBlock) =>
        [
            `// pred: [${([...bb.predecessors].map(p => this.blkNum.get(p)).toSorted()).join(', ')}]`,
            `// in:   [${([...bb.used].map(([k, v]) => `${this.value(v)}=${this.name(k)}`).toSorted()).join(', ')}]`,
            `// out:  [${([...bb.defd].map(([k, v]) => `${this.name(k)}=${this.value(v)}`).toSorted()).join(', ')}]`,
        ]

    private operation(op: Operation) {
        if (op instanceof AddSubRegRegImm3 || op instanceof ShiftRegRegImm5) {
            return `$, ${this.value(op.result)} := ${this.value(op.left)} ${arithmeticStr(op.op)} ${op.right}`
        }
        else if (op instanceof ArithRegReg) {
            return `$, ${this.value(op.leftResult)} ${arithmeticStr(op.op)}= ${this.value(op.right)}`
        }
        else if (op instanceof CompareRegReg) {
            return `$ = ${this.value(op.left)} - ${this.value(op.right)}`
        }
        else if (op instanceof CompareNegRegReg) {
            return `$ = ${this.value(op.left)} + ${this.value(op.right)}`
        }
        else if (op instanceof TestRegReg) {
            return `$ = ${this.value(op.left)} & ${this.value(op.right)}`
        }
        else if (op instanceof AddSubRegRegReg) {
            return `$, ${this.value(op.result)} := ${this.value(op.left)} ${arithmeticStr(op.op)} ${this.value(op.right)}`;
        }
        else if (op instanceof AddSubRegImm8) {
            return `$, ${this.value(op.leftResult)} ${arithmeticStr(op.op)}= ${op.right}`
        }
        else if (op instanceof CompareRegImm8) {
            return `$ = ${this.value(op.left)} - ${op.right}`
        }
        else if (op instanceof LoadRegOffset) {
            return `${this.value(op.value)} <- [${this.value(op.base)}, ${this.value(op.offset)}]`;
        }
        else if (op instanceof LoadImmOffset) {
            return `${this.value(op.value)} <- [${this.value(op.base)}, ${op.offset}]`;
        }
        else if (op instanceof LoadWordRegIncrement) {
            return `${op.values.map(v => this.value(v)).join(", ")} <- [${this.value(op.address)} ++ 4]`;
        }
        else if (op instanceof StoreRegOffset) {
            return `[${this.value(op.base)}, ${this.value(op.offset)}] <- ${this.value(op.value)}`
        }
        else if (op instanceof StoreImmOffset) {
            return `[${this.value(op.base)}, ${op.offset}] <- ${this.value(op.value)}`
        }
        else if (op instanceof StoreWordRegIncrement) {
            return `[${this.value(op.address)} ++ 4] <- ${op.values.map(v => this.value(v)).join(", ")}`
        }
        else if (op instanceof LiteralIsn) {
            return `$, ${this.value(op.result)} := ${format32(op.value)}`;
        }
        else if (op instanceof LiteralOperation) {
            return `${((op instanceof LiteralIsn) ? '$, ' : '')}${this.value(op.result)} := ${format32(op.value)}`;
        }
        else if (op instanceof ArgumentPseudoIsn || op instanceof ArgumentOperation) {
            return `arg${op.idx} ${this.value(op.value)}`;
        }
        else if (op instanceof RetvalOperation || op instanceof RetvalPseudoIsn) {
            return `ret${op.idx} ${this.value(op.value)}`;
        }
        else if (op instanceof LoadOperation) {
            return `${this.value(op.value)} <- [${this.value(op.address)}]`;
        }
        else if (op instanceof StoreOperation) {
            return `[${this.value(op.address)}] <- ${this.value(op.value)}`
        }
        else if (op instanceof ArithmeticOperation) {
            return `${this.value(op.result)} := ${this.value(op.left)} ${arithmeticStr(op.op)} ${this.value(op.right)}`;
        }
        else {
            assert(op instanceof CopyOperation)
            return `${this.value(op.destination)} := ${this.value(op.source)}`;
        }
    }

    private condition(cond: Conditional): string {
        if (cond instanceof TacConditional) {
            return `${this.value(cond.left)} ${conditionStr(cond.condition)} ${this.value(cond.right)}`
        }
        else {
            assert(cond instanceof CmConditional)
            return `$ ${cmConditionStr(cond.condition)}`
        }
    }

    private closing = (termination: Termination) => 
    {
        if (termination instanceof StraightTermination) {
            return this.goto(termination.next);
        }
        else if(termination instanceof BranchTermination)
        {
            return `if ${this.condition(termination.conditional)} `
                + `then ${this.goto(termination.then)} `
                + `else ${this.goto(termination.owise)}`;
        }
        else
        {
            assert(termination instanceof ExitTermination) 
            return 'return';
        }
    }

    public printBlock = (bb: BasicBlock) =>
        [
            ...this.heading(bb),
            ...([...bb.ops].map(op => this.operation(op))),
            this.closing(bb.termination),
        ].join("\n\t")

    private constructor(blocks: BasicBlock[]) {
        blocks.forEach((bb, i) => {
            this.blkNum.set(bb, i);
        })
    }

    public static print(entry: BasicBlock) {
        const blocks = reversePostOrderBlocks(entry)
        const printer = new ProcedurePrinter(blocks)

        return blocks.map(bb => `#${printer.blkNum.get(bb)}:\n\t${printer.printBlock(bb)}`).join("\n")
    }
}