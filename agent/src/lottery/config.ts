/**
 * Lottery contract deployment configuration for CKB Testnet.
 * Extracted from offckb/my-scripts.json and offckb/system-scripts.json.
 */

import { ccc } from '@ckb-ccc/shell';

// ─── Platform configuration ───
export const PLATFORM_ADDRESS = 'ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvswq2x8n3yg4ed2gmu0kquncp7g2yuz2cxp9gz9';
export const ALWAYS_SUCCESS_ADDRESS = 'ckt1qq2fr4d459qmkxguhvxm3jhtrckpsrfypd90qw0slc5xyflscnfx2qgnnppf3';
export const HOUSE_EDGE_BP = 700;     // 7% house edge
export const CONFIRMATIONS = 1;       // 1 block confirmation
export const MIN_BET_CKB = 200;       // minimum bet amount
export const MIN_POT_CAPACITY_SHANNONS = BigInt(120) * BigInt(100_000_000); // 120 CKB
export const SHANNONS_PER_CKB = BigInt(100_000_000);

// ─── Countdown (lottery) script ───
const COUNTDOWN_SCRIPT = {
    codeHash: '0xac48d42a1b4cae8ad2deef012b3d7e97fd3486904f19ba58c94c05f1b297c252' as `0x${string}`,
    hashType: 'data1' as const,
    cellDeps: [
        {
            cellDep: {
                outPoint: {
                    txHash: '0xf26e549ad087137a078cebe3e82e6479fa125a81d32fc8acfb5faf0c207c184f' as `0x${string}`,
                    index: 0,
                },
                depType: 'code' as const,
            },
        },
    ],
};

// ─── Always success lock script (Type ID deployment) ───
const ALWAYS_SUCCESS_SCRIPT = {
    codeHash: '0x1491d5b5a141bb191cbb0db8caeb1e2c180d240b4af039f0fe286227f0c4d265' as `0x${string}`,
    hashType: 'type' as const,
    cellDeps: [
        {
            cellDep: {
                outPoint: {
                    txHash: '0x4324d796c2a0c4ec411c91da86910129f25869a050022eba5de9bbe54c0a3431' as `0x${string}`,
                    index: 0,
                },
                depType: 'code' as const,
            },
        },
    ],
};

// ─── secp256k1_blake160_sighash_all (wallet lock) ───
const SECP256K1_SCRIPT = {
    codeHash: '0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8' as `0x${string}`,
    hashType: 'type' as const,
    cellDeps: [
        {
            cellDep: {
                outPoint: {
                    txHash: '0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37' as `0x${string}`,
                    index: 0,
                },
                depType: 'depGroup' as const,
            },
        },
    ],
};

/** Get lottery type script base (without args) */
export function getLotteryTypeScript() {
    return {
        codeHash: COUNTDOWN_SCRIPT.codeHash,
        hashType: COUNTDOWN_SCRIPT.hashType,
    };
}

/** Get always_success lock script */
export function getAlwaysSuccessLock() {
    return {
        codeHash: ALWAYS_SUCCESS_SCRIPT.codeHash,
        hashType: ALWAYS_SUCCESS_SCRIPT.hashType,
        args: '0x' as `0x${string}`,
    };
}

/** Get lottery cell deps */
export function getLotteryCellDeps(client: ccc.Client): Promise<ccc.CellDep[]> {
    return client.getCellDeps(COUNTDOWN_SCRIPT.cellDeps);
}

/** Get always_success cell deps */
export function getAlwaysSuccessCellDeps(client: ccc.Client): Promise<ccc.CellDep[]> {
    return client.getCellDeps(ALWAYS_SUCCESS_SCRIPT.cellDeps);
}

/** Get secp256k1 lock cell deps (for user wallet) */
export function getSecp256k1CellDeps(client: ccc.Client): Promise<ccc.CellDep[]> {
    return client.getCellDeps(SECP256K1_SCRIPT.cellDeps);
}
