/**
 * `lottery claim` command - Claim winning bets.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { ccc } from '@ckb-ccc/shell';
import { scriptToHash } from '@nervosnetwork/ckb-sdk-utils';
import { createClient } from '../services/ckb';
import { getWallet, getSigner, signAndSendTransaction } from '../services/wallet';
import { getMyClaimableBets, listLotteryCells } from '../lottery/query';
import { buildSettleTransaction } from '../lottery/tx';
import { PLATFORM_ADDRESS, HOUSE_EDGE_BP, SHANNONS_PER_CKB } from '../lottery/config';
import { shannonsToDisplay } from '../utils/format';

export function registerClaimCommand(program: Command) {
    program
        .command('claim')
        .description('Claim all confirmed winnings to your wallet')
        .option('--json', 'Output result as JSON', false)
        .action(async (options) => {
            const { json: useJson } = options;

            const client = createClient();

            const wallet = await getWallet(client);
            if (!wallet) {
                console.error(pc.red('❌ No wallet found. Set CKB_PRIVATE_KEY env var or start the signing server.'));
                process.exit(1);
            }

            const platformLock = (await ccc.Address.fromString(PLATFORM_ADDRESS, client)).script;
            const ph = scriptToHash(platformLock) as `0x${string}`;
            const myLock = (await ccc.Address.fromString(wallet.address, client)).script;
            const myLockHash = scriptToHash(myLock) as `0x${string}`;

            // Find claimable bets
            if (!useJson) console.log(pc.dim('Checking for claimable bets...'));

            const claimable = await getMyClaimableBets(client, ph, myLockHash);

            if (claimable.length === 0) {
                if (useJson) {
                    console.log(JSON.stringify({ success: false, message: 'No claimable winnings found' }));
                } else {
                    console.log(pc.yellow('No claimable winnings found.'));
                    console.log(pc.dim('Place a bet first with: lottery bet --guess big --amount 500'));
                }
                return;
            }

            // Calculate total payout
            let totalPayout = BigInt(0);
            for (const c of claimable) {
                const payout = (c.stakeShannons * BigInt(20000 - HOUSE_EDGE_BP)) / BigInt(10000);
                totalPayout += payout;
            }

            if (!useJson) {
                console.log(pc.green(`Found ${claimable.length} winning bet(s), total payout: ${shannonsToDisplay(totalPayout)} CKB`));
                console.log(pc.dim('Building settle transaction...'));
            }

            // Get all bets (to find losers) and pot
            const { bets: allBets, pots } = await listLotteryCells(client, ph);
            const pot = pots.length > 0 ? pots[Math.floor(Math.random() * pots.length)] : undefined;

            // Build transaction  
            const signer = getSigner(client, wallet);
            const myBetCells = claimable.map(c => c.bet);
            const unsignedTx = await buildSettleTransaction(signer, ph, myBetCells, allBets, pot);

            if (!useJson) console.log(pc.dim('Signing and sending...'));

            // Sign and send
            const txHash = await signAndSendTransaction(wallet.address, unsignedTx, client);

            if (useJson) {
                console.log(JSON.stringify({
                    success: true,
                    txHash,
                    claimedBets: claimable.length,
                    totalPayoutCkb: shannonsToDisplay(totalPayout),
                }, null, 2));
            } else {
                console.log();
                console.log(pc.green('✅ Winnings claimed successfully!'));
                console.log(pc.dim('Tx Hash: ') + pc.cyan(txHash));
                console.log(pc.dim('Bets:    ') + `${claimable.length}`);
                console.log(pc.dim('Payout:  ') + pc.green(`${shannonsToDisplay(totalPayout)} CKB`));
            }
        });
}
