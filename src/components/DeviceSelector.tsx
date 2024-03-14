/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import { useDispatch } from 'react-redux';
import {
    DeviceSelector,
    DeviceSetupConfig,
    getAppFile,
    logger,
    sdfuDeviceSetup,
} from '@nordicsemiconductor/pc-nrfconnect-shared';

import { close, open } from '../actions/deviceActions';
import { setShowPPK1Dialog } from '../features/DeprecatedDevice/DeprecatedDeviceSlice';

const deviceListing = {
    nordicUsb: true,
    nordicDfu: true,
    serialPorts: true,
    jlink: true,
};

export const deviceSetupConfig: DeviceSetupConfig = {
    deviceSetups: [
        sdfuDeviceSetup(
            [
                {
                    key: 'ppk2',
                    application: getAppFile(
                        'firmware/pca63100_ppk2_1.2.0-beta1_3aa843e.hex'
                    ),
                    semver: 'power_profiler_kit_2 1.2.0-beta1-3aa843e',
                    params: {},
                },
            ],
            false
        ),
    ],
};

export default () => {
    const dispatch = useDispatch();

    return (
        <DeviceSelector
            deviceSetupConfig={deviceSetupConfig}
            deviceListing={deviceListing}
            onDeviceConnected={device =>
                logger.info(`Device Connected SN:${device.serialNumber}`)
            }
            onDeviceDisconnected={device =>
                logger.info(`Device Disconnected SN:${device.serialNumber}`)
            }
            onDeviceSelected={device => {
                if (device.traits.jlink) {
                    dispatch(setShowPPK1Dialog(true));
                }
                logger.info(
                    `Validating firmware for device with s/n ${device.serialNumber}`
                );
            }}
            onDeviceIsReady={device => {
                logger.info(`Opening device with s/n ${device.serialNumber}`);
                dispatch(open(device));
            }}
            onDeviceDeselected={() => {
                logger.info('Deselecting device');
                dispatch(close());
            }}
        />
    );
};
