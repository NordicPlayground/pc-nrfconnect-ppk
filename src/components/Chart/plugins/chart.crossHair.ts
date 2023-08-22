/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { Plugin } from 'chart.js';
import { colors } from 'pc-nrfconnect-shared';

import type { AmpereChart } from '../AmpereChart';

const { gray700: color, white } = colors;

interface CrossHairPlugin extends Plugin<'line'> {
    instances: AmpereChart[];
    moveEvent: null | {
        offsetX: number;
        offsetY: number;
        drawY: boolean;
    };
    pointerMoveHandler: (event: PointerEvent, chart: AmpereChart) => void;
    pointerLeaveHandler: () => void;
}

const plugin: CrossHairPlugin = {
    id: 'crossHair',
    instances: [],
    moveEvent: null,

    pointerMoveHandler(event, chart) {
        const {
            chartArea: { left },
            options: { snapping, live },
            config: {
                options: { id },
            },
        } = chart;

        if (live) {
            plugin.moveEvent = null;
            return;
        }

        let { offsetX, offsetY } = event;

        const drawY = id === 'ampereChart';

        if (snapping) {
            const hit = chart.getElementsAtEventForMode(
                event,
                'nearest',
                {},
                true
            )[0];
            if (hit) {
                const { x, y } = hit.element;
                offsetX = x;
                offsetY = y;
            }
        }
        plugin.moveEvent = { offsetX: offsetX - left, offsetY, drawY };
        plugin.instances.forEach(instance => instance.update('none'));
    },

    pointerLeaveHandler() {
        plugin.moveEvent = null;
        plugin.instances.forEach(instance => instance.update('none'));
    },

    beforeInit(chart: AmpereChart) {
        plugin.instances.push(chart);

        const { canvas } = chart.ctx;
        canvas.addEventListener('pointermove', event =>
            plugin.pointerMoveHandler(event, chart)
        );
        canvas.addEventListener('pointerleave', plugin.pointerLeaveHandler);
    },

    afterDraw(chart: AmpereChart) {
        const {
            ctx,
            chartArea: { left, right, top, bottom },
            scales: { xScale, yScale },
            config: {
                options: { formatX, formatY },
            },
        } = chart;
        const { canvas } = ctx;

        if (!plugin.moveEvent) {
            canvas.style.cursor = 'default';
            return;
        }

        const { offsetX, offsetY } = plugin.moveEvent;
        const x = Math.ceil(offsetX - 0.5) - 0.5;
        const y = Math.ceil(offsetY - 0.5) + 0.5;

        if (offsetX >= 0 && offsetX <= right - left) {
            ctx.save();
            ctx.lineWidth = 0.5;
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(left + x, top);
            ctx.lineTo(left + x, bottom);
            ctx.closePath();
            ctx.stroke();

            if (chart.height > 32 && formatX != null) {
                const xCoordinate = xScale.getValueForPixel(left + offsetX);
                if (xCoordinate != null) {
                    const xLabel = formatX(xCoordinate, 0, []);
                    if (xLabel != null) {
                        const [time, subsecond] = xLabel;
                        const { width: tsWidth } = ctx.measureText(time);
                        ctx.fillStyle = color;
                        ctx.textAlign = 'right';
                        ctx.fillRect(left + offsetX, top, tsWidth + 10, 33);
                        ctx.fillStyle = white;
                        ctx.textAlign = 'center';
                        ctx.fillText(
                            time,
                            left + offsetX + 5 + tsWidth / 2,
                            top + 13
                        );
                        ctx.fillText(
                            subsecond,
                            left + offsetX + 5 + tsWidth / 2,
                            top + 28
                        );
                    }
                }
            }

            ctx.restore();
        }

        if (offsetY < top || offsetY > bottom) {
            canvas.style.cursor = 'default';
            return;
        }

        canvas.style.cursor = 'pointer';

        if (
            plugin.moveEvent.drawY &&
            yScale?.id === 'yScale' &&
            formatY != null
        ) {
            ctx.save();
            ctx.lineWidth = 0.5;
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(left, y);
            ctx.lineTo(right, y);
            ctx.closePath();
            ctx.stroke();

            const yCoordinate = yScale.getValueForPixel(offsetY);
            const uA = yCoordinate ? formatY(yCoordinate) : null;

            if (uA != null) {
                const { width: uAWidth } = ctx.measureText(uA);

                ctx.fillStyle = color;
                ctx.textAlign = 'right';
                ctx.fillRect(
                    right - uAWidth - 10,
                    offsetY - 20,
                    uAWidth + 10,
                    20
                );
                ctx.fillStyle = white;
                ctx.fillText(uA, right - 5, offsetY - 7);
            }

            ctx.restore();
        }
    },

    destroy(chartInstance) {
        const i = plugin.instances.findIndex(
            ({ id }) => id === chartInstance.id
        );
        if (i > -1) {
            plugin.instances.splice(i, 1);
        }
    },
};

export default plugin;
