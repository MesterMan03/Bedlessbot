interface CacheElement<T> {
    /**
     * Data of the element
     */
    data: T;
    /**
     * Last time the element was refreshed
     */
    lastRefresh: number;
}

/**
 * Powerful cache system
 */
export class Cache<T, U> {
    /**
     * Time to refresh an element in the cache in ms (default = 5 minutes)
     */
    refreshTime = 5 * 60 * 1000;
    #data: Map<T, CacheElement<U>> = new Map();

    constructor(refreshTime?: number) {
        if (refreshTime) {
            this.refreshTime = refreshTime;
        }
    }

    set(key: T, data: U): U {
        this.#data.set(key, {
            data,
            lastRefresh: Date.now()
        });

        return data;
    }

    get(key: T): U | undefined {
        if (!this.#data.has(key)) {
            return undefined;
        }

        const elementOld = this.#data.has(key) && Date.now() - (this.#data.get(key)?.lastRefresh ?? 0) > this.refreshTime;

        if (elementOld) {
            this.delete(key);
            return undefined;
        }

        return this.#data.get(key)?.data ?? undefined;
    }

    delete(key: T): boolean {
        return this.#data.delete(key);
    }

    has(key: T): boolean {
        return this.#data.has(key);
    }

    clear(): void {
        this.#data.clear();
    }
}
