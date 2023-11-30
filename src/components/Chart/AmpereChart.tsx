/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import type {
    ChartJSOrUndefined,
    ForwardedRef,
} from 'react-chartjs-2/dist/types';
import { useDispatch, useSelector } from 'react-redux';
import { colors } from '@nordicsemiconductor/pc-nrfconnect-shared';
import { Chart, ChartConfiguration, ChartData, ChartOptions } from 'chart.js';
import { unit } from 'mathjs';

import { updateTriggerLevel as updateTriggerLevelAction } from '../../actions/deviceActions';
import { indexToTimestamp } from '../../globals';
import { appState } from '../../slices/appSlice';
import { chartState } from '../../slices/chartSlice';
import { triggerLevelSetAction, triggerState } from '../../slices/triggerSlice';
import { isRealTimePane as isRealTimePaneSelector } from '../../utils/panes';
import { type CursorData } from './Chart';
import { AmpereState } from './data/dataTypes';
import crossHairPlugin from './plugins/chart.crossHair';
import dragSelectPlugin, { DragSelect } from './plugins/chart.dragSelect';
import triggerLevelPlugin from './plugins/chart.triggerLevel';
import triggerOriginPlugin from './plugins/chart.triggerOrigin';
import zoomPanPlugin, { ZoomPan } from './plugins/chart.zoomPan';

import chartCss from './chart.icss.scss';

const { rightMarginPx, yAxisWidthPx } = chartCss;

const yAxisWidth = parseInt(yAxisWidthPx, 10);
const rightMargin = parseInt(rightMarginPx, 10);
const dataColor = colors.nordicBlue;

interface Cursor {
    cursorBegin?: null | number;
    cursorEnd?: null | number;
}

export interface AmpereChartOptions extends ChartOptions<'line'> {
    formatX: (
        usecs: number,
        index: number,
        array: number[]
    ) => string | string[] | undefined;
    formatY: (current: number) => string;
    triggerLevel?: null | number;
    triggerActive: boolean;
    sendTriggerLevel: (level: number) => void;
    updateTriggerLevel: (level: number) => void;
    snapping: boolean;
    live: boolean;
    triggerHandleVisible: boolean;
    triggerOrigin: number | null;
    windowDuration: number;
    cursor: Cursor;
    id?: string;
}

interface AmpereChartConfigurations extends ChartConfiguration<'line'> {
    options: AmpereChartOptions;
}

export interface AmpereChartJS extends Chart<'line'> {
    options: AmpereChartOptions;
    dragSelect?: DragSelect;
    zoomPan?: ZoomPan;
    sampleFrequency?: number;
    triggerLine: Pick<AmpereState, 'y'>;
    config: AmpereChartConfigurations;
}

interface AmpereChartProperties {
    setWindowsNumberOfPixels: (length: number) => void;
    setChartAreaWidth: (width: number) => void;
    samplesPixel: number;
    chartRef: React.MutableRefObject<null | AmpereChartJS>;
    cursorData: CursorData;
    lineData: AmpereState[];
}

const formatCurrent = (uA: number) =>
    typeof uA === 'number'
        ? unit(uA, 'uA')
              .format({ notation: 'auto', precision: 4 })
              .replace('u', '\u00B5')
        : (undefined as never);

export default ({
    setWindowsNumberOfPixels,
    setChartAreaWidth,
    samplesPixel,
    chartRef,
    cursorData: { begin, end },
    lineData,
}: AmpereChartProperties) => {
    const dispatch = useDispatch();
    const {
        triggerLevel,
        triggerRunning,
        triggerSingleWaiting,
        triggerOrigin,
    } = useSelector(triggerState);
    const {
        windowBegin,
        windowEnd,
        windowDuration,
        cursorBegin,
        cursorEnd,
        yMin,
        yMax,
        yAxisLog,
        timestampsVisible,
    } = useSelector(chartState);
    const { samplingRunning } = useSelector(appState);
    const isRealTimePane = useSelector(isRealTimePaneSelector);
    const sendTriggerLevel = (level: number) =>
        dispatch(updateTriggerLevelAction(level));
    const updateTriggerLevel = (level: number) =>
        dispatch(triggerLevelSetAction(level));

    const timestampToLabel = useCallback(
        (_usecs, index, array) => {
            if (typeof _usecs !== 'number') {
                return undefined as never;
            }
            const timestampAtTriggerOrigin =
                triggerOrigin == null ? null : indexToTimestamp(triggerOrigin);

            const usecs = _usecs - (timestampAtTriggerOrigin ?? 0);

            const microseconds = Math.abs(usecs);
            const sign = usecs < 0 ? '-' : '';
            if (!array) {
                return `${sign}${Number(microseconds / 1e3).toFixed(3)} ms`;
            }
            if (
                timestampAtTriggerOrigin &&
                index > 0 &&
                index < array.length - 1
            ) {
                const first = array[0] - timestampAtTriggerOrigin;
                const last = array[array.length - 1] - timestampAtTriggerOrigin;
                const range = last - first;
                if (usecs - first < range / 8 || last - usecs < range / 8) {
                    return undefined;
                }
            }
            const d = new Date(microseconds / 1e3);
            const h = d.getUTCHours().toString().padStart(2, '0');
            const m = d.getUTCMinutes().toString().padStart(2, '0');
            const s = d.getUTCSeconds().toString().padStart(2, '0');

            const time = `${sign}${h}:${m}:${s}`;
            const subsecond = `${Number((microseconds / 1e3) % 1e3).toFixed(
                3
            )}`.padStart(7, '0');

            return [time, subsecond];
        },
        [triggerOrigin]
    );

    const live =
        windowBegin === 0 &&
        windowEnd === 0 &&
        (samplingRunning || triggerRunning || triggerSingleWaiting);
    const snapping = samplesPixel <= 0.16 && !live;

    const pointRadius = samplesPixel <= 0.08 ? 4 : 2;
    const chartDataSets: ChartData<'line', AmpereState[]> = {
        datasets: [
            {
                borderColor: dataColor,
                borderWidth: samplesPixel > 2 ? 1 : 1.5,
                fill: false,
                data: lineData,
                pointRadius: snapping ? pointRadius : 0,
                pointHoverRadius: snapping ? pointRadius : 0,
                pointHitRadius: snapping ? pointRadius : 0,
                pointBackgroundColor: colors.white,
                pointHoverBackgroundColor: dataColor,
                pointBorderWidth: 1.5,
                pointHoverBorderWidth: 1.5,
                pointBorderColor: dataColor,
                pointHoverBorderColor: dataColor,
                tension: snapping ? 0.2 : 0,
                label: 'Current',
                xAxisID: 'xScale',
                yAxisID: 'yScale',
            },
        ],
    };

    const chartOptions: AmpereChartOptions = {
        scales: {
            xScale: {
                type: 'linear',
                display: true,
                min: begin > 0 ? begin : 0,
                max: begin > 0 ? end : windowDuration,
                ticks: {
                    display: timestampsVisible,
                    autoSkipPadding: 25,
                    callback: timestampToLabel,
                    maxTicksLimit: 7,
                },
                border: {
                    display: true,
                },
                grid: {
                    drawOnChartArea: true,
                },
                afterFit: scale => {
                    scale.paddingRight = rightMargin;
                },
            },
            yScale: {
                type: yAxisLog ? 'logarithmic' : 'linear',
                min: yMin != null ? yMin : undefined,
                max: yMax != null ? yMax : undefined,
                ticks: {
                    maxTicksLimit: 7,
                    callback: uA =>
                        typeof uA === 'number' && uA >= 0
                            ? formatCurrent(uA)
                            : '',
                },
                border: {
                    display: true,
                },
                grid: {
                    drawOnChartArea: true,
                },
                afterFit: scale => {
                    scale.width = yAxisWidth;
                },
            },
        },
        parsing: false,
        maintainAspectRatio: false,
        animation: false,
        formatX: timestampToLabel,
        formatY: formatCurrent,
        triggerLevel,
        triggerActive: triggerRunning || triggerSingleWaiting,
        sendTriggerLevel,
        updateTriggerLevel,
        snapping,
        live,
        triggerHandleVisible: isRealTimePane,
        triggerOrigin,
        windowDuration,
        cursor: { cursorBegin, cursorEnd },
        id: 'ampereChart',
    };

    const plugins = [
        dragSelectPlugin,
        zoomPanPlugin,
        triggerLevelPlugin(dispatch),
        triggerOriginPlugin,
        crossHairPlugin,
        {
            id: 'notifier',
            afterLayout(chart: Chart) {
                const { chartArea, width } = chart;
                chartArea.right = width - rightMargin;
                const { left, right } = chart.chartArea;
                const w = Math.trunc(right - left);
                setWindowsNumberOfPixels(Math.min(w, 2000));
                setChartAreaWidth(w);
            },
        },
    ];

    return (
        <div className="chart-container">
            <Line
                ref={chartRef as ForwardedRef<ChartJSOrUndefined<'line'>>}
                // Need to typecast because of react-chartjs-2
                data={chartDataSets as ChartData<'line'>}
                options={chartOptions}
                plugins={plugins}
            />
        </div>
    );
};
