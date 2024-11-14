import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    S3Client,
    PutObjectCommand,
    UploadPartCommand,
    ListBucketsCommand,
    ListObjectsCommand,
    DeleteObjectsCommand,
    CreateMultipartUploadCommand,
} from '@aws-sdk/client-s3';

type BucketInfo = {
    name: string;
    creation_date: string;
};

import { getDefined, getDefinedEnv, getEnv } from '../utils/object.util';
import {
    S3_ACCESS_KEY_ID,
    S3_ENDPOINT,
    S3_REGION,
    S3_SECRET,
} from '../common/constants/env.constant';
import { FileUploadException } from '../common/exceptions/FileUploadException';
import { S3FlexClientConfig } from '../common/types/s3.types';

/**
 * Backblaze S3 compatible client service
 */
export class S3FlexClient {
    private readonly _s3Client: S3Client = undefined as any;
    private readonly s3MaxAllowedParts = 10000; // s3 config

    private readonly defaultContentType = 'application/octet-stream';
    private readonly defaultUrlExpiry = 100; //seconds
    private readonly defaultChnkSize = 16 * 1024 ** 2; // 16 mb
    availableBuckets: BucketInfo | null = null;

    constructor(config: Partial<S3FlexClientConfig> = {}) {
        this._s3Client = new S3Client({
            endpoint: config.endPoint || getDefinedEnv(S3_ENDPOINT),
            region: config.region || getDefinedEnv(S3_REGION),
            // @ts-ignore
            credentials: {
                accessKeyId:
                    config.accessKeyId || getDefinedEnv(S3_ACCESS_KEY_ID),
                secretAccessKey:
                    config.secretAccessKey || getDefinedEnv(S3_SECRET),
            },
        });

        this.getAvailableBuckets();
    }

    async getAvailableBuckets() {
        if (this.availableBuckets) return this.availableBuckets;

        const requiredBucketsInfo = await this.getAllS3Buckets();

        const bucketsInformation = requiredBucketsInfo.Buckets?.reduce?.(
            (acc, eachBucketInfo) => {
                let BucketInfo = {};
                if (eachBucketInfo.Name && eachBucketInfo.CreationDate) {
                    BucketInfo = {
                        [eachBucketInfo.Name]: {
                            name: eachBucketInfo.Name,
                            creation_date: new Date(
                                eachBucketInfo.CreationDate,
                            ),
                        },
                    };
                }
                return {
                    ...acc,
                    ...BucketInfo,
                };
            },
            {},
        ) as BucketInfo;

        this.setBucketInfo(bucketsInformation);

        return bucketsInformation;
    }

    setBucketInfo(info: BucketInfo) {
        this.availableBuckets = info;
    }

    async getFromAvailableBkts(bucketName: keyof typeof this.availableBuckets) {
        const availableBuckets = await this.getAvailableBuckets();

        return availableBuckets?.[bucketName];
    }

    async getUploadPresignedUrls(
        filePaths: string[],
        bucketName: string,
        options: Partial<{
            fileSize: number;
            isMultipart: boolean;
        }>,
    ) {
        try {
            if (options && options.isMultipart) {
                if (filePaths.length > 1) {
                    throw Error(
                        'Multiple files not supported in multipart upload.',
                    );
                }

                const [filePath] = filePaths;

                if (!options.fileSize) {
                    return [];
                }

                return this.getMultiPartsUploadPresignedUrls(
                    bucketName,
                    filePath,
                    options.fileSize,
                    { expiresIn: 240 }, //4 min
                );
            }

            return {
                p_urls: await this.getFileUploadPresignedUrls(
                    filePaths,
                    bucketName,
                ),
                upload_id: null,
            };
        } catch (e: any) {
            throw new FileUploadException(
                'Error uploading file.' + ` ${e?.message}`,
                e?.code,
            );
        }
    }

    /**
     * Generate presigned urls for non-multipart uploads
     * @param fileNames
     * @param bucketName
     */
    async getFileUploadPresignedUrls(fileNames: string[], bucketName: string) {
        return Promise.all(
            fileNames.map((fileName) => {
                return getSignedUrl(
                    this.client,
                    new PutObjectCommand({
                        Bucket: bucketName,
                        Key: fileName,
                    }),
                    {
                        expiresIn: 240, //seconds
                    },
                );
            }),
        );
    }

    async getMultiPartsUploadPresignedUrls(
        bucketName: string,
        fileName: string,
        fileSize: number,
        options: Partial<{
            folderName: string;
            contentEncoding: CompressionFormat | null;
            contentType: string;
            expiresIn: number;
            chunkSize: number;
        }>,
    ) {
        const {
            contentEncoding,
            contentType = this.defaultContentType,
            expiresIn = this.defaultUrlExpiry,
            chunkSize = this.defaultChnkSize,
        } = options;

        const assetFileName = options.folderName
            ? `${options.folderName}/${fileName}`
            : fileName;

        const maxNoOfParts = Math.ceil(fileSize / chunkSize) + 1; // account for the chunk if the file is already zipped; where zipped file size >= actual file size due to zip headers

        if (maxNoOfParts > this.s3MaxAllowedParts) {
            throw new Error(`Cannot allow parts > ${this.s3MaxAllowedParts}`);
        }

        const initMultipartRes = await this.client.send(
            new CreateMultipartUploadCommand({
                Bucket: bucketName,
                Key: assetFileName,
            }),
        );

        const presignedUrls = [];

        for (let i = 0; i < maxNoOfParts; i++) {
            const presignedUrl = getSignedUrl(
                this.client,
                new UploadPartCommand({
                    Bucket: bucketName,
                    Key: assetFileName,
                    UploadId: initMultipartRes.UploadId,
                    PartNumber: i + 1,
                    ...getDefined({
                        ContentType: contentType, // Example Content-Type
                        ContentEncoding:
                            contentEncoding === null
                                ? null
                                : (contentEncoding ?? 'gzip'),
                    }),
                }),
                {
                    expiresIn,
                },
            );

            presignedUrls.push(presignedUrl);
        }

        return {
            p_urls: await Promise.all(presignedUrls),
            upload_id: initMultipartRes.UploadId,
        };
    }

    async getAllS3Buckets() {
        return this.client.send(new ListBucketsCommand({}));
    }

    async getAllBucketItems(bucketName: string) {
        return this.client.send(new ListObjectsCommand({ Bucket: bucketName }));
    }

    async emptyBucket(bucketName: string) {
        const itemKeys =
            (await this.getAllBucketItems(bucketName)).Contents?.map((item) => {
                return { Key: item.Key };
            }) || [];

        if (itemKeys.length > 0) {
            return await this.client.send(
                new DeleteObjectsCommand({
                    Bucket: bucketName,
                    Delete: { Objects: itemKeys },
                }),
            );
        }
    }

    get client() {
        return this._s3Client;
    }
}
