/*
 * Copyright (c) 2022 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';

import { setLatestDataTimestamp } from '../../slices/chartSlice';
import { fireEvent, render, screen } from '../../utils/testUtils';
import SidePanel from '../SidePanel/SidePanel';

jest.mock('../../utils/persistentStore', () => ({
    getLastSaveDir: () => 'mocked/save/dir',
    getMaxBufferSize: () => 200,
    getVoltageRegulatorMaxCapPPK1: () => 3600,
    getVoltageRegulatorMaxCapPPK2: () => 5000,
    getDigitalChannels: () => [
        true,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
    ],
    getDigitalChannelsVisible: () => true,
    getTimestampsVisible: () => false,
    getSpikeFilter: () => ({ samples: 3, alpha: 0.18, alpha5: 0.06 }),
    getSamplingMode: () => 'Live',
    getTriggerLevel: () => 1000,
    getRecordingLength: () => 1000,
    getAutoExport: () => false,
    getTriggerType: () => 'Single',
    getTriggerEdge: () => 'Raising Edge',
    getPreferredSessionLocation: () => '/tmp',
    getDiskFullTrigger: () => 4096,
}));

const getTimestampMock = jest.fn(() => 100);

jest.mock('../../utils/panes', () => ({
    isDataLoggerPane: jest.fn(() => true),
    isScopePane: jest.fn(() => false),
}));

jest.mock('../../globals', () => {
    const temp = jest.requireActual('../../globals');
    return {
        ...temp,
        DataManager: () => ({
            ...temp,
            getTimestamp: getTimestampMock,
            getStartSystemTime: () => 0,
        }),
    };
});

jest.mock('os', () => ({
    tmpdir: () => '/tmp',
    release: () => '',
    type: () => 'win',
}));

describe('SidePanel', () => {
    it('should have Load present at startup', () => {
        render(<SidePanel />);
        expect(screen.getByText('Load')).toBeDefined();
    });

    it('successfully opens SaveChoiceDialog when clicking Save / Export button', () => {
        render(<SidePanel />, [setLatestDataTimestamp(1000)]);

        const saveButton = screen.getByText('Save / Export');
        fireEvent.click(saveButton);

        expect(screen.getByText('What would you like to save?')).toBeDefined();
    });
});
