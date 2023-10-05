/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

// FIXME: Will ned to remove the line under at some point.
/* eslint-disable @typescript-eslint/no-non-null-assertion -- Temporary included to make a conservative conversion to typescript */

import { getCurrentWindow } from '@electron/remote';

export const bufferLengthInSeconds = 60 * 5;
export const numberOfDigitalChannels = 8;

const initialSamplingTime = 10;
const initialSamplesPerSecond = 1e6 / initialSamplingTime;

export interface GlobalOptions {
    /** Time between each sample denoted in microseconds, which is equal to 1e-6 seconds \
     *  e.g. if samplesPerSecond is 100_000, then a sample is taken every 10th microsecond
     */
    samplingTime: number;
    /** The number of samples per second */
    samplesPerSecond: number;
    /** @var data: contains all samples of current denoted in uA (microAmpere). */
    data: Float32Array;
    /** @var [bits]: contains the bit state for each sample, variable may be null */
    bits: Uint16Array | null;
    /** @var index: pointer to the index of the last sample in data array */
    index: number;
    /** Timestamp for the latest sample taken, incremented by {samplingTime} for each sample */
    timestamp: number;
    currentPane?: number;
}

export const options: GlobalOptions = {
    samplingTime: initialSamplingTime,
    samplesPerSecond: initialSamplesPerSecond,
    data: new Float32Array(initialSamplesPerSecond * bufferLengthInSeconds),
    bits: null,
    index: 0,
    timestamp: 0,
};

/**
 * Get the sampling time derived from samplesPerSecond
 * @param {number} samplingRate number of samples per second
 * @returns {number} samplingTime which is the time in microseconds between samples
 */
export const getSamplingTime = (samplingRate: number): number => {
    const microSecondsPerSecond = 1e6;
    return microSecondsPerSecond / samplingRate;
};

export const setSamplingRate = (rate: number): void => {
    options.samplesPerSecond = rate;
    options.samplingTime = getSamplingTime(rate);
};

export const getSamplesPerSecond = () => options.samplesPerSecond;

/**
 * Initiates new sample array if new buffer size is not equal to the present one.
 * @param {number} samplingDuration maximum number of seconds with sampling
 * @returns {void} derives buffer size and initiates new buffer for data samples if the current length of the buffer is not equal to the new buffer size.
 * Also fills the buffer with NaN to make sure the buffer is cleared.
 */
export const initializeDataBuffer = (samplingDuration: number) => {
    const newBufferSize = Math.trunc(
        samplingDuration * options.samplesPerSecond
    );
    if (options.data.length !== newBufferSize) {
        options.data = new Float32Array(newBufferSize);
    }
    options.data.fill(NaN);
};

/**
 *
 * @param {number} samplingDuration maximum number of seconds with sampling
 * @returns {void} derives buffer size and initiates new buffer for bits if there is no buffer from before or if the current length of buffer
 * is not equal to the new buffer size. Fills the buffer with zeroes to make sure it is empty.
 */
export const initializeBitsBuffer = (samplingDuration: number) => {
    const newBufferSize = Math.trunc(
        samplingDuration * options.samplesPerSecond
    );
    if (!options.bits || options.bits.length !== newBufferSize) {
        options.bits = new Uint16Array(newBufferSize);
    }
    options.bits.fill(0);
};

export const removeBitsBuffer = (): void => {
    options.bits = null;
};

export const timestampToIndex = (timestamp: number): number => {
    const lastTimestamp = options?.timestamp ? options.timestamp : 0;
    const microSecondsPerSecond = 1e6;

    return (
        options.index -
        ((lastTimestamp - timestamp!) * options.samplesPerSecond) /
            microSecondsPerSecond
    );
};

export const indexToTimestamp = (index: number): number => {
    const lastTimestamp = options?.timestamp ? options.timestamp : 0;
    const microSecondsPerSecond = 1e6;
    return (
        lastTimestamp -
        ((options.index - index) * microSecondsPerSecond) /
            options.samplesPerSecond
    );
};

export const getTotalDurationInMicroSeconds = () =>
    options.samplingTime * options.data.length;

export const updateTitle = (info?: string) => {
    const title = getCurrentWindow().getTitle().split(':')[0].trim();
    getCurrentWindow().setTitle(`${title}${info ? ':' : ''} ${info || ''}`);
};
