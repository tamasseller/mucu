import Procedure from "./program/procedure";
import { reversePostOrderBlocks } from "./cfg/traversal";
import { generateCfg } from "./generic/generateCfg";
import { propagateCopies, addTransitBindings, retardDefinitions, removeIdentyOperations } from "./generic/localPasses";
import { mergeMia, selectInstructions } from "./specific/machine";
import { breakCriticalEdges, eliminateDumbJumps, foldConstantConditionals, mergeIdenticalPredecessors, mergeBlocks as mergeTrivialEdges, straightenConditionals } from "./generic/factoring";
import { transformConditional } from "./specific/conditional";
import { straightenLoops } from "./generic/loops";
import { generateCode } from "./specific/generateCode";
import { BasicBlock } from "./cfg/basicBlock";
import { allocateRegisters } from "./generic/registerAllocation";
import { ProcedurePrinter } from "./printer";
import { RelocatableObject } from "./linker";
import {hoistLiterals} from "./specific/hoistLiterals"

interface CompilerOptions
{
    dumpCfg?: boolean
}

export function compile(ast: Procedure, opts?: CompilerOptions): RelocatableObject
{
    /*
     * First convert the AST of the procedure into an inital CFG form where
     * each bb has only local SSA values plus two maps for the of input 
     * and output values of variables accessed in that basic block
     */
    let cfg = generateCfg(ast);

    for(const pass of 
    [
        /*
        * Eliminate empty blocks that may appear in odd corner cases during 
        * CFG generation even if the initial AST would not motivate it and 
        * could only be avoid at the cost of significantly higher complexity.
        */
        [eliminateDumbJumps, "eliminate dumb jumps"],

        /*
        * Merge blocks along tivial edges to get constant as close as possible
        * to branches.
        */
        [mergeTrivialEdges, "merge blocks"],

        /*
        * Merge up conditionally terminated blocks to their predecessor (which 
        * might genuinely cause some code duplication) if it allows weakening 
        * the conditional to a straight termination.
        */
        [foldConstantConditionals, "fold constant conditionals"],

        /*
        * New trivial edges might have been created, merge blocks along them.
        */
        [mergeTrivialEdges, "merge blocks again"],

        /*
        * Eliminate edges where both the source has multiple successors 
        * and the target has multiple predecessors by inserting an empty 
        * intermediate node in order to hold the moves that may be required 
        * when coming out of SSA form (i.e. binding the local values of 
        * subsequent bbs together).
        * 
        * This handles the lost-copy problem of out of SSA conversion
        * https://www.cs.princeton.edu/courses/archive/spring16/cos320/lectures/15-SSA.pdf
        */
        [breakCriticalEdges, "break critical edges"],
        
        /*
        * Add pass-throuh input and output definitons to basic blocks,
        * where a variable's value is used in some successor but not 
        * locally, based on the plain variable level liveness information.
        * Also remove unused exports, thus achieving pruned SSA form.
        */
        [addTransitBindings, "add transit bindings"],

        /*
        * Eliminate operations that do nothing (like add zero, times one, etc...)
        */
        [removeIdentyOperations, "remove identy operations"],

        /*
        * Arrange literals such that pool accesses can be less dumb, by examining the 
        * whole block in advance to find opportunities for load deduplication. Also weeds
        * out unnecessary contants from the pool globally, where zero cost synthesis is 
        * available (e.g.immediate offset load/store)
        */
        [hoistLiterals, "host literals"],

        /*
        * Substitute generic TAC operations for achitecture specific ones
        * that have proper descriptions for the actual register constraints. 
        */
        [selectInstructions, "select instructions"],
        
        /* 
        * Convert branches to an architecture specific conditonal and 
        * possibly add some auxiliary instructions as well to make it work.
        */
        [transformConditional, "transform conditional"],

        /*
        * Propagate last-use copies (renaming) that may be present in the
        * source or are introduced by the substitution steps where deciding
        * if they are needed would be prohibitively complex without context
        */
        [propagateCopies, "propagate copies"],

        /*
        * Reorder operations in order to try and move definitions of values
        * closer to their first use thus decreasing register pressure
        */
        [retardDefinitions, "retard definitions"],

        /*
        * Assign actual hardware registers to hold the abstract values used
        * in the previous steps. Runs a coloring, coalescing, spilling 
        * procedure that may need to take some iterations of altering the 
        * CFG in order to make the interference graph colorable.
        */
        [allocateRegisters, "allocate registers"],

        /*
        * Merge subsequent instances of ldmia/stmia instructions where adequate.
        */
        [mergeMia, "merge mia"],
        
        /*
        * Eliminate pointless bbs, made possible by the removal of unnecessary pessimistic moves.
        */
        [eliminateDumbJumps, "eliminate dumb jumps (reloaded)"],

        /*
        * Merge blocks along tivial edges.
        */
        [mergeTrivialEdges, "merge blocks"],

        /*
        * Merge blocks along tivial edges.
        */
        [mergeIdenticalPredecessors, "merge identical predecessors"],

        /*
        * Rotate the conditional terminations to make loop bodies as straight as possible, this 
        * can affect the final order of bbs.
        */
        [straightenLoops, "straighten loops"]
    ]) {
        if(opts?.dumpCfg ?? false)
        {
            console.log(`\n${ProcedurePrinter.print(cfg)}\n\n${pass[1]}`)
        }

        cfg = (pass[0] as (bb: BasicBlock) => BasicBlock)(cfg)
    }

    if(opts?.dumpCfg ?? false)
    {
        console.log(`\n${ProcedurePrinter.print(cfg)}\n\n`)
    }

    /*
     * Commit to the final ordering of bbs.
     */
    const bbs = reversePostOrderBlocks(cfg)

    /*
     * Straighten all conditionals conservatively given the final block order.
     */
    straightenConditionals(bbs)
    
    if(opts?.dumpCfg ?? false)
    {
        console.log(`straightenConditionals\n${ProcedurePrinter.print(cfg)}\n\n`)
    }
    /* 
     * Finally generate the binary.
     */
    const code = generateCode(bbs)

    return {
        symbol: ast,
        length: code.content.length,
        ...code
    }
}

// TODO implement procedure calls
//      - isn clobber list
//      - signature abstraction
//      - invoke isn

// TODO implement spilling
//      - return verbose coloring failure info to find spill-worthy candidates and live ranges
//      - find failure ranges (where all failed coalitions are live)
//      - select a value to spill 
//      - add spill code
//      - rebuild and retry
//      - do spill coloring

// TODO add spilling related missing features
//      - nonreg arguments/retvals
//      - frame allocation
