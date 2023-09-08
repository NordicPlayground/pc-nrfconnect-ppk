/* eslint-disable no-bitwise */
/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

// const { resolve } = require('path');
// const Database = require('better-sqlite3');

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { SerialPort as SerialPortType } from 'serialport';

const { execPath, platform } = process;

const asarPath: string = (() => {
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
            return '.';
    }
})();

// eslint-disable-next-line import/no-dynamic-require
const { SerialPort } = require(resolve(asarPath, 'node_modules', 'serialport'));

let port: SerialPortType;
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
