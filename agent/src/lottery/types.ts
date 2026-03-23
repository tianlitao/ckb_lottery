/**
 * Data encoding/decoding for lottery Bet and Pot cells.
 * Ported from frontend/app/countdown-actions.ts
 */

// ─── Helpers ───

function toU64LEHex(n: bigint): string {
    const v = n & BigInt('0xffffffffffffffff');
    let h = v.toString(16).padStart(16, '0');
    return h.match(/../g)!.reverse().join('');
}

function fromU64LE(hexNoPrefix: string, offset: number): bigint {
    const slice = hexNoPrefix.slice(offset * 2, offset * 2 + 16);
    const bytes = slice.match(/../g)!.reverse().join('');
    return BigInt('0x' + bytes);
}

function toU16LEHex(n: number): string {
    const v = n & 0xffff;
    let h = v.toString(16).padStart(4, '0');
    return h.match(/../g)!.reverse().join('');
}

// ─── Lottery Args ───

/**
 * Build lottery type script args.
 * Layout: [platform_lock_hash: 32B] [house_edge_bp: u16 LE] [confirmations: u16 LE]
 */
export function buildLotteryArgs(
    platformLockHash: `0x${string}`,
    houseEdgeBp: number,
    confirmations: number,
): `0x${string}` {
    const ph = (platformLockHash.startsWith('0x') ? platformLockHash.slice(2) : platformLockHash).padStart(64, '0');
    const bp = toU16LEHex(houseEdgeBp);
    const cf = toU16LEHex(confirmations);
    return `0x${ph}${bp}${cf}` as const;
}

// ─── Bet Data ───

/**
 * Encode bet cell data.
 * Layout: [stake: u64 LE] [guess: u8 (0 or 1)] [bettor_lock_hash: 32B]
 */
export function encodeLotteryBetData(
    stakeShannons: bigint,
    guess: 0 | 1,
    bettorLockHash: `0x${string}`,
): `0x${string}` {
    const bh = (bettorLockHash.startsWith('0x') ? bettorLockHash.slice(2) : bettorLockHash).padStart(64, '0');
    const hex = toU64LEHex(stakeShannons) + (guess === 0 ? '00' : '01') + bh;
    return `0x${hex}` as const;
}

/**
 * Decode bet cell data.
 */
export function decodeLotteryBetData(dataHex: `0x${string}`): {
    stakeShannons: bigint;
    guess: 0 | 1;
    bettorLockHash: `0x${string}`;
} {
    const hex = dataHex.startsWith('0x') ? dataHex.slice(2) : dataHex;
    if (hex.length !== 82) throw new Error('invalid bet data length');
    const stake = fromU64LE(hex, 0);
    const guessByte = hex.slice(16, 18);
    const guess = guessByte === '00' ? 0 : 1;
    const lh = ('0x' + hex.slice(18, 82)) as `0x${string}`;
    return { stakeShannons: stake, guess, bettorLockHash: lh };
}

// ─── Pot Data ───

/** Encode pot cell data (simply 0x01) */
export function encodePotData(): `0x${string}` {
    return '0x01';
}

/** Check if data represents a pot cell */
export function isPotData(dataHex: `0x${string}`): boolean {
    const hex = dataHex.startsWith('0x') ? dataHex.slice(2) : dataHex;
    return hex.length === 2 && hex === '01';
}
