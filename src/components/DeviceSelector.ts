/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { connect } from 'react-redux';
import {
    Device,
    DeviceSelector,
    DeviceSelectorProps,
    DeviceSetupConfig,
    getAppFile,
    logger,
    sdfuDeviceSetup,
} from '@nordicsemiconductor/pc-nrfconnect-shared';

import { close, open } from '../actions/deviceActions';
import { closeDB } from '../features/dbConnection';
import { setShowPPK1Dialog } from '../features/DeprecatedDevice/DeprecatedDeviceSlice';
import { TDispatch } from '../slices/thunk';

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
                        'firmware/pca63100_ppk2_7453297.hex'
                    ),
                    semver: 'power_profiler_kit_2 1.0.1-7453297',
                    params: {},
                },
            ],
            false
        ),
    ],
};

const mapState = () => ({
    deviceListing,
    deviceSetupConfig,
});

const mapDispatch = (dispatch: TDispatch): Partial<DeviceSelectorProps> => ({
    onDeviceSelected: (device: Device) => {
        if (device.jlink) {
            dispatch(setShowPPK1Dialog(true));
        }
        logger.info(
            `Validating firmware for device with s/n ${device.serialNumber}`
        );
    },
    onDeviceDeselected: () => {
        logger.info('Deselecting device');
        dispatch(close());
        closeDB();
    },
    onDeviceIsReady: device => {
        logger.info(`Opening device with s/n ${device.serialNumber}`);
        dispatch(open(device));
    },
});

export default connect(mapState, mapDispatch)(DeviceSelector);
