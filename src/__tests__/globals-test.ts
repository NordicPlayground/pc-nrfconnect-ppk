import {
    adjustDataBufferSize,
    getSamplingTime,
    options,
    setSamplingRates,
    timestampToIndex,
} from '../globals';

/**
 * Writes index, timestamp and optionally samplesPerSecond to the global options object.
 * @param {number} index what the current options.index should be
 * @param {number} [samplesPerSecond] what sample rate to use to synchronise the timestamp
 * @returns {void}: writes silently to the options object
 */
const synchronise_index_and_timestamp = (
    index: number,
    samplesPerSecond = 1e5
): void => {
    options.index = index;
    options.samplingTime = 1e6 / samplesPerSecond;
    options.samplesPerSecond = samplesPerSecond;
    options.timestamp = index * options.samplingTime;
};

beforeEach(() => {
    options.data = new Float32Array();
    options.index = 0;
    options.timestamp = undefined;
    options.samplesPerSecond = 1e5;
});

describe('timestampToIndex', () => {
    it('should return zero if timestamps are zero', () => {
        expect(timestampToIndex(0)).toBe(0);
    });

    it('should return index equal to options.index if argument is options.timestamp', () => {
        synchronise_index_and_timestamp(1e4);
        expect(timestampToIndex(options.timestamp as number)).toBe(
            options.index
        );
    });
});

describe('getSamplingTime', () => {
    it('from 1 samplesPerSecond should return 1 million', () => {
        expect(getSamplingTime(1)).toBe(1e6);
    });

    it('from 10 samplesPerSecond should return 100k', () => {
        expect(getSamplingTime(10)).toBe(1e5);
    });

    it('from 100 samplesPerSecond should return 10k', () => {
        expect(getSamplingTime(100)).toBe(1e4);
    });

    it('from 1k samplesPerSecond should return 1k', () => {
        expect(getSamplingTime(1e3)).toBe(1e3);
    });

    it('from 10k samplesPerSecond should return 100', () => {
        expect(getSamplingTime(1e4)).toBe(100);
    });

    it('from 100k samplesPerSecond should return 10', () => {
        expect(getSamplingTime(1e5)).toBe(10);
    });
});

describe('setSamplingRates', () => {
    it('to have correct values', () => {
        setSamplingRates(1e3);

        expect(options.samplesPerSecond).toBe(1e3);
        expect(options.samplingTime).toBe(getSamplingTime(1e3));
    });
});

describe('adjustDataBufferSize', () => {
    it('does nothing if buffer size has not changed', () => {
        setSamplingRates(10);
        adjustDataBufferSize(10);
        const oldDataReference = options.data;

        adjustDataBufferSize(10);
        const newDataReference = options.data;

        expect(oldDataReference === newDataReference).toBeTruthy;
    });

    it('creates a new data buffer if buffer size has changed because of samplingRates are changed', () => {
        setSamplingRates(10);
        adjustDataBufferSize(10);
        const oldDataReference = options.data;

        setSamplingRates(100);
        adjustDataBufferSize(10);
        const newDataReference = options.data;

        expect(oldDataReference === newDataReference).toBeFalsy;
    });

    it('creates a new data buffer if buffer size has changed because of sampling duration is changed', () => {
        setSamplingRates(10);
        adjustDataBufferSize(10);
        const oldDataReference = options.data;

        adjustDataBufferSize(100);
        const newDataReference = options.data;

        expect(oldDataReference === newDataReference).toBeFalsy;
    });
});
