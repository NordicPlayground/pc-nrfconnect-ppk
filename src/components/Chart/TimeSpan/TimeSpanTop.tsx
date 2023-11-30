/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import { appState } from '../../../slices/appSlice';
import { getWindowDuration } from '../../../slices/chartSlice';
import { triggerState } from '../../../slices/triggerSlice';
import { isRealTimePane as isRealTimePaneSelector } from '../../../utils/panes';
import TimeSpanLabel from './TimeSpanLabel';
import WindowOffsetSlider from './WindowOffsetSlider';

import './timespan.scss';

const TimeSpanTop = ({ width }: { width: number }) => {
    const [isZoomed, setIsZoomed] = useState(false);

    const windowDuration = useSelector(getWindowDuration);
    const { triggerWindowOffset, triggerLength } = useSelector(triggerState);
    const isRealTimePane = useSelector(isRealTimePaneSelector);

    const {
        capabilities: { prePostTriggering },
    } = useSelector(appState);

    useEffect(() => {
        setIsZoomed(triggerLength * 1000 > windowDuration);
    }, [windowDuration, triggerLength]);

    const showHandle = isRealTimePane && prePostTriggering && !isZoomed;
    const distanceFromOriginToTriggerHandle = showHandle
        ? Math.ceil(triggerWindowOffset + windowDuration / 2)
        : null;

    return (
        <div className="timespan window" style={{ width }}>
            {showHandle && distanceFromOriginToTriggerHandle != null ? (
                <>
                    <TimeSpanLabel
                        begin={0}
                        end={distanceFromOriginToTriggerHandle}
                        duration={distanceFromOriginToTriggerHandle}
                        totalDuration={windowDuration}
                    />
                    <WindowOffsetSlider duration={windowDuration} />
                    <TimeSpanLabel
                        begin={distanceFromOriginToTriggerHandle}
                        end={windowDuration}
                        duration={
                            windowDuration - distanceFromOriginToTriggerHandle
                        }
                        totalDuration={windowDuration}
                    />
                </>
            ) : (
                <TimeSpanLabel duration={windowDuration} />
            )}
        </div>
    );
};

export default TimeSpanTop;
