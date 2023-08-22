/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

/* eslint no-plusplus: off */

import {
    numberOfDigitalChannels,
    options,
    timestampToIndex,
} from '../../../globals';
import bitDataAccumulator, { BitDataAccumulator } from './bitDataAccumulator';
import { createEmptyArrayWithAmpereState } from './commonBitDataFunctions';
import { AmpereState, DigitalChannelStates } from './dataTypes';
import noOpBitDataProcessor from './noOpBitDataProcessor';

export interface DataAccumulator {
    ampereLineData: AmpereState[];
    bitDataAccumulator: BitDataAccumulator;
    noOpBitDataProcessor: BitDataAccumulator;
    bitStateAccumulator: number[];

    process: (
        begin: number,
        end: number,
        digitalChannelsToCompute: number[],
        removeZeroValues: boolean,
        len: number,
        windowDuration: number
    ) => {
        ampereLineData: AmpereState[];
        bitsLineData: DigitalChannelStates[];
    };
}

let cache: {
    step: number;
    mappedIndex: number;
    originalIndexBegin: number;
} | null = null;

export type DataAccumulatorInitialiser = () => DataAccumulator;
export default (): DataAccumulator => ({
    ampereLineData: createEmptyArrayWithAmpereState(),
    bitDataAccumulator: bitDataAccumulator(),
    /* @ts-expect-error -- Should not really escape this error */
    noOpBitDataProcessor: noOpBitDataProcessor(),
    bitStateAccumulator: new Array(numberOfDigitalChannels),

    process(
        begin,
        end,
        digitalChannelsToCompute,
        removeZeroValues,
        len,
        windowDuration
    ) {
        const { data } = options;
        const bitDataProcessor =
            digitalChannelsToCompute.length > 0
                ? this.bitDataAccumulator
                : this.noOpBitDataProcessor;

        const originalIndexBegin = timestampToIndex(begin);
        const originalIndexEnd = timestampToIndex(end);
        const step =
            len === 0 ? 0 : (originalIndexEnd - originalIndexBegin) / len;

        let mappedIndex = 0;

        bitDataProcessor.initialise(digitalChannelsToCompute);

        if (cache?.step !== step) {
            cache = null;
        }
        if (cache !== null) {
            const offset = Math.floor(
                2 * ((originalIndexBegin - cache.originalIndexBegin) / step)
            );

            const cachedData = this.ampereLineData.slice(
                Math.max(offset, 0),
                cache.mappedIndex - Math.abs(offset)
            );

            console.log(`spliced in ${cachedData.length} elements`);

            this.ampereLineData.splice(
                Math.abs(Math.min(offset, 0)),
                Math.abs(offset),
                ...cachedData
            );
        }

        const offset =
            cache !== null
                ? Math.round(
                      2 *
                          ((originalIndexBegin - cache.originalIndexBegin) /
                              step)
                  )
                : 0;

        mappedIndex += Math.max(offset, 0);

        const target = offset > 0 ? len + len : len + len - Math.abs(offset);

        const dataOffset = cache
            ? Math.max(originalIndexBegin - cache.originalIndexBegin, 0)
            : 0;

        for (
            let originalIndex = originalIndexBegin + dataOffset;
            mappedIndex < target;
            ++mappedIndex, originalIndex += step
        ) {
            const timestamp =
                begin + windowDuration * (mappedIndex / (len + len));
            const k = Math.floor(originalIndex);
            const l = Math.floor(originalIndex + step);
            let min: number | undefined = Number.MAX_VALUE;
            let max: number | undefined = -Number.MAX_VALUE;

            for (let n = k; n < l; ++n) {
                const ni = (n + data.length) % data.length;
                let v = data[ni];

                if (removeZeroValues && v === 0) {
                    v = NaN;
                }

                if (!Number.isNaN(v)) {
                    if (v > max) max = v;
                    if (v < min) min = v;

                    bitDataProcessor.processBits(ni);
                }
            }

            if (min > max) {
                min = undefined;
                max = undefined;
            }
            this.ampereLineData[mappedIndex] = { x: timestamp, y: min };
            this.ampereLineData[++mappedIndex] = { x: timestamp, y: max };

            if (min !== undefined) {
                bitDataProcessor.processAccumulatedBits(timestamp);
            }
        }

        const cacheAttempt = JSON.stringify(this.ampereLineData);

        mappedIndex = 0;
        for (
            let originalIndex = originalIndexBegin;
            mappedIndex < len + len;
            ++mappedIndex, originalIndex += step
        ) {
            const timestamp =
                begin + windowDuration * (mappedIndex / (len + len));
            const k = Math.floor(originalIndex);
            const l = Math.floor(originalIndex + step);
            let min: number | undefined = Number.MAX_VALUE;
            let max: number | undefined = -Number.MAX_VALUE;

            for (let n = k; n < l; ++n) {
                const ni = (n + data.length) % data.length;
                let v = data[ni];

                if (removeZeroValues && v === 0) {
                    v = NaN;
                }

                if (!Number.isNaN(v)) {
                    if (v > max) max = v;
                    if (v < min) min = v;

                    bitDataProcessor.processBits(ni);
                }
            }

            if (min > max) {
                min = undefined;
                max = undefined;
            }
            this.ampereLineData[mappedIndex] = { x: timestamp, y: min };
            this.ampereLineData[++mappedIndex] = { x: timestamp, y: max };
            // this.ampereLineData[mappedIndex].x = timestamp;
            // this.ampereLineData[mappedIndex].y = min;
            // ++mappedIndex;
            // this.ampereLineData[mappedIndex].x = timestamp;
            // this.ampereLineData[mappedIndex].y = max;

            if (min !== undefined) {
                bitDataProcessor.processAccumulatedBits(timestamp);
            }
        }

        console.log(JSON.stringify(this.ampereLineData) === cacheAttempt);

        cache = {
            step,
            mappedIndex,
            originalIndexBegin,
        };

        return {
            ampereLineData: this.ampereLineData.slice(0, mappedIndex),
            bitsLineData: bitDataProcessor.getLineData(),
        };
    },
});
