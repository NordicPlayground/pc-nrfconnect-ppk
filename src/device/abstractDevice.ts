/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: only temporary whilst refactoring from javascript */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- TODO: only temporary whilst refactoring from javascript */

import EventEmitter from 'events';

import PPKCmd from '../constants';
import { deviceTraits, SampleValues } from './types';

const getAllPropertyNames = (obj: any): any => {
    const proto = Object.getPrototypeOf(obj);
    const inherited = proto ? getAllPropertyNames(proto) : [];
    return [...new Set(Object.getOwnPropertyNames(obj).concat(inherited))];
};

export function convertFloatToByteBuffer(floatnum: number): Uint8Array {
    const float = new Float32Array(1);
    float[0] = floatnum;
    const bytes = new Uint8Array(float.buffer);
    return bytes;
}

export interface Capabilities {
    digitalChannels?: boolean;
    ppkAverageStart?: boolean;
    ppkAverageStop?: boolean;
    ppkDeviceRunning?: boolean;
    ppkSetPowerMode?: boolean;
    ppkSetSpikeFilter?: boolean;
    ppkSetUserGains?: boolean;
    ppkTriggerSet?: boolean;
    ppkTriggerSingleSet?: boolean;
    ppkTriggerStop?: boolean;
    ppkUpdateRegulator?: boolean;
    prePostTriggering?: boolean;
    samplingTimeUs?: number;
    maxContinuousSamplingTimeUs?: number;
}

// Device is implemented by rttDevice and serialDevice
// This abstract class should reflect all that is common between the two specific implementations
export default abstract class Device extends EventEmitter {
    currentVdd = 0;
    triggerWindowRange = { min: 1, max: 10 };
    capabilities: Capabilities;
    public traits!: deviceTraits;
    public adcSamplingTimeUs!: number;

    constructor(onSampleCallback: (values: SampleValues) => unknown) {
        super();
        this.capabilities = {};
        getAllPropertyNames(this)
            .filter((k: any) => k.startsWith('ppk'))
            .forEach((k: any) =>
                Object.assign(this.capabilities, { [k]: true })
            );
        this.onSampleCallback = onSampleCallback;
    }

    // Method initiated in the constructor
    onSampleCallback;

    // TODO: Is this function ever initialized on any device instance?
    // Looks like the function does not reside on the instance, but rather outside it.
    // Hence, I question if this should be removed from the class entirely.

    // abstract open(): void;

    abstract sendCommand(...args: PPKCmd[]): Promise<unknown> | undefined;

    abstract sendCommandDescription(type: string | number, value: number): any;

    abstract stop(): void;

    abstract start(): Promise<unknown>;

    abstract parseMeta(meta: any): any;

    // Capability methods

    ppkAverageStart(): Promise<unknown> {
        return this.sendCommand([PPKCmd.AverageStart])!;
    }

    ppkAverageStop(): Promise<unknown> {
        return this.sendCommand([PPKCmd.AverageStop])!;
    }

    ppkDeviceRunning(...args: PPKCmd): Promise<unknown> {
        return this.sendCommand([PPKCmd.DeviceRunningSet, ...args])!;
    }

    ppkUpdateRegulator(vdd: number): Promise<unknown> {
        this.currentVdd = vdd;
        this.sendCommandDescription(PPKCmd.RegulatorSet, this.currentVdd);
        // eslint-disable-next-line no-bitwise
        return this.sendCommand([PPKCmd.RegulatorSet, vdd >> 8, vdd & 0xff])!;
    }
}
