import { S3FlexBase } from './base.s3flex';
import { PresignedUploader } from './presignedUploader';

export class S3Flex extends S3FlexBase {
    
    get presignedUploader() {
        return PresignedUploader.get;
    }
}
