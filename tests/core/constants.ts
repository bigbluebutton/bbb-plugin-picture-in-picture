import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const CI = process.env.CI === 'true';
const TIMEOUT_MULTIPLIER = Number(process.env.TIMEOUT_MULTIPLIER);
const MULTIPLIER = CI ? TIMEOUT_MULTIPLIER || 2 : TIMEOUT_MULTIPLIER || 1;

// GLOBAL TESTS VARS
export const ELEMENT_WAIT_TIME: number = 5000 * MULTIPLIER;
export const ELEMENT_WAIT_LONGER_TIME: number = 10000 * MULTIPLIER;
export const ELEMENT_WAIT_EXTRA_LONG_TIME: number = 15000 * MULTIPLIER;
export const LOOP_INTERVAL: number = 1200;
