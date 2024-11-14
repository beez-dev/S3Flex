/**
 *
 * @param arr Is the entire array full of only null values
 */
export function isNullArray<T>(arr: T[]) {
    return arr.every((item) => item === null);
}

export function getNonNullItems<T>(arr: T[]) {
    return arr.filter((item) => item !== null);
}

export function getNullIndex<T>(arr: T[]) {
    return arr.findIndex((e) => e === null);
}

export function isIncluded<T = string | number>(value: T, arr: T[]) {
    return arr.findIndex((e) => e === value);
}
