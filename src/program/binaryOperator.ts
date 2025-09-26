export const enum BinaryOperator
{
    /*  0 */ Add, 
    /*  1 */ Sub, 
    /*  2 */ Mul,
    /*  3 */ Shl, 
    /*  4 */ Shr, 
    /*  5 */ BitAnd, 
    /*  6 */ BitOr, 
    /*  7 */ BitXor,
    /*  8 */ Eq, 
    /*  9 */ Ne, 
    /* 10 */ Lt, 
    /* 11 */ Gt, 
    /* 12 */ Le, 
    /* 13 */ Ge,
    /* 14 */ LogAnd, 
    /* 15 */ LogOr,
}

export const arithmeticOperators = [
    BinaryOperator.Add, 
    BinaryOperator.Sub, 
    BinaryOperator.Mul,
    BinaryOperator.Shl, 
    BinaryOperator.Shr, 
    BinaryOperator.BitAnd, 
    BinaryOperator.BitOr, 
    BinaryOperator.BitXor
]

export const logicOperators = [
    BinaryOperator.Eq,
    BinaryOperator.Ne,
    BinaryOperator.Lt,
    BinaryOperator.Gt,
    BinaryOperator.Le,
    BinaryOperator.Ge,
    BinaryOperator.LogAnd, 
    BinaryOperator.LogOr
]

export const comparisonOperators = [
    BinaryOperator.Eq,
    BinaryOperator.Ne,
    BinaryOperator.Lt,
    BinaryOperator.Gt,
    BinaryOperator.Le,
    BinaryOperator.Ge
]

export function evaluteOperator(operator: BinaryOperator, lhs: number, rhs: number) {
    switch (operator) {
        case BinaryOperator.Add: return (lhs + rhs) >>> 0;
        case BinaryOperator.Sub: return (lhs - rhs) >>> 0;
        case BinaryOperator.Mul: return (lhs * rhs) >>> 0;
        case BinaryOperator.Shl: return (lhs << rhs) >>> 0;
        case BinaryOperator.Shr: return (lhs >>> rhs) >>> 0;
        case BinaryOperator.BitAnd: return (lhs & rhs) >>> 0;
        case BinaryOperator.BitOr: return (lhs | rhs) >>> 0;
        case BinaryOperator.BitXor: return (lhs ^ rhs) >>> 0;
        case BinaryOperator.Eq: return lhs === rhs ? 1 : 0;
        case BinaryOperator.Ne: return lhs !== rhs ? 1 : 0;
        case BinaryOperator.Lt: return lhs < rhs ? 1 : 0;
        case BinaryOperator.Gt: return lhs > rhs ? 1 : 0;
        case BinaryOperator.Le: return lhs <= rhs ? 1 : 0;
        case BinaryOperator.Ge: return lhs >= rhs ? 1 : 0;
        case BinaryOperator.LogAnd: return lhs && rhs ? 1 : 0;
        case BinaryOperator.LogOr: return lhs || rhs ? 1 : 0;
    }
}

export function operatorPrecedence(operator: BinaryOperator)
{
    switch(operator)
    {
        case BinaryOperator.Mul:    return 10
        case BinaryOperator.Add:
        case BinaryOperator.Sub:    return 9
        case BinaryOperator.Shl:
        case BinaryOperator.Shr:    return 8
        case BinaryOperator.Lt:
        case BinaryOperator.Le:     return 7
        case BinaryOperator.Gt:
        case BinaryOperator.Ge:     return 6
        case BinaryOperator.Eq:
        case BinaryOperator.Ne:     return 5
        case BinaryOperator.BitAnd: return 4
        case BinaryOperator.BitXor: return 3
        case BinaryOperator.BitOr:  return 2
        case BinaryOperator.LogAnd: return 1
        case BinaryOperator.LogOr:  return 0

    }
}

export function operatorToString(operator: BinaryOperator): string {
    switch (operator) {
        case BinaryOperator.Add:    return "+"
        case BinaryOperator.Sub:    return "-"
        case BinaryOperator.Mul:    return "*"
        case BinaryOperator.Shl:    return "<<"
        case BinaryOperator.Shr:    return ">>"
        case BinaryOperator.BitAnd: return "&"
        case BinaryOperator.BitOr:  return "|"
        case BinaryOperator.BitXor: return "^"
        case BinaryOperator.Eq:     return "=="
        case BinaryOperator.Ne:     return "!="
        case BinaryOperator.Lt:     return "<"
        case BinaryOperator.Gt:     return ">"
        case BinaryOperator.Le:     return "<="
        case BinaryOperator.Ge:     return ">="
        case BinaryOperator.LogAnd: return "&"
        case BinaryOperator.LogOr:  return "|"
    }
}
