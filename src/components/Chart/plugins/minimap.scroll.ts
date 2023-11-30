/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { Plugin } from 'chart.js';

import type { MinimapChart } from '../../../features/minimap/Minimap';
import { eventEmitter } from '../../../features/minimap/minimapEvents';
import { DataManager, indexToTimestamp } from '../../../globals';

interface MinimapScroll extends Plugin<'line'> {
    leftClickPressed: boolean;
    dataBuffer: Array<{ x: number; y: number | undefined }>;
    dataBufferStep: number;
    globalDataBufferIndex: number;
    localDataBufferIndex: number;
    scaleDownFlag: boolean;
    adjustDataResolution: () => void;
    updateMinimapData: (chart: MinimapChart) => void;
    clearMinimap: (chart: MinimapChart) => void;
}

function pan(event: PointerEvent, chart: MinimapChart) {
    if (chart.windowNavigateCallback == null) return;
    if (chart.data.datasets[0].data.length === 0) return;

    const {
        scales: { x: xScale },
    } = chart;

    const xPosition = xScale.getValueForPixel(event.offsetX);
    if (xPosition == null) return;
    if (chart.options.ampereChart?.windowDuration == null) {
        return;
    }

    const halfWindow = chart.options.ampereChart.windowDuration / 2;

    if (xPosition - halfWindow < 0) {
        chart.windowNavigateCallback(halfWindow);
        return;
    }

    const edgeOfMinimap = DataManager().getTimestamp();
    if (xPosition + halfWindow > edgeOfMinimap) {
        chart.windowNavigateCallback(edgeOfMinimap - halfWindow);
        return;
    }

    chart.windowNavigateCallback(xPosition);
}

const plugin: MinimapScroll = {
    id: 'minimapScroll',
    leftClickPressed: false,
    dataBufferStep: 1,
    dataBuffer: new Array(1_000 * 2),
    globalDataBufferIndex: 0,
    localDataBufferIndex: 0,
    scaleDownFlag: false,

    beforeInit(chart: MinimapChart) {
        const { canvas } = chart.ctx;
        this.dataBuffer.fill({ x: 0, y: undefined });
        this.globalDataBufferIndex = 0;
        this.localDataBufferIndex = 0;

        canvas.addEventListener('pointermove', event => {
            if (this.leftClickPressed === true) {
                pan(event, chart);
            }
        });

        canvas.addEventListener('pointerdown', event => {
            if (event.button === 0) {
                this.leftClickPressed = true;
                pan(event, chart);
            }
        });

        canvas.addEventListener('pointerup', event => {
            if (event.button === 0) {
                this.leftClickPressed = false;
            }
        });
        canvas.addEventListener('pointerleave', () => {
            this.leftClickPressed = false;
        });
        eventEmitter.on('updateMinimap', () => {
            this.updateMinimapData(chart);
        });
        eventEmitter.on('clearMinimap', () => {
            this.clearMinimap(chart);
        });

        // In case data already exist
        this.updateMinimapData(chart);
    },

    beforeDestroy(chart: MinimapChart) {
        const { canvas } = chart.ctx;
        canvas.removeEventListener('pointermove', event => {
            if (this.leftClickPressed === true) {
                pan(event, chart);
            }
        });

        canvas.removeEventListener('pointerdown', event => {
            if (event.button === 0) {
                this.leftClickPressed = true;
                pan(event, chart);
            }
        });

        canvas.removeEventListener('pointerup', event => {
            if (event.button === 0) {
                this.leftClickPressed = false;
            }
        });
        canvas.removeEventListener('pointerleave', () => {
            this.leftClickPressed = false;
        });
        eventEmitter.removeListener('updateMinimap', () => {
            this.updateMinimapData(chart);
        });
        eventEmitter.removeListener('clearMinimap', () => {
            this.clearMinimap(chart);
        });
    },

    adjustDataResolution() {
        // Figure out how far the sample has come, in case it's a loaded sample
        const numberOfSamples = DataManager().getTotalSavedRecords();

        // Figure out a resolution based on the number of samples.
        if (numberOfSamples < 1_000) {
            this.scaleDownFlag = false;
            this.dataBufferStep = 1;
        } else {
            this.scaleDownFlag = true;
            this.dataBufferStep = Math.ceil(numberOfSamples / (1_000 * 0.8));
        }

        this.dataBuffer.fill({ x: 0, y: undefined });
        this.globalDataBufferIndex = 0;
        this.localDataBufferIndex = 0;
    },

    updateMinimapData(chart) {
        if (DataManager().getTotalSavedRecords() < 400) {
            // Not able to make it look any good...
            return;
        }

        if (
            DataManager().getTotalSavedRecords() / this.dataBufferStep >
            1_000
        ) {
            // Buffer would overflow, so adjust the resolution.
            this.adjustDataResolution();
        }

        if (this.scaleDownFlag) {
            do {
                const accumulatedData = accumulateData(
                    this.globalDataBufferIndex,
                    this.dataBufferStep
                );
                this.dataBuffer[this.localDataBufferIndex] = accumulatedData[0];
                this.localDataBufferIndex += 1;
                this.dataBuffer[this.localDataBufferIndex] = accumulatedData[1];
                this.localDataBufferIndex += 1;

                this.globalDataBufferIndex += this.dataBufferStep;
            } while (
                this.globalDataBufferIndex + this.dataBufferStep <
                DataManager().getTotalSavedRecords()
            );
        } else {
            const data = DataManager().getData(
                indexToTimestamp(this.globalDataBufferIndex)
            );

            data.forEach(v => {
                this.dataBuffer[this.localDataBufferIndex] = {
                    x: indexToTimestamp(this.globalDataBufferIndex),
                    y: v,
                };

                this.globalDataBufferIndex += 1;
                this.localDataBufferIndex += 1;
            });
        }

        /* @ts-expect-error Have not figured out how to handle this */
        chart.data.datasets[0].data = this.dataBuffer;
        if (chart.options.scales?.x != null) {
            chart.options.scales.x.max = DataManager().getTimestamp();
        }
        chart.update();

        if (
            this.globalDataBufferIndex > DataManager().getTotalSavedRecords() &&
            this.scaleDownFlag
        ) {
            // Redo last interval if options.index has not come far enough;
            // TODO: Make sure this is not async ?
            this.localDataBufferIndex -= 2;
            this.globalDataBufferIndex -= this.dataBufferStep;
        }
    },

    clearMinimap(chart) {
        this.scaleDownFlag = false;
        this.dataBufferStep = 1;
        this.dataBuffer.fill({ x: 0, y: undefined });
        this.globalDataBufferIndex = 0;
        this.localDataBufferIndex = 0;
        chart.data.datasets[0].data = [];
        if (chart.options.scales?.x != null) {
            chart.options.scales.x.max = DataManager().getTimestamp();
        }
        chart.update();
    },
};

function accumulateData(indexBegin: number, numberOfSamples: number) {
    const data = DataManager().getData(
        indexToTimestamp(indexBegin),
        indexToTimestamp(indexBegin + numberOfSamples)
    );

    let min: number = Number.MAX_VALUE;
    let max: number = Number.MIN_VALUE;

    data.forEach(value => {
        if (value > max) {
            max = value;
        }
        if (min !== 0 && value < min) {
            min = value < 0 ? 0 : value;
        }
    });

    // We never expect min === Number.MAX_VALUE and/or max === Number.MIN_VALUE to happen,
    // but if it would happen, it would lead chart.js to hang without error. Making the
    // app unusable without warning. Hence, we'd rather want the points to be undefined.
    return [
        {
            x: indexToTimestamp(indexBegin),
            y: min === Number.MAX_VALUE ? undefined : min,
        },
        {
            x: indexToTimestamp(indexBegin),
            y: max === Number.MIN_VALUE ? undefined : max,
        },
    ];
}

export default plugin;
