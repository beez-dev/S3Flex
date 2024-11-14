type DefinedObject<T> = {
    [K in keyof T]: Exclude<T[K], null | undefined>;
};

export function getDefined<T extends object>(
    obj: T,
): Partial<DefinedObject<T>> {
    return Object.entries(obj).reduce<Partial<DefinedObject<T>>>(
        (acc, [key, value]) => {
            if (value !== null && value !== undefined) {
                acc[key as keyof T] = value as Exclude<
                    T[keyof T],
                    null | undefined
                >;
            }
            return acc;
        },
        {},
    );
}

export function getEnv(key: string) {
    return process.env[key];
}

export function getDefinedEnv(key: string) {
    const envValue = getEnv(key);

    if (!envValue) {
        throw `Error!! Required env: ${key} is not defined.`;
    }

    return envValue;
}
