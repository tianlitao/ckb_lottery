/**
 * Build unsigned lottery transactions.
 * Adapted from frontend/app/countdown-actions.ts for agent (sign-server) signing.
 */

import { ccc } from '@ckb-ccc/shell';
import { scriptToHash } from '@nervosnetwork/ckb-sdk-utils';
import {
    getLotteryCellDeps, getAlwaysSuccessCellDeps, getSecp256k1CellDeps,
    getAlwaysSuccessLock, HOUSE_EDGE_BP, CONFIRMATIONS,
    PLATFORM_ADDRESS, MIN_POT_CAPACITY_SHANNONS, SHANNONS_PER_CKB,
} from './config';
import { buildLotteryArgs, encodeLotteryBetData, encodePotData, decodeLotteryBetData } from './types';
import { getLotteryTypeScriptWithArgs, listLotteryCells, getCellCreationBlockNumber } from './query';

/**
 * Build an unsigned bet transaction.
 *
 * @param signer - ccc.SignerCkbPublicKey (for input completion, NOT for signing)
 * @param stakeCkb - bet amount in CKB
 * @param guess - 0 = small (0-7), 1 = big (8-F)
 * @param platformLockHash - platform lock hash
 * @returns unsigned ccc.Transaction
 */
export async function buildBetTransaction(
    signer: ccc.Signer,
    stakeCkb: number,
    guess: 0 | 1,
    platformLockHash: `0x${string}`,
): Promise<ccc.Transaction> {
    const client = signer.client;

    const [tipHeader, depsLottery, depsAlways, depsSecp] = await Promise.all([
        client.getTipHeader(),
        getLotteryCellDeps(client),
        getAlwaysSuccessCellDeps(client),
        getSecp256k1CellDeps(client),
    ]);

    const type = getLotteryTypeScriptWithArgs(platformLockHash);
    const args = buildLotteryArgs(platformLockHash, HOUSE_EDGE_BP, CONFIRMATIONS);
    const lock = getAlwaysSuccessLock();

    const stakeShannons = BigInt(stakeCkb) * SHANNONS_PER_CKB;

    // Get bettor lock hash
    const addr = await signer.getRecommendedAddress();
    const bettorLock = (await ccc.Address.fromString(addr, client)).script;
    const bettorHash = scriptToHash(bettorLock) as `0x${string}`;

    const data = encodeLotteryBetData(stakeShannons, guess, bettorHash);

    const tx = ccc.Transaction.from({
        cellDeps: [...depsLottery, ...depsAlways, ...depsSecp],
        headerDeps: [tipHeader.hash],
        outputs: [{ lock, type: { ...type }, capacity: stakeShannons }],
        outputsData: [data],
    });

    // Complete inputs and fee using the signer's public key
    await tx.completeInputsByCapacity(signer);
    const prepared = await signer.prepareTransaction(tx);
    await prepared.completeFeeBy(signer);

    return prepared;
}

/**
 * Build an unsigned settle transaction to claim winnings.
 *
 * @param signer - ccc.SignerCkbPublicKey
 * @param platformLockHash - platform lock hash 
 * @param myWinBets - my winning bet cells
 * @param allBets - all bet cells (to find losers)
 * @param pot - optional pot cell to use if losers insufficient
 * @returns unsigned ccc.Transaction
 */
export async function buildSettleTransaction(
    signer: ccc.Signer,
    platformLockHash: `0x${string}`,
    myWinBets: ccc.Cell[],
    allBets: ccc.Cell[],
    pot?: ccc.Cell,
): Promise<ccc.Transaction> {
    const client = signer.client;

    const [tipHeader, depsLottery, depsAlways, depsSecp] = await Promise.all([
        client.getTipHeader(),
        getLotteryCellDeps(client),
        getAlwaysSuccessCellDeps(client),
        getSecp256k1CellDeps(client),
    ]);
    const tipNumber = BigInt(tipHeader.number);

    const addr = await signer.getRecommendedAddress();
    const walletLock = (await ccc.Address.fromString(addr, client)).script;
    const myHash = scriptToHash(walletLock);

    const headersSet = new Set<string>();
    let winnersStake = BigInt(0);
    let payoutTotal = BigInt(0);
    const inputs: any[] = [];

    // Process winning bets
    for (const c of myWinBets) {
        const d = decodeLotteryBetData(c.outputData);
        const created = await getCellCreationBlockNumber(client, c);
        if (created == null) continue;

        const hCreated = await client.getHeaderByNumber(created);
        const target = created + BigInt(CONFIRMATIONS);
        if (tipNumber < target) continue;

        const h = await client.getHeaderByNumber(target);
        if (!h?.hash) continue;

        const nib = parseInt(h.hash.slice(-1), 16);
        const win = (d.guess === 0 && nib < 8) || (d.guess === 1 && nib >= 8);
        if (!win || d.bettorLockHash.toLowerCase() !== myHash.toLowerCase()) continue;

        if (hCreated?.hash) headersSet.add(hCreated.hash);
        headersSet.add(h.hash);

        winnersStake += d.stakeShannons;
        const payout = (d.stakeShannons * BigInt(10000 - HOUSE_EDGE_BP)) / BigInt(10000);
        payoutTotal += payout;
        inputs.push(ccc.CellInput.from({ previousOutput: c.outPoint }));
    }

    if (winnersStake === BigInt(0)) {
        throw new Error('No confirmed winning bets found for this account');
    }

    // Find loser bets to cover payouts
    let selectedLosersStake = BigInt(0);
    const usedLosers = new Set<string>();
    const losersShuffled = [...allBets].sort(() => Math.random() - 0.5);

    for (const c of losersShuffled) {
        if (selectedLosersStake >= payoutTotal) break;
        const d = decodeLotteryBetData(c.outputData);
        const created = await getCellCreationBlockNumber(client, c);
        if (created == null) continue;

        const hCreated = await client.getHeaderByNumber(created);
        const target = created + BigInt(CONFIRMATIONS);
        if (tipNumber < target) continue;

        const h = await client.getHeaderByNumber(target);
        if (!h?.hash) continue;

        const nib = parseInt(h.hash.slice(-1), 16);
        const isLoser = !((d.guess === 0 && nib < 8) || (d.guess === 1 && nib >= 8));
        if (!isLoser) continue;

        const key = `${c.outPoint.txHash}:${c.outPoint.index}`;
        usedLosers.add(key);
        if (hCreated?.hash) headersSet.add(hCreated.hash);
        headersSet.add(h.hash);
        selectedLosersStake += d.stakeShannons;
        inputs.push(ccc.CellInput.from({ previousOutput: c.outPoint }));
    }

    // Use pot if losers insufficient
    let potIn = BigInt(0);
    if (selectedLosersStake < payoutTotal && pot) {
        potIn = pot.cellOutput.capacity;
        inputs.push(ccc.CellInput.from({ previousOutput: pot.outPoint }));
    }

    // Try to ensure minimum pot capacity for output
    let baseOutCap = potIn + selectedLosersStake - payoutTotal;
    if (baseOutCap < MIN_POT_CAPACITY_SHANNONS) {
        // Add more losers
        for (const c of losersShuffled) {
            if (baseOutCap >= MIN_POT_CAPACITY_SHANNONS) break;
            const key = `${c.outPoint.txHash}:${c.outPoint.index}`;
            if (usedLosers.has(key)) continue;

            const d = decodeLotteryBetData(c.outputData);
            const created = await getCellCreationBlockNumber(client, c);
            if (created == null) continue;

            const target = created + BigInt(CONFIRMATIONS);
            if (tipNumber < target) continue;

            const h = await client.getHeaderByNumber(target);
            if (!h?.hash) continue;

            const nib = parseInt(h.hash.slice(-1), 16);
            const isLoser = !((d.guess === 0 && nib < 8) || (d.guess === 1 && nib >= 8));
            if (!isLoser) continue;

            const hCreated = await client.getHeaderByNumber(created);
            usedLosers.add(key);
            if (hCreated?.hash) headersSet.add(hCreated.hash);
            headersSet.add(h.hash);
            selectedLosersStake += d.stakeShannons;
            inputs.push(ccc.CellInput.from({ previousOutput: c.outPoint }));
            baseOutCap = potIn + selectedLosersStake - payoutTotal;
        }
    }

    // Add more pot cells if still insufficient
    if (baseOutCap < MIN_POT_CAPACITY_SHANNONS) {
        const listed = await listLotteryCells(client, platformLockHash, 20);
        for (const p of listed.pots) {
            if (baseOutCap >= MIN_POT_CAPACITY_SHANNONS) break;
            if (pot && p.outPoint.txHash === pot.outPoint.txHash && p.outPoint.index === pot.outPoint.index) continue;
            inputs.push(ccc.CellInput.from({ previousOutput: p.outPoint }));
            potIn += p.cellOutput.capacity;
            baseOutCap = potIn + selectedLosersStake - payoutTotal;
        }
    }

    if (baseOutCap < MIN_POT_CAPACITY_SHANNONS) {
        throw new Error('Insufficient losers and pot to maintain minimum pot capacity');
    }

    // Build outputs
    const outputs: any[] = [];
    const outputsData: `0x${string}`[] = [];

    // Output 0: payout to winner
    outputs.push({ lock: walletLock, capacity: winnersStake + payoutTotal });
    outputsData.push('0x');

    // Output 1: new pot cell
    const outCap = baseOutCap;
    if (pot) {
        outputs.push({ lock: pot.cellOutput.lock, type: pot.cellOutput.type, capacity: outCap });
    } else {
        const typeOut = getLotteryTypeScriptWithArgs(platformLockHash);
        const lockOut = getAlwaysSuccessLock();
        outputs.push({ lock: lockOut, type: typeOut, capacity: outCap });
    }
    outputsData.push(encodePotData());

    // Header deps
    const headerDepsList = Array.from(headersSet);
    if (!headerDepsList.includes(tipHeader.hash)) headerDepsList.push(tipHeader.hash);

    // Deduplicate cell deps
    const mergedDeps = [...depsLottery, ...depsAlways, ...depsSecp];
    const seenDep = new Set<string>();
    const uniqDeps = mergedDeps.filter((d: any) => {
        const key = `${d?.outPoint?.txHash}:${d?.outPoint?.index}:${d?.depType}`;
        if (seenDep.has(key)) return false;
        seenDep.add(key);
        return true;
    });

    const tx = ccc.Transaction.from({
        cellDeps: uniqDeps,
        headerDeps: headerDepsList,
        inputs,
        outputs,
        outputsData,
    });

    // Complete remaining inputs/fee from wallet
    await tx.completeInputsByCapacity(signer);
    const prepared = await signer.prepareTransaction(tx);
    await prepared.completeFeeBy(signer);

    return prepared;
}
