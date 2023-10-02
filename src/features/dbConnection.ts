/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import BetterSqlite3, { Database, Statement } from 'better-sqlite3';

let db: Database;
let insertStatement: Statement;

export const initializeDB = () => {
    // const db = new Database('/tmp/ppk-test.db', { verbose: console.log });
    db = new BetterSqlite3('/tmp/ppk-test.db');

    // Though not required, it is generally important to set the WAL pragma for performance reasons.
    db.pragma('journal_mode = WAL');
    db.prepare('DROP TABLE IF EXISTS ppk').run();
    db.prepare(
        'CREATE TABLE ppk (id INTEGER, value REAL, bits INTEGER, timestamp INTEGER, type TEXT)'
    ).run();
};

export const prepareInsertStatement = () => {
    if (!db) throw Error('Database has not been connected.');
    insertStatement = db.prepare(
        'INSERT INTO ppk (id, value, bits, timestamp, type) VALUES (?, ?, ?, ?, ?)'
    );
};

export const insertDB = (
    id: number,
    value: number,
    bits: number,
    timestamp: number,
    type: string
) => {
    if (!db) throw Error('Database has been connected.');
    if (!insertStatement)
        throw Error('Insert statement has not been not been prepared.');
    insertStatement.run(id, value, bits, timestamp, type);
};

export const closeDB = () => {
    db.close();
};
