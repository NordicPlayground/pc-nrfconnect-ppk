/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

import { DataManager } from '../../globals';
import type { RootState } from '../../slices/index';
import type { TAction } from '../../slices/thunk';
import { isDataLoggerPane } from '../../utils/panes';

interface MinimapState {
    showMinimap: boolean;
    xAxisMaxTime: number;
}

const initialState: MinimapState = {
    showMinimap: false,
    xAxisMaxTime: 0,
};

const minimapSlice = createSlice({
    name: 'minimap',
    initialState,
    reducers: {
        setShowMinimap: (state, { payload: show }: PayloadAction<boolean>) => {
            state.showMinimap = show;
        },
        miniMapAnimationAction: state => {
            state.xAxisMaxTime = DataManager().getTimestamp();
        },
        resetMinMap: state => {
            state.xAxisMaxTime = 0;
        },
    },
});

export const setShowMinimapAction =
    (showMinimap: boolean): TAction =>
    (dispatch, getState) => {
        const isInDataLoggerPane = isDataLoggerPane(getState());

        if (!isInDataLoggerPane) {
            dispatch(setShowMinimap(false));
            return;
        }

        dispatch(setShowMinimap(showMinimap));
    };

export const showMinimap = (state: RootState) => state.app.minimap.showMinimap;
export const getXAxisMaxTime = (state: RootState) =>
    state.app.minimap.xAxisMaxTime;
export const { setShowMinimap, miniMapAnimationAction, resetMinMap } =
    minimapSlice.actions;
export default minimapSlice.reducer;
