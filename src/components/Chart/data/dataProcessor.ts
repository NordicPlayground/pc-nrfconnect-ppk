/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { DataManager, indexToTimestamp, normalizeTime } from '../../../globals';
import {
    AmpereState,
    DigitalChannelState,
    DigitalChannelStates,
    TimestampType,
} from './dataTypes';

export type AverageLine = { x: TimestampType; y: number; count: number };

type AccumulatedResult = {
    ampereLineData: AmpereState[];
    bitsLineData: DigitalChannelStates[];
    averageLine: AverageLine[];
};

const removeCurrentSamplesOutsideScopes = <T extends AmpereState | AverageLine>(
    current: T[],
    begin: number,
    end: number
) => current.filter(v => v.x !== undefined && v.x >= begin && v.x <= end);

const removeDigitalChannelsSamplesOutsideScopes = (
    dataChannel: DigitalChannelState[],
    begin: number,
    end: number
) => {
    if (dataChannel.length > 1) {
        return [
            {
                x: begin,
                y: dataChannel[0].y,
            },
            ...dataChannel.slice(1, dataChannel.length - 2),
            {
                x: end,
                y: dataChannel[dataChannel.length - 1].y,
            },
        ];
    }

    return [];
};

const removeDigitalChannelStateSamplesOutsideScopes = (
    dataChannel: DigitalChannelStates,
    begin: number,
    end: number
) => ({
    mainLine: removeDigitalChannelsSamplesOutsideScopes(
        dataChannel.mainLine,
        begin,
        end
    ),
    uncertaintyLine: removeDigitalChannelsSamplesOutsideScopes(
        dataChannel.uncertaintyLine,
        begin,
        end
    ),
});

const removeDigitalChannelsStatesSamplesOutsideScopes = (
    dataChannel: DigitalChannelStates[],
    begin: number,
    end: number
) =>
    dataChannel.map(c =>
        removeDigitalChannelStateSamplesOutsideScopes(c, begin, end)
    );

const findMissingRanges = (
    accumulatedResult: AccumulatedResult,
    begin: number,
    end: number
) => {
    const timestamps = accumulatedResult.ampereLineData
        .filter(v => v.x !== undefined)
        .map(v => v.x as number);
    const min = timestamps[0];
    const max = timestamps[timestamps.length - 1];

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

const joinBitLines = (
    begin: number,
    end: number,
    dataLines: DigitalChannelStates[][],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _digitalChannelsToCompute: number[]
) => {
    // const timestamp: TimestampType[] = Array(8).fill(undefined);
    //  const bitDataProcessor = getDataProcessor(digitalChannelsToCompute);
    // bitDataProcessor.initialise(digitalChannelsToCompute);

    dataLines = dataLines.filter(d => d.length > 0);

    dataLines.forEach(dataLine => {
        dataLine.forEach(line => {
            const numberOfElement = Math.min(
                line.mainLine.length,
                line.uncertaintyLine.length
            );
            for (let i = 0; i < numberOfElement; i += 1) {
                // bitDataProcessor.processBitState(
                //     stateToIndex(line.mainLine[i].y, line.uncertaintyLine[i].y),
                //     index
                // );
                // if (timestamp[index] !== line.mainLine[i].x) {
                //     timestamp[index] = line.mainLine[i].x;
                //     bitDataProcessor.processAccumulatedBits(timestamp[index]);
                // }
            }
        });
    });

    return []; // bitDataProcessor.getLineData();
};

export const BASE = 10;

export class DataProcessor {
    timeUnit: number;
    timeGroup: number;
    numberOfPointsPerGroup: number;
    cachedData: AccumulatedResult | undefined;
    dataProcessor: DataProcessor;

    constructor(
        numberOfPointPerGroup = 1,
        childDataProcessor: DataProcessor | undefined = undefined
    ) {
        this.numberOfPointsPerGroup = numberOfPointPerGroup;
        this.timeUnit = indexToTimestamp(1);
        this.timeGroup = this.timeUnit * this.numberOfPointsPerGroup;

        // create child data processors
        if (numberOfPointPerGroup !== 1 && !childDataProcessor) {
            this.dataProcessor = new DataProcessor(
                numberOfPointPerGroup / BASE
            );
        } else if (
            // create in between dataProcessors children
            childDataProcessor &&
            childDataProcessor.numberOfPointsPerGroup * BASE !==
                numberOfPointPerGroup
        ) {
            let nextChildDataProcessor = new DataProcessor(
                childDataProcessor.numberOfPointsPerGroup * BASE,
                childDataProcessor
            );

            while (
                nextChildDataProcessor.numberOfPointsPerGroup !==
                numberOfPointPerGroup / BASE
            ) {
                const parentDataProcessor = new DataProcessor(
                    nextChildDataProcessor.numberOfPointsPerGroup * BASE,
                    nextChildDataProcessor
                );
                nextChildDataProcessor = parentDataProcessor;
            }

            this.dataProcessor = nextChildDataProcessor;
        } else {
            this.dataProcessor = childDataProcessor ?? this;
        }
    }

    #accumulate(
        begin: number,
        offset: number,
        removeZeroValues: boolean,
        digitalChannelsToCompute: number[],
        data: {
            ampereLineData: AmpereState[];
            bitsLineData: DigitalChannelStates[];
            averageLine: AverageLine[];
        }
    ) {
        // const bitAccumulator = getDataProcessor(digitalChannelsToCompute);

        // bitAccumulator.initialise(digitalChannelsToCompute);

        const noOfPointToRender = data.averageLine.length / BASE;

        const ampereLineData: AmpereState[] = new Array(
            Math.ceil(noOfPointToRender) * 2 // min line and max line
        );

        const averageLine: AverageLine[] = new Array(
            Math.ceil(noOfPointToRender)
        );

        let min: number = Number.MAX_VALUE;
        let max: number = -Number.MAX_VALUE;

        const hasMinMaxLine =
            data.ampereLineData.length === data.averageLine.length * 2;

        let timestamp = begin + offset - this.timeGroup;
        data.ampereLineData.forEach((v, index) => {
            const firstItemInGrp =
                index % (hasMinMaxLine ? 2 * BASE : BASE) === 0;
            const groupIndex = Math.floor(
                index / (hasMinMaxLine ? 2 * BASE : BASE)
            );

            if (firstItemInGrp) {
                timestamp += this.timeGroup;
                min = Number.MAX_VALUE;
                max = -Number.MAX_VALUE;
            }

            if (removeZeroValues && v.y === 0) {
                v.y = NaN;
            }

            if (v.y != null && !Number.isNaN(v.y)) {
                if (v.y > max) max = v.y;
                if (v.y < min) min = v.y;
            }

            ampereLineData[groupIndex * 2] = {
                x: timestamp,
                y: min > max ? undefined : min,
            };

            ampereLineData[(groupIndex + 1) * 2 - 1] = {
                x: timestamp,
                y: min > max ? undefined : max,
            };
        });

        timestamp = begin + offset - this.timeGroup;
        data.averageLine.forEach((v, index) => {
            const firstItemInGrp = index % BASE === 0;
            const groupIndex = Math.floor(index / BASE);

            if (firstItemInGrp) {
                timestamp += this.timeGroup;
                averageLine[groupIndex] = {
                    x: timestamp,
                    y: 0,
                    count: 0,
                };
            }

            if (removeZeroValues && v.y === 0) {
                v.y = NaN;
            }

            if (v.y != null && !Number.isNaN(v.y)) {
                averageLine[groupIndex] = {
                    x: timestamp,
                    y: averageLine[groupIndex].y + v.y,
                    count: averageLine[groupIndex].count + v.count,
                };
            }
        });

        return {
            ampereLineData,
            bitsLineData: [], // bitAccumulator.getLineData(),
            averageLine,
        };
    }

    #getDataWithCachedResult(
        begin: number,
        end: number,
        offset: number,
        removeZeroValues: boolean,
        digitalChannelsToCompute: number[]
    ) {
        if (!this.cachedData || DataManager().getTotalSavedRecords() === 0) {
            console.log('cachedData full miss', this.numberOfPointsPerGroup);
            return {
                hitRatio: 0,
                ...this.#accumulate(
                    begin,
                    offset,
                    removeZeroValues,
                    digitalChannelsToCompute,
                    this.dataProcessor.process(
                        begin,
                        end,
                        digitalChannelsToCompute,
                        removeZeroValues
                    ).data
                ),
            };
        }

        const cachedEnd = Math.min(
            Math.floor(end / this.timeGroup) * this.timeGroup,
            DataManager().getTimestamp()
        );
        const usableCachedData: AccumulatedResult = {
            ampereLineData: removeCurrentSamplesOutsideScopes(
                this.cachedData.ampereLineData,
                begin,
                cachedEnd
            ),
            bitsLineData: removeDigitalChannelsStatesSamplesOutsideScopes(
                this.cachedData.bitsLineData,
                begin,
                cachedEnd
            ),
            averageLine: removeCurrentSamplesOutsideScopes(
                this.cachedData.averageLine,
                begin,
                cachedEnd
            ),
        };

        if (usableCachedData.ampereLineData.length === 0) {
            console.log(
                'cachedData full miss',
                this.numberOfPointsPerGroup,
                begin,
                end
            );
            return {
                hitRatio: 0,
                ...this.#accumulate(
                    begin,
                    offset,
                    removeZeroValues,
                    digitalChannelsToCompute,
                    this.dataProcessor.process(
                        begin,
                        end,
                        digitalChannelsToCompute,
                        removeZeroValues
                    ).data
                ),
            };
        }

        const rangesToLoad = findMissingRanges(usableCachedData, begin, end);

        const temp = this.dataProcessor.process(
            begin,
            end,
            digitalChannelsToCompute,
            removeZeroValues
        ).data;

        const loadedData = rangesToLoad.map(r => ({
            location: r.location,
            ...this.#accumulate(
                r.begin,
                offset,
                removeZeroValues,
                digitalChannelsToCompute,
                {
                    ampereLineData: removeCurrentSamplesOutsideScopes(
                        temp.ampereLineData,
                        r.begin,
                        r.end
                    ),
                    bitsLineData:
                        removeDigitalChannelsStatesSamplesOutsideScopes(
                            temp.bitsLineData,
                            r.begin,
                            r.end
                        ),
                    averageLine: removeCurrentSamplesOutsideScopes(
                        temp.averageLine,
                        r.begin,
                        r.end
                    ),
                }
            ),
        }));

        const frontData = loadedData.find(d => d.location === 'front');
        const backData = loadedData.find(d => d.location === 'back');

        const result = [
            ...(frontData?.ampereLineData ?? []),
            ...usableCachedData.ampereLineData,
            ...(backData?.ampereLineData ?? []),
        ];

        const cacheHit = usableCachedData.ampereLineData.length / result.length;

        // console.log(
        //     'cachedData usable data %',
        //     cacheHit,
        //     this.numberOfPointsPerGroup,
        //     begin,
        //     end,
        //     rangesToLoad
        // );

        return {
            hitRatio: cacheHit,
            ampereLineData: result,
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
            averageLine: [
                ...(frontData?.averageLine ?? []),
                ...usableCachedData.averageLine,
                ...(backData?.averageLine ?? []),
            ],
        };
    }

    process(
        begin: number,
        end: number,
        digitalChannelsToCompute: number[],
        removeZeroValues: boolean,
        numberOfPointsPerGroup: number = this.numberOfPointsPerGroup
    ): {
        dataProcessor: DataProcessor;
        data: {
            ampereLineData: AmpereState[];
            bitsLineData: DigitalChannelStates[];
            averageLine: AverageLine[];
        };
    } {
        // sampling time has changed We need new data caches
        if (this.timeUnit !== indexToTimestamp(1)) {
            return new DataProcessor(numberOfPointsPerGroup).process(
                begin,
                end,
                digitalChannelsToCompute,
                removeZeroValues,
                numberOfPointsPerGroup
            );
        }

        if (numberOfPointsPerGroup > this.numberOfPointsPerGroup) {
            return new DataProcessor(numberOfPointsPerGroup, this).process(
                begin,
                end,
                digitalChannelsToCompute,
                removeZeroValues,
                numberOfPointsPerGroup
            );
        }

        if (numberOfPointsPerGroup < this.numberOfPointsPerGroup) {
            return {
                dataProcessor: this,
                data: this.dataProcessor.process(
                    begin,
                    end,
                    digitalChannelsToCompute,
                    removeZeroValues,
                    numberOfPointsPerGroup
                ).data,
            };
        }

        const offset =
            begin -
            Math.floor(normalizeTime(begin) / this.timeGroup) * this.timeGroup;
        begin -= offset;
        end =
            begin + Math.ceil((end - begin) / this.timeGroup) * this.timeGroup;

        if (numberOfPointsPerGroup === 1) {
            const data = DataManager().getData(begin, end);

            const noOfPointToRender =
                data.current.length / numberOfPointsPerGroup;
            const ampereLineData: AmpereState[] = new Array(
                Math.ceil(noOfPointToRender)
            );
            data.current.forEach((v, i) => {
                const timestamp = begin + offset + i * this.timeGroup;
                // if (!Number.isNaN(v) && data.bits && i < data.bits.length) {
                //     bitAccumulator.processBits(data.bits[i]);
                //     bitAccumulator.processAccumulatedBits(timestamp);
                // }

                ampereLineData[i] = {
                    x: timestamp,
                    y: v,
                };
            });

            return {
                dataProcessor: this,
                data: {
                    ampereLineData,
                    bitsLineData: [], // bitAccumulator.getLineData(),
                    averageLine: ampereLineData.map(
                        d => ({ ...d, count: 1 } as AverageLine)
                    ),
                },
            };
        }

        const result = this.#getDataWithCachedResult(
            begin,
            end,
            offset,
            removeZeroValues,
            digitalChannelsToCompute
        );

        if (result.hitRatio < 0.5) {
            this.cachedData = result;
            console.log(
                'replacing cache',
                this.numberOfPointsPerGroup,
                result.hitRatio,
                begin,
                end
            );
        }

        return {
            dataProcessor: this,
            data: result,
        };
    }
}
