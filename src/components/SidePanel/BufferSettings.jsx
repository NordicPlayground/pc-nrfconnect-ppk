/*
 * Copyright (c) 2021 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import Form from 'react-bootstrap/Form';
import { useDispatch, useSelector } from 'react-redux';
import {
    CollapsibleGroup,
    NumberInlineInput,
    usageData,
} from 'pc-nrfconnect-shared';

import {
    changeMaxBufferSizeAction,
    maxBufferSize as maxBufferSizeSelector,
} from '../../reducers/dataLoggerReducer';
import EventAction from '../../usageDataActions';

export const BufferSettings = () => {
    const maxBufferSize = useSelector(maxBufferSizeSelector);
    const dispatch = useDispatch();
    const range = { min: 1, max: Infinity };

    return (
        <CollapsibleGroup
            heading="Sampling Buffer"
            title="Adjust max buffer size for sampling"
        >
            <Form.Label
                htmlFor="slider-ram-size"
                title="Increase to sample for longer, decrease to solve performance issues"
            >
                <span className="flex-fill">Max size of buffer</span>
                <NumberInlineInput
                    value={maxBufferSize}
                    range={range}
                    onChange={newValue => {
                        dispatch(changeMaxBufferSizeAction(newValue));
                        usageData.sendUsageData(
                            EventAction.BUFFER_SIZE_CHANGED,
                            newValue
                        );
                    }}
                />
                <span> MB</span>
            </Form.Label>
        </CollapsibleGroup>
    );
};
