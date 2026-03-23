/**
 * `lottery balance` command - Show wallet balance and claimable winnings.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { ccc } from '@ckb-ccc/shell';
import { scriptToHash } from '@nervosnetwork/ckb-sdk-utils';
import { createClient } from '../services/ckb';
import { getWallet } from '../services/wallet';
import { getMyClaimableBets } from '../lottery/query';
import { PLATFORM_ADDRESS, HOUSE_EDGE_BP, SHANNONS_PER_CKB } from '../lottery/config';
import { shannonsToDisplay } from '../utils/format';

export function registerBalanceCommand(program: Command) {
    program
        .command('balance')
        .description('Show wallet CKB balance and claimable winnings')
        .action(async () => {
            const client = createClient();

            const wallet = await getWallet(client);
            if (!wallet) {
                console.error(pc.red('❌ No wallet found. Set CKB_PRIVATE_KEY env var or start the signing server.'));
                process.exit(1);
            }

            console.log(pc.dim('Address: ') + pc.cyan(wallet.address));

            // Get CKB balance
            try {
                const lock = (await ccc.Address.fromString(wallet.address, client)).script;
                const bal = await client.getBalanceSingle(lock);
                console.log(pc.dim('Balance: ') + pc.green(shannonsToDisplay(bal) + ' CKB'));
            } catch (e: any) {
                console.log(pc.dim('Balance: ') + pc.yellow('Unable to fetch'));
            }

            // Get claimable winnings
            try {
                const platformLock = (await ccc.Address.fromString(PLATFORM_ADDRESS, client)).script;
                const ph = scriptToHash(platformLock) as `0x${string}`;
                const lockHash = scriptToHash((await ccc.Address.fromString(wallet.address, client)).script) as `0x${string}`;
                const claimable = await getMyClaimableBets(client, ph, lockHash);

                if (claimable.length > 0) {
                    let totalPayout = BigInt(0);
                    for (const c of claimable) {
                        const payout = (c.stakeShannons * BigInt(20000 - HOUSE_EDGE_BP)) / BigInt(10000);
                        totalPayout += payout;
                    }
                    console.log(pc.dim('Claimable: ') + pc.yellow(shannonsToDisplay(totalPayout) + ' CKB') + pc.dim(` (${claimable.length} bet(s))`));
                } else {
                    console.log(pc.dim('Claimable: ') + '0 CKB');
                }
            } catch (e: any) {
                console.log(pc.dim('Claimable: ') + pc.yellow('Unable to check'));
            }
        });
}
