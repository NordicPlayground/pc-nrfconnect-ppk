/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { getCurrentWindow } from '@electron/remote';
import path from 'path';
import { v4 } from 'uuid';

import { FileBuffer } from './utils/FileBuffer';
import { FoldingBuffer } from './utils/foldingBuffer';
import { fullOverlap, Range, WriteBuffer } from './utils/WriteBuffer';

export const currentFrameSize = 4;
export const bitFrameSize = 2; // 6 bytes, 4 current 2 buts
export const frameSize = currentFrameSize + bitFrameSize; // 6 bytes, 4 current 2 buts
export const bufferLengthInSeconds = 60 * 5;
export const numberOfDigitalChannels = 8;

const initialSamplingTime = 10;
const initialSamplesPerSecond = 1e6 / initialSamplingTime;
export const microSecondsPerSecond = 1e6;

const tempBuffer = new Uint8Array(6);
const tempView = new DataView(tempBuffer.buffer);

export interface GlobalOptions {
    /** The number of samples per second */
    samplesPerSecond: number;
    /** @var index: pointer to the index of the last sample in data array */
    fileBuffer?: FileBuffer;
    writeBuffer?: WriteBuffer;
    foldingBuffer?: FoldingBuffer;
    timeReachedTriggers: {
        timeRange: Range;
        bytesRange: Range;
        triggerOrigin: number;
        onSuccess: (writeBuffer: WriteBuffer, absoluteTime: number) => void;
        onFail: (error: Error) => void;
    }[];
}

const options: GlobalOptions = {
    samplesPerSecond: initialSamplesPerSecond,
    timeReachedTriggers: [],
};

class FileData {
    data: Uint8Array;
    dataView: DataView;
    length: number;
    constructor(data: Readonly<Uint8Array>, length: number) {
        this.data = data;
        this.length = length;
        this.dataView = new DataView(this.data.buffer);
    }

    getAllCurrentData() {
        const numberOfElements = this.getLength();
        const result = new Uint8Array(numberOfElements * currentFrameSize);
        for (let index = 0; index < numberOfElements; index += 1) {
            const byteOffset = index * frameSize;
            result.set(
                this.data.subarray(byteOffset, byteOffset + currentFrameSize),
                index * currentFrameSize
            );
        }

        return new Float32Array(result.buffer);
    }

    getCurrentData(index: number) {
        const byteOffset = index * frameSize;

        if (this.length < byteOffset + currentFrameSize) {
            throw new Error('Index out of range');
        }

        return this.dataView.getFloat32(byteOffset, true);
    }

    getAllBitData() {
        const numberOfElements = this.getLength();
        const result = new Uint8Array(numberOfElements * 2);
        for (let index = 0; index < numberOfElements; index += 1) {
            const byteOffset = index * frameSize + currentFrameSize;
            result.set(
                this.data.subarray(byteOffset, byteOffset + 2),
                index * 2
            );
        }

        return new Uint16Array(result.buffer);
    }

    getBitData(index: number) {
        const byteOffset = index * frameSize + currentFrameSize;

        if (this.length < byteOffset + 2) {
            throw new Error('Index out of range');
        }

        return this.dataView.getUint16(byteOffset);
    }

    getLength() {
        return this.length / frameSize;
    }
}

const getTimestamp = () =>
    !options.fileBuffer
        ? 0
        : indexToTimestamp(
              options.fileBuffer.getSessionInBytes() / frameSize - 1
          );

export const normalizeTimeFloor = (time: number) =>
    indexToTimestamp(timestampToIndex(time));

export const normalizeTimeCeil = (time: number) =>
    indexToTimestamp(timestampToCeilIndex(time));

export const DataManager = () => ({
    getSamplingTime: () => getSamplingTime(options.samplesPerSecond),
    getSamplesPerSecond: () => options.samplesPerSecond,
    setSamplesPerSecond: (samplesPerSecond: number) => {
        options.samplesPerSecond = samplesPerSecond;
    },
    getSessionFolder: () => options.fileBuffer?.getSessionFolder(),
    getData: async (
        buffer: Buffer,
        fromTime = 0,
        toTime = getTimestamp(),
        bias: 'start' | 'end' | undefined = undefined,
        onLoading: (loading: boolean) => void = () => {}
    ) => {
        // NOTE: only one getData per buffer should bhe executed at any given time

        if (options.fileBuffer === undefined) {
            return new FileData(Buffer.alloc(0), 0);
        }

        if (options.fileBuffer.getSessionInBytes() === 0) {
            return new FileData(Buffer.alloc(0), 0);
        }

        const numberOfElements =
            timestampToIndex(toTime) - timestampToIndex(fromTime) + 1;
        const byteOffset = timestampToIndex(fromTime) * frameSize;
        const numberOfBytesToRead = numberOfElements * frameSize;

        if (buffer.length < numberOfBytesToRead) {
            throw new Error('Buffer is too small');
        }

        const readBytes = await options.fileBuffer.read(
            buffer,
            byteOffset,
            numberOfBytesToRead,
            bias,
            onLoading
        );

        if (readBytes !== numberOfBytesToRead) {
            console.log(
                `missing ${
                    (numberOfBytesToRead - readBytes) / frameSize
                } records`
            );
        }
        return new FileData(buffer, readBytes);
    },

    getTimestamp,
    isInSync: () => {
        const actualTimePassed =
            Date.now() -
            (options.writeBuffer?.getFirstWriteTime() ??
                options.fileBuffer?.getFirstWriteTime() ??
                0);

        const processedBytes =
            options.writeBuffer?.getBytesWritten() ??
            options.fileBuffer?.getSessionInBytes() ??
            0;

        const simulationDelta =
            indexToTimestamp(processedBytes / frameSize - 1) / 1000;
        if (simulationDelta > actualTimePassed) return true;

        const pcAheadDelta = actualTimePassed - simulationDelta;

        // We get serial data every 30 ms regardless of sampling rate.
        // If PC is ahead by more then 1.5 samples we are not in sync
        return pcAheadDelta <= 45;
    },
    getStartSystemTime: () => options.fileBuffer?.getFirstWriteTime(),

    addData: (current: number, bits: number) => {
        if (
            options.fileBuffer === undefined &&
            options.writeBuffer === undefined
        )
            return;

        tempView.setFloat32(0, current, true);
        tempView.setUint16(4, bits);

        if (options.writeBuffer) {
            options.writeBuffer.append(tempBuffer);
        } else {
            options.fileBuffer?.append(tempBuffer);
            options.foldingBuffer?.addData(current, getTimestamp());
        }

        const writeBuffer = options.writeBuffer;
        if (writeBuffer) {
            const timestamp = indexToTimestamp(
                writeBuffer.getBytesWritten() / frameSize - 1
            );
            const readyTriggers = options.timeReachedTriggers.filter(
                trigger => trigger.timeRange.end <= timestamp
            );
            readyTriggers.forEach(trigger => {
                const bufferedRangeBytes = writeBuffer.getBufferRange();

                if (fullOverlap(bufferedRangeBytes, trigger.bytesRange)) {
                    trigger.onSuccess(
                        writeBuffer,
                        (writeBuffer.getFirstWriteTime() ?? 0) +
                            trigger.timeRange.start / 1000 // micro to milli
                    );
                } else {
                    trigger.onFail(
                        new Error(
                            'Buffer is too small, missing data from range'
                        )
                    );
                }
            });

            options.timeReachedTriggers = options.timeReachedTriggers.filter(
                trigger => trigger.timeRange.end > timestamp
            );
        }
    },
    flush: () => options.fileBuffer?.flush(),
    reset: async () => {
        options.timeReachedTriggers.forEach(trigger => {
            trigger.onFail(new Error('Trigger Aborted'));
        });
        options.timeReachedTriggers = [];
        await options.fileBuffer?.close();
        options.fileBuffer?.release();
        options.fileBuffer = undefined;
        options.writeBuffer = undefined;
        options.foldingBuffer = undefined;
        options.samplesPerSecond = initialSamplesPerSecond;
    },
    initializeLiveSession: (sessionRootPath: string) => {
        const sessionPath = path.join(sessionRootPath, v4());

        options.fileBuffer = new FileBuffer(
            10 * 100_000 * frameSize, // 6 bytes per sample for and 10sec buffers at highest sampling rate
            sessionPath,
            14,
            14
        );
        options.foldingBuffer = new FoldingBuffer();
    },
    initializeTriggerSession: (timeToRecordSeconds: number) => {
        options.writeBuffer = new WriteBuffer(
            timeToRecordSeconds * getSamplesPerSecond() * frameSize
        );
    },
    createSessionData: async (
        buffer: Uint8Array,
        sessionRootPath: string,
        startSystemTime: number,
        onProgress?: (message: string, progress?: number) => void
    ) => {
        const sessionPath = path.join(sessionRootPath, v4());

        const fileBuffer = new FileBuffer(
            10 * 100_000 * frameSize, // 6 bytes per sample for and 10sec buffers at highest sampling rate
            sessionPath,
            2,
            30,
            startSystemTime
        );
        const foldingBuffer = new FoldingBuffer();

        const fileData = new FileData(buffer, buffer.length);

        onProgress?.('Preparing Session');
        await fileBuffer.append(buffer);

        onProgress?.('Preparing Minimap', 0);
        let progress = 0;
        for (let i = 0; i < fileData.getLength(); i += 1) {
            const newProgress = Math.trunc((i / fileData.getLength()) * 100);
            if (newProgress !== progress) {
                onProgress?.('Preparing Minimap', newProgress);
                progress = newProgress;
            }

            foldingBuffer.addData(
                fileData.getCurrentData(i),
                i * getSamplingTime(options.samplesPerSecond)
            );
        }

        return { fileBuffer, foldingBuffer };
    },

    getTotalSavedRecords: () => timestampToIndex(getTimestamp()) + 1,

    loadData: (sessionPath: string, startSystemTime?: number) => {
        options.fileBuffer = new FileBuffer(
            10 * 100_000 * 6, // 6 bytes per sample for and 10sec buffers at highest sampling rate
            sessionPath,
            2,
            30,
            startSystemTime
        );
        options.foldingBuffer = new FoldingBuffer();
        options.foldingBuffer.loadFromFile(sessionPath);
    },
    loadSession: (fileBuffer: FileBuffer, foldingBuffer: FoldingBuffer) => {
        options.fileBuffer = fileBuffer;
        options.foldingBuffer = foldingBuffer;
    },
    getNumberOfSamplesInWindow: (windowDuration: number) =>
        timestampToIndex(windowDuration),
    getMinimapData: () => options.foldingBuffer?.getData() ?? [],
    getSessionBuffers: () => {
        if (!options.fileBuffer || !options.foldingBuffer) {
            throw new Error('One or buffer was missing ');
        }

        return {
            fileBuffer: options.fileBuffer,
            foldingBuffer: options.foldingBuffer,
        };
    },
    addTimeReachedTrigger: (recordingLengthMicroSeconds: number) =>
        new Promise<{
            writeBuffer: WriteBuffer;
            timeRange: Range;
            bytesRange: Range;
            absoluteTime: number;
            triggerOrigin: number;
        }>((resolve, reject) => {
            if (!options.writeBuffer) {
                reject(new Error('No write buffer initialized'));
                return;
            }

            const currentIndex =
                options.writeBuffer.getBytesWritten() / frameSize - 1;
            const timestamp = indexToTimestamp(currentIndex);

            const splitRecordingLengthMicroSeconds =
                recordingLengthMicroSeconds / 2;
            const timeRange = {
                start: Math.max(
                    0,
                    timestamp - splitRecordingLengthMicroSeconds
                ),
                end:
                    timestamp +
                    splitRecordingLengthMicroSeconds -
                    indexToTimestamp(1), // we must exclude current sample the one that triggered all this
            };

            const bytesRange = {
                start: timestampToIndex(timeRange.start) * frameSize,
                end: (timestampToIndex(timeRange.end) + 1) * frameSize - 1,
            };

            const triggerOrigin =
                currentIndex - timestampToIndex(timeRange.start);

            options.timeReachedTriggers.push({
                timeRange,
                bytesRange,
                triggerOrigin,
                onSuccess: (writeBuffer, absoluteTime) =>
                    resolve({
                        writeBuffer,
                        timeRange, // with respect to the write buffer
                        bytesRange,
                        absoluteTime,
                        triggerOrigin,
                    }),
                onFail: (error: Error) => reject(error),
            });
        }),
    hasPendingTriggers: () => options.timeReachedTriggers.length > 0,
    onFileWrite: (listener: () => void) =>
        options.fileBuffer?.onFileWrite(listener),
});

/**
 * Get the sampling time derived from samplesPerSecond
 * @param {number} samplingRate number of samples per second
 * @returns {number} samplingTime which is the time in microseconds between samples
 */
const getSamplingTime = (samplingRate: number): number =>
    microSecondsPerSecond / samplingRate;

export const getSamplesPerSecond = () => options.samplesPerSecond;

export const timestampToIndex = (
    timestamp: number,
    samplesPerSecond: number = options.samplesPerSecond
): number =>
    timestamp < 0
        ? -1
        : Math.trunc((timestamp * samplesPerSecond) / microSecondsPerSecond);

export const timestampToCeilIndex = (timestamp: number): number =>
    timestamp < 0
        ? -1
        : Math.ceil(
              (timestamp * options.samplesPerSecond) / microSecondsPerSecond
          );

export const indexToTimestamp = (
    index: number,
    samplesPerSecond: number = options.samplesPerSecond
): number =>
    index >= 0 ? (microSecondsPerSecond * index) / samplesPerSecond : 0;

export const updateTitle = (info?: string | null) => {
    const title = getCurrentWindow().getTitle().split(':')[0].trim();
    getCurrentWindow().setTitle(`${title}${info ? ':' : ''} ${info || ''}`);
};
