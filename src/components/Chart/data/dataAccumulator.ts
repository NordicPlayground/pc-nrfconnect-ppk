/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import {
    DataManager,
    indexToTimestamp,
    normalizeTime,
    numberOfDigitalChannels,
} from '../../../globals';
import { always0, always1, sometimes0And1 } from '../../../utils/bitConversion';
import bitDataAccumulator, { BitDataAccumulator } from './bitDataAccumulator';
import {
    AmpereState,
    BitStateIndexType,
    BitStateType,
    DigitalChannelState,
    DigitalChannelStates,
    TimestampType,
} from './dataTypes';
import noOpBitDataProcessor from './noOpBitDataProcessor';

export const calcStats = (begin?: null | number, end?: null | number) => {
    if (begin == null || end == null) {
        return null;
    }

    if (end < begin) {
        [begin, end] = [end, begin];
    }

    const data = DataManager().getData(
        begin,
        Math.min(end, DataManager().getTimestamp())
    );

    let sum = 0;
    let len = 0;
    let max;

    for (let n = 0; n <= data.current.length; n += 1) {
        const v = data.current[n];
        if (!Number.isNaN(v)) {
            if (max === undefined || v > max) {
                max = v;
                sum += v;
                len += 1;
            }
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

type AccumulatedResult = {
    ampereLineData: AmpereState[];
    bitsLineData: DigitalChannelStates[];
};

let cachedResult: AccumulatedResult | undefined;

const accumulate = (
    begin: number,
    end: number,
    timeGroup: number,
    numberOfPointsPerGrouped: number,
    removeZeroValues: boolean,
    digitalChannelsToCompute: number[]
) => {
    const offset =
        begin - Math.floor(normalizeTime(begin) / timeGroup) * timeGroup;
    begin -= offset;
    end = begin + Math.ceil((end - begin) / timeGroup) * timeGroup;

    const data = DataManager().getData(begin, end);

    const bitAccumulator = getDataProcessor(digitalChannelsToCompute);

    bitAccumulator.initialise(digitalChannelsToCompute);

    const noOfPointToRender = data.current.length / numberOfPointsPerGrouped;
    const needMinMaxLine = numberOfPointsPerGrouped !== 1;

    if (!needMinMaxLine) {
        const ampereLineData: AmpereState[] = new Array(
            Math.ceil(noOfPointToRender)
        );
        data.current.forEach((v, i) => {
            const timestamp = begin + offset + i * timeGroup;
            if (!Number.isNaN(v) && data.bits && i < data.bits.length) {
                bitAccumulator.processBits(data.bits[i]);
                bitAccumulator.processAccumulatedBits(timestamp);
            }

            ampereLineData[i] = {
                x: timestamp,
                y: v,
            };
        });

        return {
            ampereLineData,
            bitsLineData: bitAccumulator.getLineData(),
        };
    }

    const ampereLineData: AmpereState[] = new Array(
        Math.ceil(noOfPointToRender) * 2
    );

    {
        let min: number = Number.MAX_VALUE;
        let max: number = -Number.MAX_VALUE;

        let timestamp = begin + offset;
        data.current.forEach((v, index) => {
            const firstItemInGrp = index % numberOfPointsPerGrouped === 0;
            const lastItemInGrp = (index + 1) % numberOfPointsPerGrouped === 0;
            const grpIndex = Math.floor(index / numberOfPointsPerGrouped);

            if (firstItemInGrp) {
                min = Number.MAX_VALUE;
                max = -Number.MAX_VALUE;
            }

            if (removeZeroValues && v === 0) {
                v = NaN;
            }

            if (!Number.isNaN(v)) {
                if (v > max) max = v;
                if (v < min) min = v;

                if (data.bits && index < data.bits.length) {
                    bitAccumulator.processBits(data.bits[index]);
                }
            }

            ampereLineData[grpIndex * 2] = {
                x: timestamp,
                y: min > max ? undefined : min,
            };

            ampereLineData[(grpIndex + 1) * 2 - 1] = {
                x: timestamp,
                y: min > max ? undefined : max,
            };

            if (lastItemInGrp) {
                timestamp += timeGroup;
                if (min <= max) {
                    bitAccumulator.processAccumulatedBits(timestamp);
                }
            }
        });
    }

    return {
        ampereLineData,
        bitsLineData: bitAccumulator.getLineData(),
    };
};

const simplifyCurrentData = (
    current: AmpereState[],
    begin: number,
    end: number
) => current.filter(v => v.x !== undefined && v.x >= begin && v.x <= end);

const simplifyDigitalChannelsData = (
    dataChanel: DigitalChannelState[],
    begin: number,
    end: number
) => {
    if (dataChanel.length === 1) {
        return [
            {
                x: begin,
                y: dataChanel[0].y,
            },
            {
                x: end,
                y: dataChanel[0].y,
            },
        ];
    }

    if (dataChanel.length > 1) {
        return [
            {
                x: begin,
                y: dataChanel[0].y,
            },
            ...dataChanel.slice(1, dataChanel.length - 2),
            {
                x: end,
                y: dataChanel[dataChanel.length - 1].y,
            },
        ];
    }

    return [];
};

const simplifyDigitalChannelStateData = (
    dataChanel: DigitalChannelStates,
    begin: number,
    end: number
) => ({
    mainLine: simplifyDigitalChannelsData(dataChanel.mainLine, begin, end),
    uncertaintyLine: simplifyDigitalChannelsData(
        dataChanel.uncertaintyLine,
        begin,
        end
    ),
});

const simplifyDigitalChannelsStatesData = (
    dataChanel: DigitalChannelStates[],
    begin: number,
    end: number
) => dataChanel.map(c => simplifyDigitalChannelStateData(c, begin, end));

const findMissingRanges = (
    accumulatedResult: AccumulatedResult,
    begin: number,
    end: number
) => {
    const timestamps = accumulatedResult.ampereLineData
        .filter(v => v.x !== undefined)
        .map(v => v.x as number);
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);

    const result: { begin: number; end: number; location: 'front' | 'back' }[] =
        [];

    if (min !== begin) {
        result.push({
            begin,
            end: min - indexToTimestamp(1),
            location: 'front',
        });
    }

    if (max !== end) {
        result.push({
            begin: max + indexToTimestamp(1),
            end,
            location: 'back',
        });
    }

    return result;
};

let cacheValidTimeGroup: number;
let cachedDigitalChannelsToCompute: number[];

const stateToIndex = (
    mainLineState: BitStateType | undefined,
    uncertaintyLineState: BitStateType | undefined
): BitStateIndexType => {
    if (mainLineState === undefined && uncertaintyLineState === undefined) {
        return 0;
    }
    if (
        mainLineState === BitStateType.one &&
        uncertaintyLineState === BitStateType.one
    ) {
        return always1;
    }
    if (
        mainLineState === BitStateType.zero &&
        uncertaintyLineState === BitStateType.zero
    ) {
        return always0;
    }

    return sometimes0And1;
};

const joinBitLines = (
    begin: number,
    end: number,
    dataLines: DigitalChannelStates[][],
    digitalChannelsToCompute: number[]
) => {
    const timestamp: TimestampType[] = Array(8).fill(undefined);
    const bitDataProcessor = getDataProcessor(digitalChannelsToCompute);
    bitDataProcessor.initialise(digitalChannelsToCompute);

    dataLines = dataLines.filter(d => d.length > 0);

    dataLines.forEach(dataLine => {
        dataLine.forEach((line, index) => {
            const numberOfElement = Math.min(
                line.mainLine.length,
                line.uncertaintyLine.length
            );
            for (let i = 0; i < numberOfElement; i += 1) {
                bitDataProcessor.processBitState(
                    stateToIndex(line.mainLine[i].y, line.uncertaintyLine[i].y),
                    index
                );

                if (timestamp[index] !== line.mainLine[i].x) {
                    timestamp[index] = line.mainLine[i].x;
                    bitDataProcessor.processAccumulatedBits(timestamp[index]);
                }
            }
        });
    });

    return bitDataProcessor.getLineData();
};

const getDataProcessor = (digitalChannelsToCompute: number[]) =>
    digitalChannelsToCompute.length > 0
        ? bitDataAccumulator()
        : (noOpBitDataProcessor() as BitDataAccumulator); // BitDataAccumulator is not the correct type. keeping old solution for now

// true is rhs has all elements from lhs
const compareDigitalChanel = (rhs: number[], lhs: number[]) =>
    lhs.every(v => rhs.findIndex(x => x === v) !== -1);

export type DataAccumulatorInitialiser = () => DataAccumulator;
export default (): DataAccumulator => ({
    bitStateAccumulator: new Array(numberOfDigitalChannels),

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
            };
        }

        const suggestedNoOfRawSamples =
            DataManager().getNumberOfSamplesInWindow(windowDuration);

        const numberOfPointsPerGroup = Math.ceil(
            suggestedNoOfRawSamples / maxNumberOfPoints
        );

        const timeGroup = indexToTimestamp(numberOfPointsPerGroup);

        if (
            timeGroup !== cacheValidTimeGroup ||
            !compareDigitalChanel(
                cachedDigitalChannelsToCompute,
                digitalChannelsToCompute
            )
        ) {
            cachedResult = undefined;
        }

        cacheValidTimeGroup = timeGroup;
        cachedDigitalChannelsToCompute = digitalChannelsToCompute;

        end = Math.min(DataManager().getTimestamp(), end);

        const getDataWithCachedResult = () => {
            if (!cachedResult || DataManager().getTotalSavedRecords() === 0)
                return accumulate(
                    begin,
                    end,
                    timeGroup,
                    numberOfPointsPerGroup,
                    removeZeroValues,
                    digitalChannelsToCompute
                );

            const usableCachedData: AccumulatedResult = {
                ampereLineData: simplifyCurrentData(
                    cachedResult.ampereLineData,
                    begin,
                    Math.min(
                        Math.floor(end / timeGroup) * timeGroup,
                        DataManager().getTimestamp()
                    )
                ),
                bitsLineData: simplifyDigitalChannelsStatesData(
                    cachedResult.bitsLineData,
                    begin,
                    Math.min(
                        Math.floor(end / timeGroup) * timeGroup,
                        DataManager().getTimestamp()
                    )
                ),
            };

            if (usableCachedData.ampereLineData.length === 0) {
                return accumulate(
                    begin,
                    end,
                    timeGroup,
                    numberOfPointsPerGroup,
                    removeZeroValues,
                    digitalChannelsToCompute
                );
            }

            const rangesToLoad = findMissingRanges(
                usableCachedData,
                begin,
                end
            );

            const loadedData = rangesToLoad.map(r => ({
                location: r.location,
                ...accumulate(
                    r.begin,
                    r.end,
                    timeGroup,
                    numberOfPointsPerGroup,
                    removeZeroValues,
                    digitalChannelsToCompute
                ),
            }));

            const frontData = loadedData.find(d => d.location === 'front');
            const backData = loadedData.find(d => d.location === 'back');

            return {
                ampereLineData: [
                    ...(frontData?.ampereLineData ?? []),
                    ...usableCachedData.ampereLineData,
                    ...(backData?.ampereLineData ?? []),
                ],
                bitsLineData: joinBitLines(
                    begin,
                    end,
                    [
                        frontData?.bitsLineData ?? [],
                        usableCachedData.bitsLineData,
                        backData?.bitsLineData ?? [],
                    ],
                    digitalChannelsToCompute
                ),
            };
        };

        cachedResult = getDataWithCachedResult();

        return {
            ampereLineData: cachedResult.ampereLineData,
            bitsLineData: cachedResult.bitsLineData,
        };
    },
});
