#!/usr/bin/env node
/**
 * CKB Hash Lottery Agent CLI
 *
 * Commands:
 *   lottery init                                       Generate wallet
 *   lottery bet --guess <big|small> --amount <CKB>     Place a bet
 *   lottery status                                     Show lottery state
 *   lottery claim                                      Claim winnings
 *   lottery balance                                    Show wallet balance
 */

import { Command } from 'commander';
import { registerInitCommand } from './commands/init';
import { registerBetCommand } from './commands/bet';
import { registerStatusCommand } from './commands/status';
import { registerClaimCommand } from './commands/claim';
import { registerBalanceCommand } from './commands/balance';

const program = new Command();

program
    .name('lottery')
    .description('CKB Hash Lottery Agent CLI - bet on block hash last nibble (big/small)')
    .version('0.2.0')
    .showHelpAfterError();

registerInitCommand(program);
registerBetCommand(program);
registerStatusCommand(program);
registerClaimCommand(program);
registerBalanceCommand(program);

program.parseAsync(process.argv).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
