/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

import {
    getRecordingLength as getPersistedRecordingLength,
    getTriggerEdge as getPersistedTriggerEdge,
    getTriggerLevel as getPersistedTriggerLevel,
    getTriggerType as getPersistedTriggerType,
    setRecordingLength as persistRecordingLength,
    setTriggerEdge as persistTriggerEdge,
    setTriggerLevel as persistTriggerLevel,
    setTriggerType as persistTriggerType,
} from '../utils/persistentStore';
import type { RootState } from '.';

export const TriggerTypeValues = ['Single', 'Continuous'] as const;
export type TriggerType = (typeof TriggerTypeValues)[number];
export const TriggerEdgeValues = ['Raising Edge', 'Lowering Edge'] as const;
export type TriggerEdge = (typeof TriggerEdgeValues)[number];

export interface DataLoggerState {
    level: number;
    recordingLength: number;
    active: boolean;
    type: TriggerType;
    edge: TriggerEdge;
    progressMessage?: string;
    progress?: number;
    triggerOrigin?: number;
}

const initialState = (): DataLoggerState => ({
    level: getPersistedTriggerLevel(1000),
    recordingLength: getPersistedRecordingLength(1000),
    active: false,
    type: getPersistedTriggerType('Single'),
    edge: getPersistedTriggerEdge('Raising Edge'),
});

const triggerSlice = createSlice({
    name: 'trigger',
    initialState: initialState(),
    reducers: {
        setTriggerLevel: (state, action: PayloadAction<number>) => {
            state.level = action.payload;
            state.active = false;
            persistTriggerLevel(action.payload);
        },
        setTriggerRecordingLength: (state, action: PayloadAction<number>) => {
            state.recordingLength = action.payload;
            persistRecordingLength(action.payload);
        },
        setTriggerActive: (state, action: PayloadAction<boolean>) => {
            state.active = action.payload;
        },
        setTriggerType: (state, action: PayloadAction<TriggerType>) => {
            state.type = action.payload;
            persistTriggerType(action.payload);
        },
        setTriggerEdge: (state, action: PayloadAction<TriggerEdge>) => {
            state.edge = action.payload;
            persistTriggerEdge(action.payload);
        },
        setProgress: (
            state,
            action: PayloadAction<{
                progressMessage: string;
                progress?: number;
            }>
        ) => {
            state.progress = action.payload.progress;
            state.progressMessage = action.payload.progressMessage;
        },
        clearProgress: state => {
            state.progress = undefined;
            state.progressMessage = undefined;
        },
        setTriggerOrigin: (state, action: PayloadAction<number>) => {
            state.triggerOrigin = action.payload;
        },
        resetTriggerOrigin: state => {
            state.triggerOrigin = undefined;
        },
    },
});
export const getTriggerValue = (state: RootState) => state.app.trigger.level;
export const getTriggerRecordingLength = (state: RootState) =>
    state.app.trigger.recordingLength;
export const getTriggerActive = (state: RootState) => state.app.trigger.active;
export const getTriggerType = (state: RootState) => state.app.trigger.type;
export const getTriggerEdge = (state: RootState) => state.app.trigger.edge;
export const getProgress = (state: RootState) => ({
    progressMessage: state.app.trigger.progressMessage,
    progress: state.app.trigger.progress,
});
export const getTriggerOrigin = (state: RootState) =>
    state.app.trigger.triggerOrigin;

export const {
    setTriggerLevel,
    setTriggerRecordingLength,
    setTriggerActive,
    setTriggerType,
    setTriggerEdge,
    setProgress,
    clearProgress,
    setTriggerOrigin,
    resetTriggerOrigin,
} = triggerSlice.actions;

export default triggerSlice.reducer;
