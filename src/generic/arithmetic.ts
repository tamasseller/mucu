export const enum Arithmetic
{
    Add, Sub, Mul,
    Shl, Shr,
    BitAnd, BitOr, BitXor,
}

export function arithmeticEval(op: Arithmetic, left: number, right: number): number
{
    switch (op)
    {
        case Arithmetic.Add:    return left + right;
        case Arithmetic.Sub:    return left - right;
        case Arithmetic.Mul:    return left * right;
        case Arithmetic.Shl:    return left << right;
        case Arithmetic.Shr:    return left >>> right;
        case Arithmetic.BitAnd: return left & right;
        case Arithmetic.BitOr:  return left | right;
        case Arithmetic.BitXor: return left ^ right;
    }
}

export function arithmeticStr(op: Arithmetic): string
{
    switch (op) 
    {
        case Arithmetic.Add:    return "+";
        case Arithmetic.Sub:    return "-";
        case Arithmetic.Mul:    return "*";
        case Arithmetic.Shl:    return "<<";
        case Arithmetic.Shr:    return ">>";
        case Arithmetic.BitAnd: return "&";
        case Arithmetic.BitOr:  return "|";
        case Arithmetic.BitXor: return "^";
    }
}
