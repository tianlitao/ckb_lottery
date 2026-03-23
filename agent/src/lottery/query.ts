/**
 * Query on-chain lottery cells and check bet results.
 */

import { ccc } from '@ckb-ccc/shell';
import {
    getLotteryTypeScript, getAlwaysSuccessLock,
    HOUSE_EDGE_BP, CONFIRMATIONS, SHANNONS_PER_CKB,
} from './config';
import { buildLotteryArgs, decodeLotteryBetData, isPotData } from './types';

const CKB_TESTNET_RPC = 'https://testnet.ckb.dev/rpc';

/**
 * Get full lottery type script with args for querying.
 */
export function getLotteryTypeScriptWithArgs(platformLockHash: `0x${string}`) {
    const base = getLotteryTypeScript();
    const args = buildLotteryArgs(platformLockHash, HOUSE_EDGE_BP, CONFIRMATIONS);
    return { ...base, args };
}

/**
 * List all lottery cells (bets and pots) on chain.
 */
export async function listLotteryCells(
    client: ccc.Client,
    platformLockHash: `0x${string}`,
    limit: number = 50,
): Promise<{ bets: ccc.Cell[]; pots: ccc.Cell[] }> {
    const type = getLotteryTypeScriptWithArgs(platformLockHash);
    const bets: ccc.Cell[] = [];
    const pots: ccc.Cell[] = [];
    let count = 0;

    for await (const cell of client.findCellsByType(type, true, 'desc', limit)) {
        const d = (cell as any).outputData as `0x${string}`;
        if (isPotData(d)) {
            pots.push(cell);
        } else {
            bets.push(cell);
        }
        count++;
        if (count >= limit) break;
    }

    return { bets, pots };
}

/**
 * Get the block number where a cell was created.
 */
export async function getCellCreationBlockNumber(
    client: ccc.Client,
    cell: ccc.Cell,
): Promise<bigint | null> {
    try {
        const res: any = await client.getTransaction(cell.outPoint.txHash);
        const bh: string | undefined =
            res?.txStatus?.blockHash ??
            res?.tx_status?.block_hash ??
            res?.blockHash ??
            res?.transaction?.blockHash ??
            res?.transaction?.txStatus?.blockHash ??
            res?.transaction?.tx_status?.block_hash;

        if (!bh) {
            // Fallback: direct RPC call
            const raw = await fetch(CKB_TESTNET_RPC, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'get_transaction', params: [cell.outPoint.txHash] }),
            });
            const json = await raw.json();
            const bh2 = json?.result?.tx_status?.block_hash;
            if (!bh2) return null;
            return await getHeaderNumber(bh2);
        }
        return await getHeaderNumber(bh);
    } catch {
        return null;
    }
}

async function getHeaderNumber(blockHash: string): Promise<bigint | null> {
    try {
        const res = await fetch(CKB_TESTNET_RPC, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'get_header', params: [blockHash] }),
        });
        const json = await res.json();
        return json?.result ? BigInt(json.result.number) : null;
    } catch {
        return null;
    }
}

export interface BetResult {
    win: boolean;
    nibble: number;
    headerHash: string;
    target: bigint;
}

/**
 * Check the result of a bet cell.
 * Returns null if the result is not yet available (not enough confirmations).
 */
export async function checkBetResult(
    client: ccc.Client,
    bet: ccc.Cell,
): Promise<BetResult | null> {
    const tipHeader = await client.getTipHeader();
    const tipNumber = BigInt(tipHeader.number);
    const { guess } = decodeLotteryBetData(bet.outputData);

    const created = await getCellCreationBlockNumber(client, bet);
    if (created == null) return null;

    const target = created + BigInt(CONFIRMATIONS);
    if (tipNumber < target) return null;

    const h = await client.getHeaderByNumber(target);
    if (!h?.hash) return null;

    const nibble = parseInt(h.hash.slice(-1), 16);
    const win = (guess === 0 && nibble < 8) || (guess === 1 && nibble >= 8);
    return { win, nibble, headerHash: h.hash, target };
}

/**
 * Get "my" bets from on-chain cells.
 */
export async function getMyBets(
    client: ccc.Client,
    platformLockHash: `0x${string}`,
    myLockHash: string,
): Promise<{ bet: ccc.Cell; result: BetResult | null; stakeShannons: bigint; guess: 0 | 1 }[]> {
    const { bets } = await listLotteryCells(client, platformLockHash);
    const results: { bet: ccc.Cell; result: BetResult | null; stakeShannons: bigint; guess: 0 | 1 }[] = [];

    for (const bet of bets) {
        try {
            const info = decodeLotteryBetData(bet.outputData);
            if (info.bettorLockHash.toLowerCase() !== myLockHash.toLowerCase()) continue;
            const r = await checkBetResult(client, bet);
            results.push({ bet, result: r, stakeShannons: info.stakeShannons, guess: info.guess });
        } catch {
            continue;
        }
    }

    return results;
}

/**
 * Get claimable (won + confirmed) bets for a given lock hash.
 */
export async function getMyClaimableBets(
    client: ccc.Client,
    platformLockHash: `0x${string}`,
    myLockHash: string,
): Promise<{ bet: ccc.Cell; result: BetResult; stakeShannons: bigint }[]> {
    const myBets = await getMyBets(client, platformLockHash, myLockHash);
    return myBets
        .filter((b): b is typeof b & { result: BetResult } => b.result !== null && b.result.win)
        .map(b => ({ bet: b.bet, result: b.result, stakeShannons: b.stakeShannons }));
}
