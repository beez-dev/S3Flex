export class FileUploadException extends Error {
    private errorCode: number;

    constructor(message: string, errorCode: number) {
        super(message);

        this.name = 'FileUploadException';
        this.errorCode = errorCode || 500;
    }
}