import { Variable } from "../program/expression"
import { Statement } from "../program/statement"

export class Special extends Statement 
{
    constructor(readonly param: any) {
        super()
    }

    get referencedVars(): Variable[] {
        return []
    }
}
