/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { DataManager, numberOfDigitalChannels } from '../../../globals';
import { AverageLine, BASE, DataProcessor } from './dataProcessor';
import { AmpereState, DigitalChannelStates } from './dataTypes';

export const calcStats = (begin?: null | number, end?: null | number) => {
    if (begin == null || end == null) {
        return null;
    }

    end = Math.min(end, DataManager().getTimestamp());

    const data = DataManager().getData(begin, end);
    let sum = 0;
    let len = 0;
    let max;

    for (let n = 0; n < data.current.length; n += 1) {
        const v = data.current[n];
        if (!Number.isNaN(v)) {
            if (max === undefined || v > max) {
                max = v;
            }
            sum += v;
            len += 1;
        }
    }
    return {
        average: sum / (len || 1),
        max: max ?? 0,
        delta: end - begin,
    };
};

export interface DataAccumulator {
    bitStateAccumulator: number[];
    dataProcessor: DataProcessor;

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
        averageLine: AverageLine[];
    };
}

export type DataAccumulatorInitialiser = () => DataAccumulator;
export default (): DataAccumulator => ({
    bitStateAccumulator: new Array(numberOfDigitalChannels),
    dataProcessor: new DataProcessor(1),

    process(
        begin,
        end,
        digitalChannelsToCompute,
        removeZeroValues,
        maxNumberOfPoints,
        windowDuration
    ) {
        // We want an extra sample from both end to show line going out of chart
        begin = Math.max(0, begin - DataManager().getSamplingTime());
        end = Math.min(
            DataManager().getTimestamp(),
            end + DataManager().getSamplingTime()
        );

        if (maxNumberOfPoints === 0) {
            return {
                ampereLineData: [],
                bitsLineData: [],
                averageLine: [],
            };
        }

        const suggestedNoOfRawSamples =
            DataManager().getNumberOfSamplesInWindow(windowDuration);

        const numberOfPointsPerGroup = Math.ceil(
            suggestedNoOfRawSamples / 10000
        );
        const numberOfPointsPerGroupPowerOf2 =
            BASE **
            Math.ceil(Math.log(numberOfPointsPerGroup) / Math.log(BASE));

        const result = this.dataProcessor.process(
            begin,
            end,
            digitalChannelsToCompute,
            removeZeroValues,
            numberOfPointsPerGroupPowerOf2
        );

        this.dataProcessor = result.dataProcessor;
        // console.log(result.dataProcessor.numberOfPointsPerGroup);

        return result.data;
    },
});
