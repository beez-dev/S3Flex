export function definedS3Key(fileName: string, path?: string) {
    if (path) {
        return `${path}/${fileName}`;
    }

    return fileName;
}
