/**
 * `lottery init` command - Generate a new wallet or show existing one.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { createClient } from '../services/ckb';
import { getWallet, generateWallet, walletExists, getWalletPath } from '../services/wallet';

export function registerInitCommand(program: Command) {
    program
        .command('init')
        .description('Generate a new wallet or show existing wallet info')
        .option('--force', 'Generate a new wallet even if one exists', false)
        .action(async (options) => {
            const client = createClient();

            // Check existing wallet
            const existing = await getWallet(client);
            if (existing && !options.force) {
                console.log(pc.green('✅ Wallet already configured'));
                console.log(pc.dim('Address:     ') + pc.cyan(existing.address));
                console.log(pc.dim('Config file: ') + getWalletPath());
                console.log();
                console.log(pc.dim('To generate a new wallet, run:'));
                console.log(pc.yellow('  lottery init --force'));
                return;
            }

            // Generate new wallet
            const wallet = await generateWallet(client);
            console.log();
            console.log(pc.green('🎉 New wallet generated!'));
            console.log(pc.dim('Address:     ') + pc.cyan(wallet.address));
            console.log(pc.dim('Private Key: ') + pc.yellow(wallet.privateKey));
            console.log(pc.dim('Saved to:    ') + getWalletPath());
            console.log();
            console.log(pc.bold('⚠️  IMPORTANT:'));
            console.log(pc.dim('  1. Back up your private key in a safe place'));
            console.log(pc.dim('  2. Get testnet CKB from: ') + pc.cyan('https://faucet.nervos.org/'));
            console.log(pc.dim('  3. Then run: ') + pc.yellow('lottery balance'));
        });
}
