import { TypedArray } from './data.types';

export const REQ = {
    PUT: 'PUT',
    GET: 'GET',
    POST: 'POST',
    MULTI_PART_UPLOAD: 'MULTI_PART_UPLOAD',
} as const;

export type ReqBody = TypedArray | Blob | string;
