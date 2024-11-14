import { getDefinedNumber } from '../utils/number.util';
import { REQ, ReqBody } from '../common/types/request.types';

import { getDefined } from '../utils/object.util';

import { S3FlexClient } from '../client/s3FlexClient';
import { S3FlexClientConfig } from '../common/types/s3.types';

export type UploadChunkResponse = {
    e_tag: string;
    part_no: number;
};

export type UploadOptions = {
    contentType?: string;
    timeout?: number; // in ms
    contentEncoding?: CompressionFormat;
    accessControlAllowedOrigin?: string;
    noOfRetries?: number;
    onTimeoutError?: () => void;
    onBeforeRetry?: () => void;
};

export class S3FlexBase {
    private _defaultChunkSizeForStreamingData = 2 * 1024 ** 2;
    private _s3FlexClient: S3FlexClient;

    constructor() {
        this._s3FlexClient = new S3FlexClient();
    }

    configure(config: S3FlexClientConfig) {
        this._s3FlexClient = new S3FlexClient(config);
    }

    get client() {
        return this._s3FlexClient;
    }

    async uploadChunk(
        url: string,
        body: ReqBody,
        partNo: number,
        options: {
            contentType?: string;
            timeout?: number; // in ms
            contentEncoding?: CompressionFormat;
            accessControlAllowOrigin?: string;
            noOfRetries?: number;
            onBeforeRetry?: () => void;
            onTimeoutError?: () => void;
        } = { noOfRetries: 3 },
    ): Promise<UploadChunkResponse | null> {
        if (options.noOfRetries && options.noOfRetries < 0) {
            return null;
        }

        try {
            const response = await fetch(url, {
                signal:
                    options?.timeout === undefined
                        ? undefined
                        : AbortSignal.timeout(options?.timeout),
                method: REQ.PUT,
                body,
                headers: getDefined({
                    'content-type': options.contentType,
                    'content-encoding': options.contentEncoding,
                    'access-control-allow-origin':
                        options.accessControlAllowOrigin, // TODO - [TASK] Remove hardcode
                }),
            });

            return {
                e_tag: response.headers.get('ETag') ?? '',
                part_no: partNo,
            };
        } catch (error: any) {
            if (error.name === 'TimeoutError') {
                options?.onTimeoutError?.();
            }

            options?.onBeforeRetry?.();

            return this.uploadChunk(
                url,
                body,
                partNo,
                getDefined({
                    contentEncoding: options.contentEncoding,
                    contentType: options.contentType,
                    accessControlAllowOrigin: options.accessControlAllowOrigin,
                    timeout: options?.timeout,
                    noOfRetries: (options.noOfRetries ?? 0) - 1,
                }),
            );
        }
    }

    async uploadBuffer(
        url: string,
        body: Buffer,
        options: UploadOptions,
    ): Promise<any> {
        const noOfRetries = getDefinedNumber(options?.noOfRetries, 3);

        if (noOfRetries < 0) {
            return null;
        }

        try {
            const response = await fetch(url, {
                signal:
                    options?.timeout === undefined
                        ? undefined
                        : AbortSignal.timeout(options.timeout),
                method: REQ.PUT,
                body,
                headers: getDefined({
                    'content-type': options?.contentType,
                    'content-encoding': options?.contentEncoding,
                }),
            });

            return response;
        } catch (error: any) {
            if (error.name === 'TimeoutError') {
            }

            options?.onBeforeRetry?.();

            return this.uploadBuffer(url, body, {
                ...options,
                noOfRetries: noOfRetries - 1,
            });
        }
    }

    /**
     * Get the default chunk size to be used for breaking data in chunks
     */
    get defaultChunkSize() {
        return this._defaultChunkSizeForStreamingData;
    }
}
