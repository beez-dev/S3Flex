import { TypedArray } from '../common/types/data.types';

export function sumTypedArrayLength<T extends TypedArray>(arr: T[]) {
    return arr.reduce((acc, val) => acc + val.length, 0);
}

export function concatTypedArrays<T extends TypedArray>(
    arr: T[],
    accLen?: number,
) {
    const rqrdChnkData = new Uint8Array(accLen ?? sumTypedArrayLength(arr));

    let calculatedChnkLength = 0;
    arr.map((item, idx) => {
        // concatenate the chunks
        const startOffset = idx > 0 ? calculatedChnkLength : 0;

        rqrdChnkData.set(item, startOffset);
        calculatedChnkLength += item.length;
    });

    return rqrdChnkData;
}
