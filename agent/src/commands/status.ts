/**
 * `lottery status` command - Show on-chain lottery state.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { ccc } from '@ckb-ccc/shell';
import { scriptToHash } from '@nervosnetwork/ckb-sdk-utils';
import { createClient } from '../services/ckb';
import { getWallet } from '../services/wallet';
import { listLotteryCells, checkBetResult } from '../lottery/query';
import { decodeLotteryBetData } from '../lottery/types';
import { PLATFORM_ADDRESS, SHANNONS_PER_CKB } from '../lottery/config';
import { shannonsToDisplay, shortenHash, guessLabel, nibbleLabel } from '../utils/format';

export function registerStatusCommand(program: Command) {
    program
        .command('status')
        .description('Show on-chain lottery status: pot, bets, and results')
        .action(async () => {
            const client = createClient();
            const wallet = await getWallet(client);

            const platformLock = (await ccc.Address.fromString(PLATFORM_ADDRESS, client)).script;
            const ph = scriptToHash(platformLock) as `0x${string}`;

            let myLockHash: string | null = null;
            if (wallet) {
                const myLock = (await ccc.Address.fromString(wallet.address, client)).script;
                myLockHash = scriptToHash(myLock);
            }

            // Tip block
            const tipHeader = await client.getTipHeader();
            console.log(pc.dim('Current Block: ') + pc.cyan(`#${BigInt(tipHeader.number).toString()}`));
            console.log();

            // List cells
            const { bets, pots } = await listLotteryCells(client, ph);

            // Pots
            let totalPot = BigInt(0);
            for (const p of pots) {
                totalPot += p.cellOutput.capacity;
            }
            console.log(pc.bold('🏦 Pot: ') + pc.green(shannonsToDisplay(totalPot) + ' CKB') + pc.dim(` (${pots.length} cell(s))`));
            console.log();

            // Bets
            if (bets.length === 0) {
                console.log(pc.dim('No active bets on chain.'));
                return;
            }

            console.log(pc.bold(`🎲 Active Bets: ${bets.length}`));
            console.log(pc.dim('─'.repeat(70)));

            for (const bet of bets) {
                try {
                    const info = decodeLotteryBetData(bet.outputData);
                    const isMine = myLockHash && info.bettorLockHash.toLowerCase() === myLockHash.toLowerCase();
                    const result = await checkBetResult(client, bet);

                    const stakeCkb = shannonsToDisplay(info.stakeShannons);
                    const txHash = shortenHash(bet.outPoint.txHash);
                    const tag = isMine ? pc.yellow(' [MINE]') : '';

                    if (result) {
                        const icon = result.win ? '✅' : '❌';
                        const statusText = result.win
                            ? pc.green(`WIN  nibble=${nibbleLabel(result.nibble)}`)
                            : pc.red(`LOSE nibble=${nibbleLabel(result.nibble)}`);
                        console.log(`  ${icon} ${txHash} | ${guessLabel(info.guess)} | ${stakeCkb} CKB | ${statusText}${tag}`);
                    } else {
                        console.log(`  ⏳ ${txHash} | ${guessLabel(info.guess)} | ${stakeCkb} CKB | ${pc.yellow('PENDING')}${tag}`);
                    }
                } catch {
                    console.log(`  ⚠️  ${shortenHash(bet.outPoint.txHash)} | ${pc.dim('decode error')}`);
                }
            }
        });
}
