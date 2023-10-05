/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import {
    getAppDataDir,
    logger,
} from '@nordicsemiconductor/pc-nrfconnect-shared';
import BetterSqlite3, { Database } from 'better-sqlite3';
import path from 'path';
import { v4 as uuid } from 'uuid';

const BUFFER_ELEMENT_COUNT = 100352;
let db: Database | null = null;
const dataSessionBuffer = new Map<string, DataEntry[]>();

const PREFIX = 'PPK_';

type DataEntry = {
    timestamp: number;
    value: number;
    bits: number;
};

export const OpenDB = () => {
    if (db) {
        return;
    }

    db = new BetterSqlite3(path.join(getAppDataDir(), `ppk.db`));

    // Though not required, it is generally important to set the WAL pragma for performance reasons.
    db.pragma('journal_mode = OFF');
    db.pragma('journal_size_limit = 6144000');
    // db.pragma('journal_mode = OFF');
    db.pragma('synchronous = OFF');

    // db.pragma('locking_mode = EXCLUSIVE');
};

export const CreateDBSessionTable = (): string => {
    if (!db) {
        OpenDB();
        return CreateDBSessionTable();
    }

    const session = uuid().replaceAll('-', '');

    logger.info(`Creating PPK DB for session ${session}`);
    db.prepare(`DROP TABLE IF EXISTS ${PREFIX}${session}`).run();
    db.prepare(
        `CREATE TABLE ${PREFIX}${session} (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER, value REAL, bits INTEGER)`
    ).run();

    return session;
};

export const InsertToDBBuffer = (session: string, data: DataEntry) => {
    const arrayBuffer = dataSessionBuffer.get(session) ?? [];
    arrayBuffer.push(data);
    dataSessionBuffer.set(session, arrayBuffer);

    if (arrayBuffer.length === BUFFER_ELEMENT_COUNT) {
        bulkInsertDB(session);
    }
};

const bulkInsertDB = (session: string) => {
    if (!db) {
        OpenDB();
        bulkInsertDB(session);
        return;
    }

    const array = dataSessionBuffer.get(session) ?? [];

    if (array.length === 0) {
        return;
    }

    const stmt = db.prepare(
        `insert into ${PREFIX}${session} (timestamp, value, bits) values (?, ?, ?)`
    );
    const insertMany = db.transaction(data => {
        // eslint-disable-next-line no-restricted-syntax
        for (const item of data) {
            stmt.run(item.timestamp, item.value, item.bits);
        }
    });
    const t1 = performance.now();
    if (array.length !== 0) {
        insertMany(array);
    }
    const t2 = performance.now();
    console.count('Insert');
    console.log(t2 - t1, array.length);

    dataSessionBuffer.delete(session);
};

export const getDataFromDB = (
    session: string,
    beginIndex: number,
    endIndex: number
): DataEntry[] => {
    if (!db) {
        OpenDB();
        return getDataFromDB(session, beginIndex, endIndex);
    }
    const stmt = db.prepare(
        `SELECT id, value, bits, timestamp FROM ${PREFIX}${session}  WHERE id BETWEEN ? and ?`
    );
    return stmt.all(beginIndex, endIndex) as DataEntry[];
};

export const closeDB = () => {
    db?.close();
    db = null;
};
