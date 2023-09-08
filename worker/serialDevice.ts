/* eslint-disable no-bitwise */
/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

const { resolve } = require('path');
// const Database = require('better-sqlite3');
import Database from 'better-sqlite3';

const { execPath, platform } = process;

const asarPath = (() => {
    switch (true) {
        case /node_modules/.test(execPath):
            return resolve(execPath.split('node_modules')[0]);
        case platform === 'win32':
            return resolve(execPath, '..', 'resources', 'app.asar');
        case platform === 'darwin':
            return resolve(
                execPath.split('/Frameworks/')[0],
                'Resources',
                'app.asar'
            );
        case platform === 'linux':
            return resolve(
                execPath.split('/').slice(0, -1).join('/'),
                'resources',
                'app.asar'
            );
        default:
            return null;
    }
})();

// eslint-disable-next-line import/no-dynamic-require
const { SerialPort } = require(resolve(asarPath, 'node_modules', 'serialport'));
const generateMask = (bits, pos) => ({
    pos,
    // eslint-disable-next-line no-bitwise
    mask: (2 ** bits - 1) << pos,
});
const MEAS_ADC = generateMask(14, 0);
const MEAS_RANGE = generateMask(3, 14);
const MEAS_COUNTER = generateMask(6, 18);
const MEAS_LOGIC = generateMask(8, 24);

const MAX_PAYLOAD_COUNTER = 0b111111; // 0x3f, 64 - 1

let port = null;
let currentVdd = 3000; // Sync with voltageRegulatorSlice.ts
let rollingAvg;
let rollingAvg4;
let prevRange;
let consecutiveRangeSample = 0;
let afterSpike = 0;
let spikeFilter;

process.on('message', msg => {
    if (msg.open) {
        console.log('\x1b[2J'); // ansi clear screen
        process.send({ opening: msg.open });
        port = new SerialPort({
            path: msg.open,
            autoOpen: false,
            baudRate: 115200,
        });

        let data = Buffer.alloc(0);
        let metadata = '';
        port.on('data', buf => {
            data = Buffer.concat([data, buf]);
        });
        const dataSendInterval = setInterval(() => {
            if (data.length === 0) return;
            metadata = `${metadata}${data}`;
            if (metadata.includes('END')) {
                clearInterval(dataSendInterval);
                metadata = undefined;
                return;
            }
            process.send(data.slice(), err => {
                if (err) console.log(err);
            });
            data = Buffer.alloc(0);
        }, 30);
        if (!metadata) {
            setInterval(() => {
                parseMeasurementData(data);
            }, 30);
        }

        port.open(err => {
            if (err) {
                process.send({ error: err.toString() });
            }
            process.send({ started: msg.open });
        });
    }
    if (msg.commandType) {
        if (msg.commandType === 0x0d) {
            // RegulatorSet
            currentVdd = msg.value || currentVdd;
        }
        if (msg.commandType === 0x06) {
            // AverageStart
            rollingAvg = undefined;
            rollingAvg4 = undefined;
            prevRange = undefined;
            consecutiveRangeSample = 0;
            afterSpike = 0;
        }
        if (msg.commandType === 'SET_SPIKE_FILTER') {
            // AverageStart
            spikeFilter = msg.value;
        }
    }
    if (msg.write) {
        port.write(msg.write, err => {
            if (err) {
                process.send({ error: 'PPK command failed' });
            }
        });
    }
});

process.on('disconnect', () => {
    console.log('parent process disconnected, cleaning up');
    if (port) {
        port.close(process.exit);
    } else {
        process.exit();
    }
});

const modifiers = {
    r: [1031.64, 101.65, 10.15, 0.94, 0.043],
    gs: [1, 1, 1, 1, 1],
    gi: [1, 1, 1, 1, 1],
    o: [0, 0, 0, 0, 0],
    s: [0, 0, 0, 0, 0],
    i: [0, 0, 0, 0, 0],
    ug: [1, 1, 1, 1, 1],
};

let remainder = Buffer.alloc(0);
const parseMeasurementData = buf => {
    const sampleSize = 4;
    let ofs = remainder.length;
    const first = Buffer.concat(
        [remainder, buf.subarray(0, sampleSize - ofs)],
        sampleSize
    );
    ofs = sampleSize - ofs;
    handleRawDataSet(first.readUIntLE(0, sampleSize));
    for (; ofs <= buf.length - sampleSize; ofs += sampleSize) {
        handleRawDataSet(buf.readUIntLE(ofs, sampleSize));
    }
    remainder = buf.subarray(ofs);
};

const adcMult = 1.8 / 163840;
const getAdcResult = (range, adcVal) => {
    const resultWithoutGain =
        (adcVal - modifiers.o[range]) * (adcMult / modifiers.r[range]);
    let adc =
        modifiers.ug[range] *
        (resultWithoutGain *
            (modifiers.gs[range] * resultWithoutGain + modifiers.gi[range]) +
            (modifiers.s[range] * (currentVdd / 1000) + modifiers.i[range]));

    const prevRollingAvg4 = rollingAvg4;
    const prevRollingAvg = rollingAvg;

    rollingAvg =
        rollingAvg === undefined
            ? adc
            : spikeFilter.alpha * adc + (1.0 - spikeFilter.alpha) * rollingAvg;
    rollingAvg4 =
        rollingAvg4 === undefined
            ? adc
            : spikeFilter.alpha5 * adc +
              (1.0 - spikeFilter.alpha5) * rollingAvg4;

    if (prevRange === undefined) {
        prevRange = range;
    }

    if (prevRange !== range || afterSpike > 0) {
        if (prevRange !== range) {
            // number of measurements after the spike which still to be averaged
            consecutiveRangeSample = 0;
            afterSpike = spikeFilter.samples;
        } else {
            consecutiveRangeSample += 1;
        }
        // Use previous rolling average if within first two samples of range 4
        if (range === 4) {
            if (consecutiveRangeSample < 2) {
                rollingAvg4 = prevRollingAvg4;
                rollingAvg = prevRollingAvg;
            }
            adc = rollingAvg4;
        } else {
            adc = rollingAvg;
        }
        // adc = range === 4 ? rollingAvg4 : rollingAvg;
        afterSpike -= 1;
    }
    prevRange = range;

    return adc;
};

const isDevelopment = true;
const zeroCap = isDevelopment ? n => n : n => Math.max(0, n);

const convertBits16 = b8 =>
    (((b8 & 128) + 128) << 7) |
    (((b8 & 64) + 64) << 6) |
    (((b8 & 32) + 32) << 5) |
    (((b8 & 16) + 16) << 4) |
    (((b8 & 8) + 8) << 3) |
    (((b8 & 4) + 4) << 2) |
    (((b8 & 2) + 2) << 1) |
    ((b8 & 1) + 1);

const db = new Database('/tmp/ppk-test.db', { verbose: console.log });
// const db = new Database('/tmp/ppk-test.db');
//  Though not required, it is generally important to set the WAL pragma for performance reasons.
db.pragma('journal_mode = WAL');
db.prepare('DROP TABLE IF EXISTS ppk').run();
db.prepare(
    'CREATE TABLE ppk (id INTEGER, value REAL, bits INTEGER, timestamp INTEGER, type TEXT)'
).run();
const stmt = db.prepare(
    'INSERT INTO ppk (id, value, bits, timestamp, type) VALUES (?, ?, ?, ?, ?)'
);
let timestamp;
let index;
const onSampleCallback = ({ value, bits, endOfTrigger }) => {
    if (timestamp == null) {
        timestamp = 0;
    }
    if (index == null) {
        index = 0;
    }

    const zeroCappedValue = zeroCap(value);
    const b16 = convertBits16(bits);
    stmt.run(
        index,
        zeroCappedValue,
        // b16 | prevBits,
        b16,
        timestamp + 10,
        'raw'
    );
    timestamp += 10;
    index += 1;

    // if (samplingRunning && sampleFreq < maxSampleFreq) {
    //     const samplesPerAverage = maxSampleFreq / sampleFreq;
    //     nbSamples += 1;
    //     nbSamplesTotal += 1;
    //     const f = Math.min(nbSamplesTotal, samplesPerAverage);
    //     if (Number.isFinite(value) && Number.isFinite(prevValue)) {
    //         zeroCappedValue =
    //             prevValue + (zeroCappedValue - prevValue) / f;
    //     }
    //     if (nbSamples < samplesPerAverage) {
    //         if (value !== undefined) {
    //             prevValue = zeroCappedValue;
    //             prevBits |= b16;
    //         }
    //         return;
    //     }
    //     nbSamples = 0;
    // }
};

let expectedCounter;
let corruptedSamples;
const handleRawDataSet = adcValue => {
    try {
        const currentMeasurementRange = Math.min(
            getMaskedValue(adcValue, MEAS_RANGE),
            modifiers.r.length
        );
        const counter = getMaskedValue(adcValue, MEAS_COUNTER);
        const adcResult = getMaskedValue(adcValue, MEAS_ADC) * 4;
        const bits = getMaskedValue(adcValue, MEAS_LOGIC);
        const value = getAdcResult(currentMeasurementRange, adcResult) * 1e6;

        if (expectedCounter === null) {
            expectedCounter = counter;
        } else if (corruptedSamples.length > 0 && counter === expectedCounter) {
            while (corruptedSamples.length > 0) {
                onSampleCallback(corruptedSamples.shift());
            }
            corruptedSamples = [];
        } else if (corruptedSamples.length > 4) {
            const missingSamples =
                // eslint-disable-next-line no-bitwise
                (counter - expectedCounter + MAX_PAYLOAD_COUNTER) &
                MAX_PAYLOAD_COUNTER;
            // dataLossReport(missingSamples);
            for (let i = 0; i < missingSamples; i += 1) {
                onSampleCallback({});
            }
            expectedCounter = counter;
            corruptedSamples = [];
        } else if (expectedCounter !== counter) {
            corruptedSamples.push({ value, bits });
        }

        expectedCounter += 1;
        // eslint-disable-next-line no-bitwise
        expectedCounter &= MAX_PAYLOAD_COUNTER;
        // Only fire the event, if the buffer data is valid
        onSampleCallback({ value, bits });
    } catch (err) {
        // TODO: This does not consistently handle all possibilites
        // Even though we expect all err to be instance of Error we should
        // probably also include an else and potentially log it to ensure all
        // branches are considered.
        if (err instanceof Error) {
            console.log(err.message, 'original value', adcValue);
        }
        // to keep timestamp consistent, undefined must be emitted
        onSampleCallback({});
    }
};

// eslint-disable-next-line no-bitwise
const getMaskedValue = (value, { mask, pos }) => (value & mask) >> pos;
