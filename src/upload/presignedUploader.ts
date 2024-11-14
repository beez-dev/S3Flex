import { getDefined } from '../utils/object.util';
import { getNullIndex } from '../utils/array.util';
import { REQ } from '../common/types/request.types';
import { concatTypedArrays } from '../utils/byte.util';
import { S3FlexBase, UploadChunkResponse } from './base.s3flex';
import { BAD_REQUEST } from '../common/constants/response.constant';
import { FileUploadException } from '../common/exceptions/FileUploadException';

export type PresignedUploaderOptions = {
    timeout?: number;
    chunkSize: number;
    concurrency: number;
    noOfRetries?: number;
    compressionFormat: CompressionFormat | null;
    accessControlAllowOrigin: string;
};

export type MultipartUploadOptions = {
    upload_id: string;
    completion_url: string;
    abort_url: string;
    filePath: string;
};

export type onProgressParams = {
    dataReadProgress: number;
    dataUploadProgress: number;
    dataUploadProgressRate: number;
    additiveDataUploadProgressRate: number;
};

export class PresignedUploader extends S3FlexBase {
    private _concurrency;

    private _chunkSize = 0;

    private _timeout: number;
    private _noOfRetries: number;

    private _compressionFormat: CompressionFormat | null = null; // null means 'no compression', has to be specified explicity else 'gzip' is applied
    private _accessControlAllowOrigin: string;

    constructor(options?: Partial<PresignedUploaderOptions>) {
        super();

        this._compressionFormat =
            options?.compressionFormat !== null
                ? options?.compressionFormat || 'gzip'
                : null;

        this._concurrency = options?.concurrency || 4;
        this._chunkSize = options?.chunkSize || this.defaultChunkSize;

        this._noOfRetries = options?.noOfRetries || 3;
        this._accessControlAllowOrigin =
            options?.accessControlAllowOrigin || '*';

        this._timeout = options?.timeout || 5 * 1000;
    }

    static get(...params: ConstructorParameters<typeof PresignedUploader>) {
        return new PresignedUploader(...params);
    }

    /**
     * Buffer chunks from the stream to a fixed chunk size
     * @param param0
     */
    private async _multipartUpload(
        file: File | Blob,
        pUrls: string[],
        onProgress?: (
            onProgressParams: Partial<onProgressParams>,
            params: any,
        ) => void,
    ) {
        let accumulatedChunks = [] as Uint8Array[];
        let accumulatedChunkLength = 0;
        let fileCompletelyRead = false;
        let chunkUploadFailed = false;
        let multipartChunkNo = 0;

        let dataReadSize = 0;

        let uploadingSlots: Set<Promise<UploadChunkResponse | null>> =
            new Set();

        let results: Promise<UploadChunkResponse | null>[] = [];

        const streamReader = this._compressionFormat
            ? file
                  .stream()
                  .pipeThrough(
                      new TransformStream({
                          transform: (chunk, controller) => {
                              dataReadSize += chunk.byteLength;

                              controller.enqueue(chunk);
                          },
                      }),
                  )
                  .pipeThrough(new CompressionStream(this._compressionFormat))
                  .getReader()
            : file.stream().getReader();

        onProgress?.(
            {
                additiveDataUploadProgressRate: 0,
            },
            {},
        );

        while (!fileCompletelyRead) {
            let uploadChunkPromise: Promise<UploadChunkResponse | null> =
                new Promise(() => null);

            if (chunkUploadFailed) {
                return null;
            }

            const { done, value: chunk } = await streamReader.read();

            if (done) {
                fileCompletelyRead = true;

                // if all bytes have been read
                if (accumulatedChunkLength > 0) {
                    const dataChunk = concatTypedArrays(
                        accumulatedChunks,
                        accumulatedChunkLength,
                    );

                    uploadChunkPromise = this.uploadChunk(
                        pUrls[multipartChunkNo],
                        dataChunk,
                        multipartChunkNo + 1,
                        {
                            accessControlAllowOrigin:
                                this._accessControlAllowOrigin,
                            timeout: this._timeout,
                            noOfRetries: this._noOfRetries,
                        },
                    );

                    results.push(uploadChunkPromise);
                }

                const allResults = await Promise.all(results);

                onProgress?.(
                    {
                        additiveDataUploadProgressRate: Math.ceil(
                            (dataReadSize * 100) / file.size,
                        ),
                    },
                    {},
                );

                return allResults;
            }

            if (!ArrayBuffer.isView(chunk)) {
                throw 'Unknown data type';
            }

            const uint8Chunk = new Uint8Array(
                chunk.buffer,
                chunk.byteOffset,
                chunk.byteLength,
            );

            accumulatedChunks.push(uint8Chunk);
            accumulatedChunkLength += uint8Chunk.length;

            if (accumulatedChunkLength >= this._chunkSize) {
                const dataChunk = concatTypedArrays(
                    accumulatedChunks,
                    accumulatedChunkLength,
                );

                const uploadChunkSize = dataReadSize;
                dataReadSize = 0;

                uploadChunkPromise = this.uploadChunk(
                    pUrls[multipartChunkNo],
                    dataChunk,
                    multipartChunkNo + 1,
                    {
                        accessControlAllowOrigin:
                            this._accessControlAllowOrigin,
                        timeout: this._timeout,
                        noOfRetries: this._noOfRetries,
                    },
                );

                multipartChunkNo += 1;

                uploadingSlots.add(uploadChunkPromise);
                results.push(uploadChunkPromise);

                uploadChunkPromise
                    .then((result) => {
                        if (!result) {
                            chunkUploadFailed = true;
                            return null;
                        }

                        onProgress?.(
                            {
                                additiveDataUploadProgressRate: Math.ceil(
                                    (uploadChunkSize * 100) / file.size,
                                ),
                            },
                            {},
                        );
                    })
                    .catch((e) => {
                        console.error('[DEV]:: Error uploading chunk: ', e);
                    })
                    .finally(() => {
                        uploadingSlots.delete(uploadChunkPromise);
                    });

                if (uploadingSlots.size >= this.concurrency) {
                    await Promise.race(uploadingSlots);
                }

                accumulatedChunks = [];
                accumulatedChunkLength = 0;
            }
        }
    }

    private async abortMultipartUpload(
        filePath: string,
        abortUrl: string,
        uploadId: string,
    ) {
        try {
            return fetch(abortUrl, {
                method: REQ.PUT,
                headers: {
                    'content-type': 'application/json',
                    'access-control-allow-origin':
                        this._accessControlAllowOrigin,
                },
                body: JSON.stringify({
                    asset_title: filePath,
                    upload_id: uploadId,
                }),
            });
        } catch (err) {
            console.error('[DEV]:: Error while uploading chunk', err);
            // TODO - [TASK] Show popup to user
        }
    }

    async uploadWithPresignedUrl(file: File | Blob, presignedUrl: string) {
        if (!presignedUrl) {
            throw new FileUploadException(
                'Invalid presigned url.',
                BAD_REQUEST,
            );
        }

        return this.uploadBuffer(
            presignedUrl,
            Buffer.from(await file.arrayBuffer()),
            {
                contentType: file.type,
            },
        );
    }

    /**
     * Multipart file upload using presigned urls
     * @param file
     * @param multiPartPUrls
     * @param multiPartUploadOptions
     * @param onProgress
     * @returns
     */
    async multipartUploadWithPresignedUrls(
        file: File | Blob,
        getPresignedUrls: () => Promise<string[]> = async () => [],
        multiPartUploadOptions: MultipartUploadOptions,
        onProgress?: (
            onProgressParams?: Partial<onProgressParams>,
            params?: any,
        ) => void,
    ) {
        const multiPartPUrls = await getPresignedUrls();
        const estimatedNumberOfPresignedUrls = Math.ceil(
            file.size / this._chunkSize,
        );

        if (multiPartPUrls.length <= estimatedNumberOfPresignedUrls) {
            throw new FileUploadException(
                'Invalid presigned urls.',
                BAD_REQUEST,
            );
        }

        const results = await this._multipartUpload(
            file,
            multiPartPUrls,
            onProgress,
        );

        // complete multipart upload
        if (!results || getNullIndex(results) >= 0) {
            console.error(
                'Upload failed!! One or more chunks have errors uploading',
            );

            const abortMultipartResponse = await this.abortMultipartUpload(
                multiPartUploadOptions.filePath,
                multiPartUploadOptions.abort_url,
                multiPartUploadOptions.upload_id,
            );

            return { ...abortMultipartResponse, isAborted: true };
        }

        try {
            const completeRequestPromise = fetch(
                multiPartUploadOptions.completion_url,
                {
                    method: REQ.PUT,
                    headers: {
                        'content-type': 'application/json',
                        'access-control-allow-origin':
                            this._accessControlAllowOrigin,
                    },
                    body: JSON.stringify({
                        asset_path: multiPartUploadOptions.filePath,
                        upload_id: multiPartUploadOptions.upload_id,
                        multipart_upload_info: results,
                    }),
                },
            );

            onProgress?.(undefined, {
                processingTitle: 'Confirming',
            });

            completeRequestPromise.then((e) => {
                onProgress?.(undefined, {
                    isProcessing: false,
                    processingTitle: 'Successfully uploaded',
                });
            });

            return completeRequestPromise;
        } catch (err) {
            console.error('[DEV]:: Error while uploading chunk', err);
            // TODO - [TASK] Show popup to user
        }
    }

    /**
     * Normal (Non-multipart) file upload using presigned url
     * @param file
     * @param pUrls - presigned url
     */
    async startBufferedFileUpload(file: File | Blob, pUrl: string) {
        const fileContentBuffer =
            this._compressionFormat !== null
                ? Buffer.from(
                      await new Response(
                          file
                              .stream()
                              .pipeThrough(
                                  new CompressionStream(
                                      this._compressionFormat,
                                  ),
                              ),
                      ).arrayBuffer(),
                  )
                : Buffer.from(await file.arrayBuffer());

        return this.uploadBuffer(pUrl, fileContentBuffer, {
            contentType: file.type,
        });
    }

    async startBufferedFilesUpload(
        fileInfo: {
            file: File;
            presignedUrl: string;
        }[] = [],
        options?: Partial<{
            timeout: number;
            compressionFormat: CompressionFormat | null;
            concurrency: number;
        }>,
        onProgress?: (
            progressInfo: Record<string, number>,
            params: any,
        ) => void,
    ) {
        let uploadingSlots = new Set();
        let eachFileInfo = fileInfo.shift();

        if (!eachFileInfo) {
            return null;
        }

        onProgress?.(
            fileInfo.reduce((acc, item) => {
                return { ...acc, [item.file.name]: 0 };
            }, {}),
            {},
        );

        do {
            const capturedEachFileInfo = eachFileInfo;

            const uploadPromise = this.uploadBuffer(
                eachFileInfo.presignedUrl,
                Buffer.from(await eachFileInfo.file.arrayBuffer()),
                getDefined({
                    timeout: options?.timeout ?? 89 * 1000, // slight less than 90 exact seconds
                    contentType: eachFileInfo.file.type,
                    contentEncoding:
                        options?.compressionFormat === null
                            ? null
                            : (options?.compressionFormat ??
                              this._compressionFormat),
                    accessControlAllowedOrigin: this._accessControlAllowOrigin,
                }),
            );

            uploadingSlots.add(uploadPromise);
            uploadPromise
                .then((result) => {
                    if (!result) {
                        // TODO - [TASK] Notify users of failed media and notify if they'd like to retry
                        // TODO - [TASK] Failed chunk
                        return null;
                    }

                    capturedEachFileInfo?.file?.name &&
                        onProgress?.(
                            {
                                [capturedEachFileInfo?.file?.name]: 100,
                            },
                            {},
                        );
                })
                .catch((e) => {
                    // TODO - [TASK] Manage dev logs
                    console.error('[DEV]:: ', e);
                })
                .finally(() => {
                    uploadingSlots.delete(uploadPromise);
                });

            if (
                uploadingSlots.size >=
                (options?.concurrency ?? this.concurrency)
            ) {
                await Promise.race(uploadingSlots);
            }

            eachFileInfo = fileInfo.shift();
        } while (eachFileInfo);

        return Promise.all(uploadingSlots);
    }

    get concurrency() {
        return this._concurrency;
    }
}
