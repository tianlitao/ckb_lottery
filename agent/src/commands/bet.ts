/**
 * `lottery bet` command - Place a bet on the blockchain.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { ccc } from '@ckb-ccc/shell';
import { scriptToHash } from '@nervosnetwork/ckb-sdk-utils';
import { createClient } from '../services/ckb';
import { getWallet, getSigner, signAndSendTransaction } from '../services/wallet';
import { buildBetTransaction } from '../lottery/tx';
import { PLATFORM_ADDRESS, MIN_BET_CKB, SHANNONS_PER_CKB } from '../lottery/config';

export function registerBetCommand(program: Command) {
    program
        .command('bet')
        .description('Place a bet: guess if block hash last nibble is big (8-F) or small (0-7)')
        .requiredOption('--guess <type>', 'Guess type: "big" or "small"')
        .requiredOption('--amount <ckb>', 'Bet amount in CKB (minimum 200)')
        .option('--json', 'Output result as JSON', false)
        .action(async (options) => {
            const { guess: guessStr, amount: amountStr, json: useJson } = options;

            // Validate guess
            const guessLower = guessStr.toLowerCase();
            if (guessLower !== 'big' && guessLower !== 'small') {
                console.error(pc.red('❌ --guess must be "big" or "small"'));
                process.exit(1);
            }
            const guess: 0 | 1 = guessLower === 'small' ? 0 : 1;

            // Validate amount
            const amount = parseInt(amountStr, 10);
            if (isNaN(amount) || amount < MIN_BET_CKB) {
                console.error(pc.red(`❌ --amount must be at least ${MIN_BET_CKB} CKB`));
                process.exit(1);
            }

            const client = createClient();

            // Get wallet
            const wallet = await getWallet(client);
            if (!wallet) {
                console.error(pc.red('❌ No wallet found. Set CKB_PRIVATE_KEY env var or start the signing server.'));
                process.exit(1);
            }

            // Check balance
            const lock = (await ccc.Address.fromString(wallet.address, client)).script;
            const bal = await client.getBalanceSingle(lock);
            const balCkb = Number(bal / SHANNONS_PER_CKB);
            if (balCkb < amount) {
                console.error(pc.red(`❌ Insufficient balance. Available: ${balCkb} CKB, Required: ${amount} CKB`));
                process.exit(1);
            }

            if (!useJson) {
                console.log(pc.dim(`Placing bet: ${guessLower.toUpperCase()} | ${amount} CKB`));
                console.log(pc.dim('Building transaction...'));
            }

            // Build transaction
            const signer = getSigner(client, wallet);
            const platformLock = (await ccc.Address.fromString(PLATFORM_ADDRESS, client)).script;
            const ph = scriptToHash(platformLock) as `0x${string}`;

            const unsignedTx = await buildBetTransaction(signer, amount, guess, ph);

            if (!useJson) {
                console.log(pc.dim('Signing and sending...'));
            }

            // Sign and send
            const txHash = await signAndSendTransaction(wallet.address, unsignedTx, client);

            if (useJson) {
                console.log(JSON.stringify({
                    success: true,
                    txHash,
                    guess: guessLower,
                    amount,
                    address: wallet.address,
                }, null, 2));
            } else {
                console.log();
                console.log(pc.green('✅ Bet placed successfully!'));
                console.log(pc.dim('Tx Hash: ') + pc.cyan(txHash));
                console.log(pc.dim('Guess:   ') + (guess === 0 ? 'SMALL (0-7)' : 'BIG (8-F)'));
                console.log(pc.dim('Amount:  ') + `${amount} CKB`);
                console.log();
                console.log(pc.dim('Wait ~10s for block confirmation, then run:'));
                console.log(pc.yellow('  lottery status'));
            }
        });
}
