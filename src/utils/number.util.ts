/**
 * Get the default value only if the value is undefined.
 * @param value
 * @param defaultValue
 * @returns
 */
export function getDefinedNumber(value?: number, defaultValue = 0) {
    if (value !== undefined) {
        return value;
    }

    return defaultValue;
}
