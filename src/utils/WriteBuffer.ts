/*
 * Copyright (c) 2023 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

export type Page = {
    page: Uint8Array;
    startAddress: number;
    bytesWritten: number;
};

export type Range = { start: number; end: number };

export const overlaps = (r1: Range, r2: Range) =>
    (r1.start <= r2.start && r2.start <= r1.end) ||
    (r1.start <= r2.end && r2.start <= r1.end);

export const fullOverlap = (outer: Range, inner: Range) =>
    outer.start <= inner.start && outer.end >= inner.end;

const mergeRange = (r1: Range, r2: Range): Range[] => {
    if (overlaps(r1, r2)) {
        return [
            {
                start: Math.min(r1.start, r2.start),
                end: Math.max(r1.end, r2.end),
            },
        ];
    }

    if (r1.end + 1 === r2.start) {
        return [
            {
                start: r1.start,
                end: r2.end,
            },
        ];
    }

    if (r2.end + 1 === r1.start) {
        return [
            {
                start: r2.start,
                end: r1.end,
            },
        ];
    }

    return [r1, r2];
};

export const mergeRanges = (ranges: Range[]): Range[] => {
    const result: Range[] = [];

    while (ranges.length > 0) {
        let merged = false;

        const r1 = ranges.pop();
        if (!r1) return result;

        ranges = ranges.map(r2 => {
            const m = mergeRange(r1, r2);
            if (m.length === 1) {
                merged = true;
                return m[0];
            }

            return r2;
        });

        if (!merged) {
            result.push(r1);
        }
    }

    return result;
};

export const readFromCachedData = (
    pages: Page[],
    buffer: Buffer,
    byteOffset: number,
    numberOfBytesToRead: number
) => {
    if (!isRequiredDataAllCached(pages, byteOffset, numberOfBytesToRead)) {
        throw new Error('Data was not cached. Cannot use this method');
    }
    const pageHit = pages.filter(p =>
        overlaps(
            {
                start: p.startAddress,
                end: p.startAddress + p.bytesWritten - 1,
            },
            {
                start: byteOffset,
                end: byteOffset + numberOfBytesToRead - 1,
            }
        )
    );

    if (pageHit.length > 0) {
        pageHit.forEach(page => {
            const startOffset = Math.max(page.startAddress, byteOffset);
            const endOffset = Math.min(
                page.startAddress + page.bytesWritten - 1,
                byteOffset + numberOfBytesToRead - 1
            );

            const subResult = page.page.subarray(
                startOffset - page.startAddress,
                endOffset - page.startAddress + 1
            );

            buffer.set(subResult, startOffset - byteOffset);
        });

        return numberOfBytesToRead;
    }

    throw new Error('Error loading data from cache');
};

export const isRequiredDataAllCached = (
    pages: Page[],
    byteOffset: number,
    numberOfBytesToRead: number
) => {
    const pageHit = pages.filter(p =>
        overlaps(
            {
                start: p.startAddress,
                end: p.startAddress + p.bytesWritten - 1,
            },
            {
                start: byteOffset,
                end: byteOffset + numberOfBytesToRead - 1,
            }
        )
    );

    const completedRanges: { start: number; end: number }[] = [];

    if (pageHit.length > 0) {
        pageHit.forEach(page => {
            const startOffset = Math.max(page.startAddress, byteOffset);
            const endOffset = Math.min(
                page.startAddress + page.bytesWritten - 1,
                byteOffset + numberOfBytesToRead - 1
            );
            completedRanges.push({
                start: startOffset,
                end: endOffset,
            });
        });

        const mergedRange = mergeRanges([...completedRanges]);

        return (
            mergedRange.length === 1 &&
            fullOverlap(mergedRange[0], {
                start: byteOffset,
                end: byteOffset + numberOfBytesToRead - 1,
            })
        );
    }

    return false;
};

export class WriteBuffer {
    #pages: Page[] = [];
    #numberOfPages = 30;
    #bufferPageSize: number;
    #freePageBuffers: Uint8Array[] = [];
    #writeActivePage: () => Promise<void>;
    #pageBufferAllocator: {
        push: (page: Uint8Array) => void;
        get: () => Uint8Array;
    };
    #bytesWritten = 0;
    #firstWriteTime?: number;

    constructor(
        bufferPageSize: number,
        numberOfPages = 14,
        writeActivePage: () => Promise<void> = () => Promise.resolve(),
        pageBufferAllocator = {
            push: (buffer: Uint8Array) => {
                this.#freePageBuffers.push(buffer);
            },
            get: () =>
                this.#freePageBuffers.pop() ??
                Buffer.alloc(this.#bufferPageSize),
        },
        fileSize: number | undefined = undefined,
        firstWriteTime: number | undefined = undefined
    ) {
        if (numberOfPages < 2) {
            throw new Error('numberOfPages cannot be less then 2');
        }

        this.#numberOfPages = numberOfPages;
        this.#bufferPageSize = bufferPageSize;
        this.#writeActivePage = writeActivePage;
        this.#pageBufferAllocator = pageBufferAllocator;
        this.#bytesWritten = fileSize ?? 0;
        this.#firstWriteTime = firstWriteTime;
    }

    public getPages() {
        return this.#pages;
    }

    #calculateWriteIdealBufferRange(bytesToWrite: number): Range {
        const bytesWritten = this.getBytesWritten() + bytesToWrite;
        const normalizedEnd =
            Math.ceil(bytesWritten / this.#bufferPageSize) *
                this.#bufferPageSize -
            1;

        return {
            start: Math.max(
                0,
                1 + normalizedEnd - this.#numberOfPages * this.#bufferPageSize
            ),
            end: normalizedEnd,
        };
    }

    #updateCacheWrite(data: Uint8Array, onComplete?: () => void) {
        const idealBufferRange: Range = this.#calculateWriteIdealBufferRange(
            data.length
        );

        this.#pages = this.#pages.filter(p => {
            const keep = overlaps(idealBufferRange, {
                start: p.startAddress,
                end: p.startAddress + p.bytesWritten - 1,
            });

            if (!keep) this.#pageBufferAllocator.push(p.page);
            return keep;
        });

        let activePage = this.#pages[this.#pages.length - 1];

        if (!activePage || activePage.bytesWritten === this.#bufferPageSize) {
            activePage = {
                startAddress: this.getBytesWritten(),
                bytesWritten: 0,
                page: this.#pageBufferAllocator.get(),
            };
            this.#pages.push(activePage);
        }

        const spaceAvailable = activePage.page.length - activePage.bytesWritten;

        if (spaceAvailable >= data.length) {
            activePage.page.set(data, activePage.bytesWritten);

            activePage.bytesWritten += data.length;
            this.#bytesWritten += data.length;

            if (activePage.bytesWritten === activePage.page.length) {
                this.#writeActivePage().finally(() => onComplete?.());
            } else {
                onComplete?.();
            }
        } else {
            const firstChunk = data.subarray(0, spaceAvailable);
            const secondChunk = data.subarray(spaceAvailable);

            activePage.page.set(firstChunk, activePage.bytesWritten);
            activePage.bytesWritten += firstChunk.length;
            this.#bytesWritten += firstChunk.length;

            this.#writeActivePage();
            this.#updateCacheWrite(secondChunk, onComplete);
        }
    }

    getBufferRange() {
        return {
            start: Math.min(...this.#pages.map(p => p.startAddress)),
            end: Math.max(
                ...this.#pages.map(p => p.startAddress + p.bytesWritten - 1)
            ),
        };
    }

    getBytesWritten() {
        return this.#bytesWritten;
    }

    switchPage() {
        this.#pages.push({
            startAddress: this.getBytesWritten(),
            bytesWritten: 0,
            page: this.#pageBufferAllocator.get(),
        });
    }

    append(data: Uint8Array) {
        if (this.#firstWriteTime == null) this.#firstWriteTime = Date.now();

        return new Promise<void>(resolve => {
            this.#updateCacheWrite(data, resolve);
        });
    }

    getFirstWriteTime() {
        return this.#firstWriteTime;
    }

    clearStartSystemTime() {
        this.#firstWriteTime = undefined;
    }

    readFromCachedData(
        buffer: Buffer,
        byteOffset: number,
        numberOfBytesToRead: number
    ) {
        return readFromCachedData(
            this.#pages,
            buffer,
            byteOffset,
            numberOfBytesToRead
        );
    }
}
