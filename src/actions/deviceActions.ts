/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- TODO: Remove, only added for conservative refactoring to typescript */
/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: Remove, only added for conservative refactoring to typescript */

import { isDevelopment, logger, usageData } from 'pc-nrfconnect-shared';

import Device from '../device';
import {
    isRTTDevice,
    isSerialDevice,
    SampleValues,
    SupportedDevice,
} from '../device/types';
import { startPreventSleep, stopPreventSleep } from '../features/preventSleep';
import {
    indexToTimestamp,
    initializeBitsBuffer,
    initializeDataBuffer,
    options,
    removeBitsBuffer,
    setSamplingRate,
    updateTitle,
} from '../globals';
import { RootState } from '../slices';
import {
    deviceClosedAction,
    deviceOpenedAction,
    rttStartAction,
    samplingStartAction,
    samplingStoppedAction,
    setDeviceRunningAction,
    setFileLoadedAction,
    setPowerModeAction,
} from '../slices/appSlice';
import {
    animationAction,
    chartWindowAction,
    chartWindowUnLockAction,
    resetCursorAndChart,
    updateHasDigitalChannels,
} from '../slices/chartSlice';
import { setSamplingAttrsAction } from '../slices/dataLoggerSlice';
import { updateGainsAction } from '../slices/gainsSlice';
import { resistorsResetAction } from '../slices/resistorCalibrationSlice';
import {
    spikeFilteringToggleAction,
    switchingPointsDownSetAction,
    switchingPointsResetAction,
} from '../slices/switchingPointsSlice';
import { TDispatch } from '../slices/thunk';
import {
    clearSingleTriggerWaitingAction,
    externalTriggerToggledAction,
    setTriggerOriginAction,
    toggleTriggerAction,
    triggerLengthSetAction,
    triggerLevelSetAction,
    triggerSingleSetAction,
    triggerWindowRangeAction,
} from '../slices/triggerSlice';
import { updateRegulatorAction } from '../slices/voltageRegulatorSlice';
import EventAction from '../usageDataActions';
import { convertBits16 } from '../utils/bitConversion';
import { isRealTimePane } from '../utils/panes';
import { setSpikeFilter as persistSpikeFilter } from '../utils/persistentStore';
import { calculateWindowSize, processTriggerSample } from './triggerActions';

let device: null | SupportedDevice = null;
let updateRequestInterval: NodeJS.Timer;

const zeroCap = isDevelopment
    ? (n: number) => n
    : (n: number) => Math.max(0, n);

export const setupOptions =
    () => (dispatch: TDispatch, getState: () => RootState) => {
        if (!device) return;
        try {
            if (isRealTimePane(getState())) {
                // in real-time
                const realtimeWindowDuration = 300;
                const newSamplesPerSecond = 1e6 / device.adcSamplingTimeUs;

                setSamplingRate(newSamplesPerSecond);
                initializeDataBuffer(realtimeWindowDuration);
                if (device.capabilities.ppkSetPowerMode) {
                    initializeBitsBuffer(realtimeWindowDuration);
                } else {
                    removeBitsBuffer();
                }
            } else {
                const { durationSeconds, sampleFreq } =
                    getState().app.dataLogger;
                setSamplingRate(sampleFreq);
                initializeDataBuffer(durationSeconds);
                if (device.capabilities.ppkSetPowerMode) {
                    initializeBitsBuffer(durationSeconds);
                } else {
                    removeBitsBuffer();
                }
            }
            options.index = 0;
            options.timestamp = 0;
        } catch (err) {
            logger.error(err);
        }
        dispatch(chartWindowUnLockAction());
        dispatch(setTriggerOriginAction({ origin: null }));
        dispatch(updateHasDigitalChannels());
        dispatch(animationAction());
    };

// Only used by Data Logger Pane
/* Start reading current measurements */
export function samplingStart() {
    return async (dispatch: TDispatch, getState: () => RootState) => {
        usageData.sendUsageData(
            isRealTimePane(getState())
                ? EventAction.START_REAL_TIME_SAMPLE
                : EventAction.START_DATA_LOGGER_SAMPLE
        );
        usageData.sendUsageData(
            device!.capabilities.hwTrigger
                ? EventAction.SAMPLE_STARTED_WITH_PPK1_SELECTED
                : EventAction.SAMPLE_STARTED_WITH_PPK2_SELECTED
        );
        options.data.fill(NaN);
        if (options.bits) {
            options.bits.fill(0);
        }
        options.index = 0;
        options.timestamp = undefined;
        dispatch(resetCursorAndChart());
        dispatch(samplingStartAction());
        await device!.ppkAverageStart();
        logger.info('Sampling started');
        startPreventSleep();
    };
}

export function samplingStop() {
    return async (dispatch: TDispatch) => {
        if (!device) return;
        dispatch(samplingStoppedAction());
        await device.ppkAverageStop();
        logger.info('Sampling stopped');
        stopPreventSleep();
    };
}

export function triggerStop() {
    return async (dispatch: TDispatch) => {
        if (!device) return;
        logger.info('Stopping trigger');
        await device.ppkTriggerStop();
        dispatch(toggleTriggerAction({ triggerRunning: false }));
        dispatch(clearSingleTriggerWaitingAction());
        stopPreventSleep();
    };
}

export const updateSpikeFilter =
    () => async (_: TDispatch, getState: () => RootState) => {
        // TODO: Must be tested for RTTDevice
        if (isRTTDevice(device)) {
            return;
        }
        const { spikeFilter } = getState().app;
        persistSpikeFilter(spikeFilter);
        await device!.ppkSetSpikeFilter(spikeFilter);
        if (getState().app.app.advancedMode) {
            const { samples, alpha, alpha5 } = spikeFilter;
            logger.info(
                `Spike filter: smooth ${samples} samples with ${alpha} coefficient (${alpha5} in range 5)`
            );
        }
    };

export function close() {
    return async (dispatch: TDispatch, getState: () => RootState) => {
        clearInterval(updateRequestInterval);
        if (!device) {
            return;
        }
        if (getState().app.app.samplingRunning) {
            await dispatch(samplingStop());
        }
        if (getState().app.trigger.triggerRunning) {
            await dispatch(triggerStop());
        }
        await device.stop();
        device.removeAllListeners();
        device = null;
        dispatch(deviceClosedAction());
        dispatch(triggerLevelSetAction({ triggerLevel: null }));
        logger.info('PPK closed');
        updateTitle();
    };
}

const initGains = () => async (dispatch: TDispatch) => {
    if (isRTTDevice(device) || !device!.capabilities.ppkSetUserGains) {
        return;
    }
    const { ug } = device!.modifiers;
    // if any value is ug is outside of [0.9..1.1] range:
    if (ug.reduce((p, c) => Math.abs(c - 1) > 0.1 || p, false)) {
        logger.info(
            'Found out-of-range user gain, setting all gains back to 1.0'
        );
        ug.splice(0, 5, 1, 1, 1, 1, 1);
        await device!.ppkSetUserGains(0, ug[0]);
        await device!.ppkSetUserGains(1, ug[1]);
        await device!.ppkSetUserGains(2, ug[2]);
        await device!.ppkSetUserGains(3, ug[3]);
        await device!.ppkSetUserGains(4, ug[4]);
    }
    [0, 1, 2, 3, 4].forEach(n =>
        dispatch(updateGainsAction({ value: ug[n] * 100, range: n }))
    );
};

export function open(deviceInfo: any) {
    return async (dispatch: TDispatch, getState: () => RootState) => {
        // TODO: Check if this is right?
        // Is this suppose to be run when another device is already connected?
        // Seems like it closes old device somewhere else first, meaning this is redundant.
        if (getState().app.app.portName) {
            await dispatch(close());
        }

        let prevValue = 0;
        let prevBits = 0;
        let nbSamples = 0;
        let nbSamplesTotal = 0;

        const initializeChartForRealTime = () => {
            const { triggerLength } = getState().app.trigger;
            const windowSize = calculateWindowSize(
                triggerLength,
                options.samplingTime
            );
            const end = indexToTimestamp(windowSize);
            dispatch(chartWindowAction(0, end!, end!));
        };

        const onSample = ({ value, bits, endOfTrigger }: SampleValues) => {
            if (options.timestamp == null) {
                options.timestamp = 0;
            }

            const {
                app: { samplingRunning },
                dataLogger: { maxSampleFreq, sampleFreq },
                trigger: {
                    triggerRunning,
                    triggerStartIndex,
                    triggerSingleWaiting,
                },
            } = getState().app;
            if (
                !triggerRunning &&
                !samplingRunning &&
                !triggerStartIndex &&
                !triggerSingleWaiting
            ) {
                return;
            }

            let zeroCappedValue = zeroCap(value!);
            const b16 = convertBits16(bits!);

            if (samplingRunning && sampleFreq < maxSampleFreq) {
                const samplesPerAverage = maxSampleFreq / sampleFreq;
                nbSamples += 1;
                nbSamplesTotal += 1;
                const f = Math.min(nbSamplesTotal, samplesPerAverage);
                if (Number.isFinite(value) && Number.isFinite(prevValue)) {
                    zeroCappedValue =
                        prevValue + (zeroCappedValue - prevValue) / f;
                }
                if (nbSamples < samplesPerAverage) {
                    if (value !== undefined) {
                        prevValue = zeroCappedValue;
                        prevBits |= b16;
                    }
                    return;
                }
                nbSamples = 0;
            }

            options.data[options.index] = zeroCappedValue;
            if (options.bits) {
                options.bits[options.index] = b16 | prevBits;
                prevBits = 0;
            }
            options.index += 1;
            options.timestamp += options.samplingTime;

            if (options.index === options.data.length) {
                if (samplingRunning) {
                    dispatch(samplingStop());
                }
            }
            if (triggerRunning || triggerSingleWaiting) {
                dispatch(
                    processTriggerSample(value!, device!, {
                        samplingTime: options.samplingTime,
                        dataIndex: options.index,
                        dataBuffer: options.data,
                        endOfTrigger: endOfTrigger!,
                    })
                );
            }
        };

        try {
            device = Device(deviceInfo, onSample);

            usageData.sendUsageData(
                device.capabilities.hwTrigger
                    ? EventAction.PPK_1_SELECTED
                    : EventAction.PPK_2_SELECTED
            );

            dispatch(
                setSamplingAttrsAction({
                    maxContiniousSamplingTimeUs:
                        device.capabilities.maxContinuousSamplingTimeUs!,
                })
            );
            dispatch(setupOptions());
            dispatch(
                setDeviceRunningAction({ isRunning: device.isRunningInitially })
            );
            const metadata = device.parseMeta(await device.start());
            const { triggerLength, triggerLevel, triggerWindowRange } =
                getState().app.trigger;
            if (!triggerLength) await dispatch(triggerLengthUpdate(10));
            if (!triggerLevel)
                dispatch(triggerLevelSetAction({ triggerLevel: 1000 }));
            if (!triggerWindowRange)
                dispatch(
                    triggerWindowRangeAction({ ...device.triggerWindowRange })
                );

            dispatch(resistorsResetAction({ ...metadata }));
            dispatch(switchingPointsResetAction(metadata));
            await device.ppkUpdateRegulator(metadata.vdd);
            dispatch(
                updateRegulatorAction({
                    vdd: metadata.vdd,
                    currentVDD: metadata.vdd,
                    ...device.vddRange,
                })
            );
            await dispatch(initGains());
            if (device.capabilities.ppkSetSpikeFilter) {
                dispatch(updateSpikeFilter());
            }
            if (device.capabilities.ppkSetPowerMode) {
                const isSmuMode = metadata.mode === 2;
                // 1 = Ampere
                // 2 = SMU
                dispatch(setPowerModeAction({ isSmuMode }));
                if (!isSmuMode) dispatch(setDeviceRunning(true));
            }

            dispatch(rttStartAction());
            dispatch(setFileLoadedAction({ loaded: false }));

            if (isRealTimePane(getState())) {
                initializeChartForRealTime();
            }

            logger.info('PPK started');
        } catch (err) {
            logger.error('Failed to start PPK');
            logger.debug(err);
            dispatch({ type: 'device/deselectDevice' });
        }

        dispatch(
            deviceOpenedAction({
                portName: deviceInfo.serialNumber,
                capabilities: device!.capabilities,
            })
        );

        logger.info('PPK opened');
        updateTitle(deviceInfo.serialNumber);

        device!.on('error', (message, error) => {
            logger.error(message);
            if (error) {
                dispatch(close());
                logger.debug(error);
            }
        });

        clearInterval(updateRequestInterval);
        let renderIndex: number;
        updateRequestInterval = setInterval(() => {
            if (
                renderIndex !== options.index &&
                getState().app.app.samplingRunning
            ) {
                const timestamp = Date.now();
                requestAnimationFrame(() => {
                    /*
                        requestAnimationFrame pauses when app is in the background.
                        If timestamp is more than 10ms ago, do not dispatch animationAction.
                    */
                    if (Date.now() - timestamp < 100) {
                        dispatch(animationAction());
                    }
                });
                renderIndex = options.index;
            }
        }, 30);
    };
}

export function updateRegulator() {
    return async (dispatch: TDispatch, getState: () => RootState) => {
        const { vdd } = getState().app.voltageRegulator;
        await device!.ppkUpdateRegulator(vdd);
        logger.info(`Voltage regulator updated to ${vdd} mV`);
        dispatch(updateRegulatorAction({ currentVDD: vdd }));
    };
}

export const updateGains =
    (index: number) => async (_: TDispatch, getState: () => RootState) => {
        if (isRTTDevice(device) || !device!.ppkSetUserGains) {
            return;
        }
        const { gains } = getState().app;
        const gain = gains[index] / 100;
        await device!.ppkSetUserGains(index, gain);
        logger.info(`Gain multiplier #${index + 1} updated to ${gain}`);
    };

/**
 * Takes the window value in milliseconds, adjusts for microsecs
 * and resolves the number of bytes we need for this size of window.
 * @param {number} value  Value received in milliseconds
 * @returns {null} Nothing
 */
export function triggerLengthUpdate(value: number) {
    return async (dispatch: TDispatch) => {
        dispatch(triggerLengthSetAction({ triggerLength: value }));
        // If division returns a decimal, round downward to nearest integer
        if (isRTTDevice(device) && device!.capabilities.ppkTriggerWindowSet) {
            await device.ppkTriggerWindowSet(value);
        }
        logger.info(`Trigger length updated to ${value} ms`);
    };
}

export function triggerStart() {
    return async (dispatch: TDispatch, getState: () => RootState) => {
        dispatch(resetCursorAndChart());
        dispatch(toggleTriggerAction({ triggerRunning: true }));
        dispatch(clearSingleTriggerWaitingAction());

        const { triggerLevel } = getState().app.trigger;
        logger.info(`Starting trigger at ${triggerLevel} \u00B5A`);

        await device!.ppkTriggerSet(triggerLevel!);
        startPreventSleep();
    };
}

export function triggerSingleSet() {
    return async (dispatch: TDispatch, getState: () => RootState) => {
        dispatch(resetCursorAndChart());
        dispatch(triggerSingleSetAction());

        const { triggerLevel } = getState().app.trigger;
        logger.info(`Waiting for single trigger at ${triggerLevel} \u00B5A`);

        await device!.ppkTriggerSingleSet(triggerLevel!);
        startPreventSleep();
    };
}

export function setDeviceRunning(isRunning: boolean) {
    return async (dispatch: TDispatch) => {
        await device!.ppkDeviceRunning(isRunning ? 1 : 0);
        logger.info(`DUT ${isRunning ? 'ON' : 'OFF'}`);
        dispatch(setDeviceRunningAction({ isRunning }));
    };
}

export function setPowerMode(isSmuMode: boolean) {
    return async (dispatch: TDispatch) => {
        if (!isSerialDevice(device)) return;
        logger.info(`Mode: ${isSmuMode ? 'Source meter' : 'Ampere meter'}`);
        if (isSmuMode) {
            await dispatch(setDeviceRunning(false));
            await device!.ppkSetPowerMode(true); // set to source mode
            dispatch(setPowerModeAction({ isSmuMode: true }));
        } else {
            await device!.ppkSetPowerMode(false); // set to ampere mode
            dispatch(setPowerModeAction({ isSmuMode: false }));
            await dispatch(setDeviceRunning(true));
        }
    };
}

export function updateResistors() {
    return async (_: TDispatch, getState: () => RootState) => {
        if (!isRTTDevice(device)) return;
        const { userResLo, userResMid, userResHi } =
            getState().app.resistorCalibration;
        logger.info(`Resistors set to ${userResLo}/${userResMid}/${userResHi}`);
        await device!.ppkUpdateResistors(userResLo, userResMid, userResHi);
    };
}

export function resetResistors() {
    return async (dispatch: TDispatch, getState: () => RootState) => {
        if (!isRTTDevice(device)) return;
        const { resLo, resMid, resHi } = getState().app.resistorCalibration;
        logger.info(`Resistors reset to ${resLo}/${resMid}/${resHi}`);
        await device!.ppkUpdateResistors(resLo, resMid, resHi);
        dispatch(resistorsResetAction({}));
    };
}

export function externalTriggerToggled(chbState: boolean) {
    return async (dispatch: TDispatch) => {
        if (!isRTTDevice(device)) return;
        if (chbState) {
            await device!.ppkTriggerStop();
            logger.info('Starting external trigger');
        } else {
            logger.info('Stopping external trigger');
        }
        await device!.ppkTriggerExtToggle();
        dispatch(externalTriggerToggledAction());
    };
}

export function spikeFilteringToggle() {
    return async (dispatch: TDispatch, getState: () => RootState) => {
        if (!isRTTDevice(device)) return;
        if (getState().app.switchingPoints.spikeFiltering === false) {
            await device!.ppkSpikeFilteringOn();
        } else {
            await device!.ppkSpikeFilteringOff();
        }
        dispatch(spikeFilteringToggleAction());
    };
}

export function switchingPointsUpSet() {
    return async (_: TDispatch, getState: () => RootState) => {
        if (!isRTTDevice(device)) return;
        const { switchUpSliderPosition } = getState().app.switchingPoints;
        const pot = Math.floor(
            13500.0 * ((10.98194 * switchUpSliderPosition) / 1000 / 0.41 - 1)
        );
        await device!.ppkSwitchPointUp(pot);
    };
}

export function switchingPointsDownSet() {
    return async (dispatch: TDispatch, getState: () => RootState) => {
        if (!isRTTDevice(device)) return;
        const { switchDownSliderPosition } = getState().app.switchingPoints;
        const pot =
            2000.0 * ((16.3 * (500 - switchDownSliderPosition)) / 100.0 - 1) -
            30000.0;
        await device!.ppkSwitchPointDown(Math.floor(pot / 2));
        dispatch(
            switchingPointsDownSetAction({
                sliderValue: switchDownSliderPosition,
            })
        );
    };
}

export function switchingPointsReset() {
    return async (dispatch: TDispatch) => {
        // Reset state of slider to initial values
        dispatch(switchingPointsResetAction({}));
        // Set these initial values in hardware
        await dispatch(switchingPointsUpSet());
        await dispatch(switchingPointsDownSet());
    };
}

export function updateTriggerLevel(triggerLevel: number) {
    return async (dispatch: TDispatch, getState: () => RootState) => {
        dispatch(triggerLevelSetAction({ triggerLevel }));
        if (!device!.capabilities.hwTrigger) return;

        const { triggerSingleWaiting, triggerRunning } = getState().app.trigger;

        if (triggerSingleWaiting) {
            logger.info(`Trigger level updated to ${triggerLevel} \u00B5A`);
            await device!.ppkTriggerSingleSet(triggerLevel);
        } else if (triggerRunning) {
            logger.info(`Trigger level updated to ${triggerLevel} \u00B5A`);
            await device!.ppkTriggerSet(triggerLevel);
        }
    };
}
