/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    SidePanel,
    useHotKey,
} from '@nordicsemiconductor/pc-nrfconnect-shared';

import DeprecatedDeviceDialog from '../../features/DeprecatedDevice/DeprecatedDevice';
import MinimapOptions from '../../features/minimap/MinimapOptions';
import { options } from '../../globals';
import {
    advancedMode as advancedModeSelector,
    appState,
    deviceOpen as deviceOpenSelector,
    toggleAdvancedModeAction,
} from '../../slices/appSlice';
import { isDataLoggerPane, isRealTimePane } from '../../utils/panes';
import { BufferSettings } from './BufferSettings';
import { CapVoltageSettings } from './CapVoltageSettings';
import DisplayOptions from './DisplayOptions';
import Gains from './Gains';
import Instructions from './Instructions';
import { Load, Save } from './LoadSave';
import PowerMode from './PowerMode';
import SpikeFilter from './SpikeFilter';
import StartStop from './StartStop';
import Trigger from './Trigger/Trigger';

import './sidepanel.scss';

export default () => {
    const dispatch = useDispatch();

    useHotKey({
        hotKey: 'alt+ctrl+shift+a',
        title: 'Show advanced config',
        isGlobal: false,
        action: () => dispatch(toggleAdvancedModeAction()),
    });

    const advancedMode = useSelector(advancedModeSelector);
    const deviceOpen = useSelector(deviceOpenSelector);
    const { fileLoaded } = useSelector(appState);

    const realTimePane = useSelector(isRealTimePane);
    const dataLoggerPane = useSelector(isDataLoggerPane);

    if (fileLoaded) {
        return (
            <SidePanel className="side-panel tw-mt-9">
                <Load />
                <DisplayOptions />
                <Save />
                {dataLoggerPane && <MinimapOptions />}
                <DeprecatedDeviceDialog />
            </SidePanel>
        );
    }

    if (!deviceOpen) {
        return (
            <SidePanel className="side-panel tw-mt-9">
                <Load />
                {options.index !== 0 && <Save />}
                <Instructions />
                <DeprecatedDeviceDialog />
            </SidePanel>
        );
    }

    if (!realTimePane && !dataLoggerPane) {
        return <DeprecatedDeviceDialog />;
    }

    return (
        <SidePanel className="side-panel tw-mt-9">
            <PowerMode />
            {realTimePane && <Trigger />}
            {dataLoggerPane && <StartStop />}
            {dataLoggerPane && <MinimapOptions />}
            {options.timestamp === null || (
                <>
                    <DisplayOptions />
                    <Save />
                </>
            )}
            {deviceOpen && advancedMode && (
                <>
                    <Gains />
                    <SpikeFilter />
                    <BufferSettings />
                    <CapVoltageSettings />
                </>
            )}
            <DeprecatedDeviceDialog />
        </SidePanel>
    );
};
