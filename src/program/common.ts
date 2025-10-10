export const enum LoadStoreWidth {
    U1,  
    U2, 
    U4
}

export function asBytes(w: LoadStoreWidth): 1 | 2 | 4
{
    switch(w)
    {
        case LoadStoreWidth.U1: return 1
        case LoadStoreWidth.U2: return 2
        case LoadStoreWidth.U4: return 4
    }
}
