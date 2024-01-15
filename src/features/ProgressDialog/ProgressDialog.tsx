/*
 * Copyright (c) 2023 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    DialogButton,
    GenericDialog,
    useStopwatch,
} from '@nordicsemiconductor/pc-nrfconnect-shared';

import { closeProgressDialog, getProgressDialogInfo } from './progressSlice';
import TimeComponent from './TimeComponent';

export default () => {
    const dispatch = useDispatch();
    const dialogInfo = useSelector(getProgressDialogInfo);
    const lastMsg = useRef('');

    const { time, reset, pause, start } = useStopwatch({
        autoStart: true,
        resolution: 1000,
    });

    useEffect(() => {
        if (!dialogInfo.show) {
            pause();
        } else {
            start(0);
        }
    }, [dialogInfo.show, pause, start]);

    useEffect(() => {
        if (dialogInfo.message !== lastMsg.current) {
            lastMsg.current = dialogInfo.message;
            reset();
        }
    }, [dialogInfo.message, pause, reset]);

    return (
        <GenericDialog
            title={dialogInfo.title}
            footer={
                <DialogButton
                    onClick={() => dispatch(closeProgressDialog())}
                    disabled={!dialogInfo.complete}
                >
                    Close
                </DialogButton>
            }
            isVisible={dialogInfo.show}
        >
            <div className="tw-flex tw-w-full tw-flex-col tw-gap-2">
                <div>
                    <span>{dialogInfo.message}</span>
                    <br />
                </div>
                <TimeComponent
                    time={time}
                    progress={
                        dialogInfo.progress < 0 ? 100 : dialogInfo.progress
                    }
                />
            </div>
        </GenericDialog>
    );
};