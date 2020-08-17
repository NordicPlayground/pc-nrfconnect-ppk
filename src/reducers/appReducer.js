/* Copyright (c) 2015 - 2018, Nordic Semiconductor ASA
 *
 * All rights reserved.
 *
 * Use in source and binary forms, redistribution in binary form only, with
 * or without modification, are permitted provided that the following conditions
 * are met:
 *
 * 1. Redistributions in binary form, except as embedded into a Nordic
 *    Semiconductor ASA integrated circuit in a product or a software update for
 *    such product, must reproduce the above copyright notice, this list of
 *    conditions and the following disclaimer in the documentation and/or other
 *    materials provided with the distribution.
 *
 * 2. Neither the name of Nordic Semiconductor ASA nor the names of its
 *    contributors may be used to endorse or promote products derived from this
 *    software without specific prior written permission.
 *
 * 3. This software, with or without modification, must only be used with a Nordic
 *    Semiconductor ASA integrated circuit.
 *
 * 4. Any software provided in binary form under this license must not be reverse
 *    engineered, decompiled, modified and/or disassembled.
 *
 * THIS SOFTWARE IS PROVIDED BY NORDIC SEMICONDUCTOR ASA "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY, NONINFRINGEMENT, AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL NORDIC SEMICONDUCTOR ASA OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
 * TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

const initialState = {
    portName: null,
    metadata: [],
    isSmuMode: false,
    deviceRunning: true,
    rttRunning: false,
    advancedMode: false,
    capabilities: {},
    samplingRunning: false,
    isExportCSVDialogVisible: false,
};

const DEVICE_CLOSED = 'DEVICE_CLOSED';
const DEVICE_OPENED = 'DEVICE_OPENED';
const DEVICE_UNDER_TEST_TOGGLE = 'DEVICE_UNDER_TEST_TOGGLE';
const RTT_CALLED_START = 'RTT_CALLED_START';
const SAMPLING_STARTED = 'SAMPLING_STARTED';
const SAMPLING_STOPPED = 'SAMPLING_STOPPED';
const SET_POWER_MODE = 'SET_POWER_MODE';
const TOGGLE_ADVANCED_MODE = 'TOGGLE_ADVANCED_MODE';
const TOGGLE_EXPORT_DIALOG = 'TOGGLE_EXPORT_DIALOG';

export const toggleAdvancedModeAction = () => ({
    type: TOGGLE_ADVANCED_MODE,
});

export const samplingStartAction = () => ({
    type: SAMPLING_STARTED,
});

export const samplingStoppedAction = () => ({
    type: SAMPLING_STOPPED,
});

export const deviceOpenedAction = (portName, capabilities) => ({
    type: DEVICE_OPENED,
    portName,
    capabilities,
});

export const deviceClosedAction = () => ({
    type: DEVICE_CLOSED,
});

export const toggleDUTAction = () => ({
    type: DEVICE_UNDER_TEST_TOGGLE,
});

export const setPowerModeAction = isSmuMode => ({
    type: SET_POWER_MODE,
    isSmuMode,
});

export const rttStartAction = () => ({
    type: RTT_CALLED_START,
});

export const toggleExportCSVDialogVisible = () => ({
    type: TOGGLE_EXPORT_DIALOG,
});

export default (state = initialState, { type, ...action }) => {
    switch (type) {
        case DEVICE_OPENED: {
            const { portName, capabilities } = action;
            return {
                ...state,
                portName,
                capabilities: { ...capabilities },
            };
        }
        case DEVICE_CLOSED: {
            return initialState;
        }
        case 'DEVICES_DETECTED': {
            // hack to filter out usb devices which are not PPK2
            // TODO: maybe check if PPK2 in bootloader mode needs to be included
            action.devices.splice(0, action.devices.length,
                ...action.devices.filter(d => (
                    d.jlink
                    || (d.usb || {}).product === 'PPK2'
                    || (d.serialport.vendorId === '1915' && d.serialport.productId === '521f')
                )));
            return state;
        }
        case DEVICE_UNDER_TEST_TOGGLE: {
            const { deviceRunning } = state;
            return {
                ...state,
                deviceRunning: !deviceRunning,
            };
        }
        case SET_POWER_MODE: {
            return {
                ...state,
                isSmuMode: action.isSmuMode,
            };
        }

        case RTT_CALLED_START: {
            return {
                ...state,
                rttRunning: true,
            };
        }

        case TOGGLE_ADVANCED_MODE: {
            return {
                ...state,
                advancedMode: !state.advancedMode,
            };
        }
        case TOGGLE_EXPORT_DIALOG: {
            return {
                ...state,
                isExportCSVDialogVisible: !state.isExportCSVDialogVisible,
            };
        }
        case SAMPLING_STARTED: {
            return {
                ...state,
                samplingRunning: true,
            };
        }
        case SAMPLING_STOPPED: {
            return {
                ...state,
                samplingRunning: false,
            };
        }

        default:
    }
    return state;
};

export const appState = ({ app }) => app.app;
