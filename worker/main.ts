/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { resolve } from 'path';
import { execPath, platform } from 'process';
import { SerialPort as SerialPortType } from 'serialport';

const asarPath = ((): string => {
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
            return '';
    }
})();

// eslint-disable-next-line import/no-dynamic-require
const { SerialPort } = require(resolve(asarPath, 'node_modules', 'serialport'));
let port: SerialPortType;

type ProcessMessage = {
    open: string;
    write: string;
};

const portOpenHandler = (msg: ProcessMessage) => {
    console.log('\x1b[2J'); // ansi clear screen
    console.log('Start child process retrieving data.');
    process.send && process.send({ opening: msg.open });
    port = new SerialPort({
        path: msg.open,
        autoOpen: false,
        baudRate: 115200,
    });

    let data = Buffer.alloc(0);
    port.on('data', buf => {
        data = Buffer.concat([data, buf]);
    });
    setInterval(() => {
        if (data.length === 0) return;
        process.send &&
            process.send(data.subarray(), (err: Error) => {
                if (err) console.log(err);
            });
        data = Buffer.alloc(0);
    }, 30);

    port.open(err => {
        if (err) {
            process.send && process.send({ error: err.toString() });
        }
        process.send && process.send({ started: msg.open });
    });
};

const portWriteHandler = (msg: ProcessMessage) => {
    port.write(msg.write, err => {
        if (err) {
            process.send && process.send({ error: 'PPK command failed' });
        }
    });
};

process.on('message', (msg: ProcessMessage) => {
    if (msg.open) portOpenHandler(msg);
    if (msg.write) portWriteHandler(msg);
});

process.on('disconnect', () => {
    console.log('Parent process disconnected, cleaning up');
    if (port) {
        port.close(() => {
            process.exit();
        });
    } else {
        process.exit();
    }
});
