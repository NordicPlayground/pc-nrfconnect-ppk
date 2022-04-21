/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

/* eslint no-plusplus: off */

import { options, timestampToIndex } from '../../../globals';
import bitDataSelector from './bitDataSelector';
import { createEmptyArrayWithAmpereState } from './commonBitDataFunctions';
import { DigitalChannelsType } from './dataTypes';
import noOpBitDataProcessor from './noOpBitDataProcessor';

export default () => ({
    ampereLineData: createEmptyArrayWithAmpereState(),
    bitDataSelector: bitDataSelector(),
    noOpBitDataProcessor: noOpBitDataProcessor(),

    process(
        begin: number,
        end: number,
        digitalChannelsToCompute: DigitalChannelsType
    ) {
        const { data } = options;
        const bitDataProcessor =
            digitalChannelsToCompute.length > 0
                ? this.bitDataSelector
                : this.noOpBitDataProcessor;

        const originalIndexBegin = timestampToIndex(begin);
        const originalIndexEnd = timestampToIndex(end);

        let mappedIndex = 0;

        bitDataProcessor.initialise(digitalChannelsToCompute);

        let last;
        const originalIndexBeginFloored = Math.floor(originalIndexBegin);
        const originalIndexEndCeiled = Math.ceil(originalIndexEnd);
        for (
            let n = originalIndexBeginFloored;
            n <= originalIndexEndCeiled;
            ++mappedIndex, ++n
        ) {
            const k = (n + data.length) % data.length;
            const v = data[k];
            const timestamp =
                begin +
                ((n - originalIndexBegin) * 1e6) / options.samplesPerSecond;
            this.ampereLineData[mappedIndex].x = timestamp;

            if (n < originalIndexEndCeiled) {
                last = Number.isNaN(v) ? undefined : v;
            }
            this.ampereLineData[mappedIndex].y = last;

            if (!Number.isNaN(v)) {
                bitDataProcessor.processBits(k, timestamp);
            }
        }

        return {
            ampereLineData: this.ampereLineData.slice(0, mappedIndex),
            bitsLineData: bitDataProcessor.getLineData(),
        };
    },
});
