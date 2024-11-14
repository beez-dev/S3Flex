/**
 * Mock implementation of the File API for testing purposes.
 * Extends the built-in Blob class to simulate file objects.
 */
export class File extends Blob {
    public _name: string = '';

    /**
     * Creates a new mock File instance
     * @param name - The name to assign to the file
     * @param fileSize - The size in bytes for the mock file content
     */
    constructor(name: string, fileSize: number) {
        const fileContent = new Uint8Array(fileSize);
        super([fileContent.buffer], { type: 'text/plain' });
        this._name = name;
    }

    public get name() {
        return this._name;
    }
}
