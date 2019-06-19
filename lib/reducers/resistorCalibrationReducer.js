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

import { PPK_METADATA, RESISTORS_RESET } from '../actions/PPKActions';
import { USER_RESISTOR_UPDATED } from '../actions/uiActions';

const initialState = {
    resLo: 509.0,
    resMid: 28.0,
    resHi: 1.8,
    userResLo: 509.0,
    userResMid: 28.0,
    userResHi: 1.8,
};

export default function resistorCalibration(state = initialState, action) {
    switch (action.type) {
        case USER_RESISTOR_UPDATED: {
            const newUserResHi = parseFloat(action.userResHi);
            const newUserResMid = parseFloat(action.userResMid);
            const newUserResLo = parseFloat(action.userResLo);
            return {
                ...state,
                userResHi: Number.isNaN(newUserResHi) ? state.userResHi : newUserResHi,
                userResMid: Number.isNaN(newUserResMid) ? state.userResMid : newUserResMid,
                userResLo: Number.isNaN(newUserResLo) ? state.userResLo : newUserResLo,
            };
        }
        case PPK_METADATA: {
            let {
                userResHi,
                userResMid,
                userResLo,
            } = action.metadata;
            const {
                resHi,
                resMid,
                resLo,
            } = action.metadata;

            if (userResHi === undefined) {
                userResHi = state.resHi;
            }
            if (userResMid === undefined) {
                userResMid = state.resMid;
            }
            if (userResLo === undefined) {
                userResLo = state.resLo;
            }
            return {
                ...state,
                userResHi,
                userResMid,
                userResLo,
                resHi,
                resMid,
                resLo,
            };
        }
        case RESISTORS_RESET: {
            const {
                resHi,
                resMid,
                resLo,
            } = state;
            return {
                ...state,
                userResHi: resHi,
                userResMid: resMid,
                userResLo: resLo,
            };
        }
        default:
    }
    return state;
}
