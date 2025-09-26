import Procedure from "./program/procedure";
import { reversePostOrderBlocks } from "./cfg/traversal";
import { generateCfg } from "./generic/generateCfg";
import { propagateCopies, addTransitBindings, retardDefinitions } from "./generic/localPasses";
import { selectInstructions } from "./specific/machine";
import { breakCriticalEdges, eliminateDumbJumps, straightenConditionals } from "./generic/factoring";
import { transformConditional } from "./specific/conditional";
import { straightenLoops } from "./generic/loops";
import { generateCode } from "./specific/generateCode";
import { BasicBlock } from "./cfg/basicBlock";
import { allocateRegisters } from "./generic/registerAllocation";
import { ProcedurePrinter } from "./printer";

export function compile(ast: Procedure): Buffer
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
        * Eliminate pointless bbs, made possible by the removal of unnecessary pessimistic moves.
        */
        [eliminateDumbJumps, "eliminate dumb jumps (reloaded)"],

        /*
        * Rotate the conditional terminations to make loop bodies as straight as possible, this 
        * can affect the final order of bbs.
        */
        [straightenLoops, "straighten loops"]
    ]) {
        console.log(`${pass[1]}:\n${ProcedurePrinter.print(cfg)}\n\n`)
        cfg = (pass[0] as (bb: BasicBlock) => BasicBlock)(cfg)
    }

    /*
     * Commit to the final ordering of bbs.
     */
    const bbs = reversePostOrderBlocks(cfg)

    /*
     * Straighten all conditionals conservatively given the final block order.
     */
    const straightenedCfg = straightenConditionals(bbs)
    
    /* 
     * Finally generate the binary.
     */
    return generateCode(bbs)
}

// TODO implement procedure calls
//      - isn clobber list
//      - signature abstraction
//      - relocations?
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

// TODO smarten removeDumbJumps to do some other factoring as well
// TODO smarten selectInstructions to do actual multireg *mia (copy double-word usecase)
