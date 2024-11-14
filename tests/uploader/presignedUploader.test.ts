import { S3Flex } from '../../src/upload/main';
import { File } from '../common/mockObjects/File';
import { getDefinedEnv } from '../../src/utils/object.util';
import { S3_BUCKET_NAME } from '../../src/common/constants/env.constant';

require('dotenv').config();

jest.setTimeout(100000);

describe('Presigned uploader', () => {
    let s3: S3Flex;
    let getPresignedUrl: (fileNames: string[]) => Promise<string[]>;
    const testBucketName = getDefinedEnv(S3_BUCKET_NAME);

    beforeAll(() => {
        s3 = new S3Flex();

        // [TODO] - make provisions to take credentials from vault
        getPresignedUrl = (fileNames: string[]) =>
            s3.client.getFileUploadPresignedUrls(
                fileNames,
                getDefinedEnv(S3_BUCKET_NAME),
            );
    });

    beforeEach(async () => {
        await s3.client.emptyBucket(testBucketName);
    });

    describe('Upload a single file with presigned url', () => {
        it('Should upload the file successfully', async () => {
            const fileName = 'TestFile.txt';

            const TestFile = new File(fileName, 10 * 1024 * 1024);
            const [presignedUrl] = await getPresignedUrl([TestFile.name]);
            await s3
                .presignedUploader()
                .uploadWithPresignedUrl(TestFile, presignedUrl);

            const files = await s3.client.getAllBucketItems(testBucketName);
            expect(files.Contents?.length).toBe(1);
            expect(files.Contents?.[0].Key).toBe(fileName);
        });
    });
});
