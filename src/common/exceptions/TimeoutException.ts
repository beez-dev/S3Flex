export class TimeoutException extends Error {
    private errorCode: number;

    constructor(message: string, errorCode: number = 408) {
        super(message);

        this.name = 'TimeoutException';
        this.errorCode = errorCode;
    }
}