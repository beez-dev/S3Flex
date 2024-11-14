export type s3ClientConfig = {
    endpoint: string;
    region: string;
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
    };
};

export type S3FlexClientConfig = {
    endPoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
};
