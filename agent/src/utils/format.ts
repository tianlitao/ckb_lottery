/**
 * Output formatting utilities.
 */

import { SHANNONS_PER_CKB } from '../lottery/config';

export function shannonsToDisplay(shannons: bigint): string {
    const whole = shannons / SHANNONS_PER_CKB;
    const frac = shannons % SHANNONS_PER_CKB;
    if (frac === BigInt(0)) return whole.toString();
    const fracStr = frac.toString().padStart(8, '0').replace(/0+$/, '');
    return `${whole}.${fracStr}`;
}

export function shortenHash(hash: string): string {
    if (hash.length <= 12) return hash;
    return `${hash.slice(0, 6)}...${hash.slice(-6)}`;
}

export function guessLabel(guess: 0 | 1): string {
    return guess === 0 ? 'SMALL (0-7)' : 'BIG (8-F)';
}

export function nibbleLabel(nibble: number): string {
    return nibble.toString(16).toUpperCase();
}
