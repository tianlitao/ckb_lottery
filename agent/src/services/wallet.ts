/**
 * Self-contained wallet service for CKB Lottery Agent.
 *
 * No external signing server required. Private keys are managed locally:
 *   1. CKB_PRIVATE_KEY env var (highest priority)
 *   2. ~/.ckb-lottery/wallet.json config file
 *
 * Use `lottery init` to generate a new wallet.
 */

import { ccc } from '@ckb-ccc/shell';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const WALLET_DIR = path.join(process.env.HOME ?? '.', '.ckb-lottery');
const WALLET_FILE = path.join(WALLET_DIR, 'wallet.json');

export interface WalletInfo {
    address: string;
    publicKey: string;
    privateKey: string;
}

interface WalletConfig {
    privateKey: string;
    network: 'testnet';
}

/**
 * Load the private key from env var or config file.
 */
function loadPrivateKey(): string | null {
    // 1. Env var
    const envKey = process.env.CKB_PRIVATE_KEY;
    if (envKey) return envKey;

    // 2. Config file
    try {
        if (fs.existsSync(WALLET_FILE)) {
            const raw = fs.readFileSync(WALLET_FILE, 'utf8');
            const config: WalletConfig = JSON.parse(raw);
            return config.privateKey || null;
        }
    } catch { /* ignore parse errors */ }

    return null;
}

/**
 * Generate a new wallet and save to config file.
 * Returns the wallet info.
 */
export async function generateWallet(client: ccc.Client): Promise<WalletInfo> {
    const privateKey = '0x' + crypto.randomBytes(32).toString('hex');
    const signer = new ccc.SignerCkbPrivateKey(client, privateKey);
    const address = await signer.getRecommendedAddress();
    const addressObj = await ccc.Address.fromString(address, client);
    const publicKey = addressObj.script.args;

    // Save to config
    if (!fs.existsSync(WALLET_DIR)) {
        fs.mkdirSync(WALLET_DIR, { recursive: true });
    }

    const config: WalletConfig = { privateKey, network: 'testnet' };
    fs.writeFileSync(WALLET_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });

    return { address, publicKey, privateKey };
}

/**
 * Get wallet info from private key (env var or config file).
 */
export async function getWallet(client: ccc.Client): Promise<WalletInfo | null> {
    const pk = loadPrivateKey();
    if (!pk) return null;

    const signer = new ccc.SignerCkbPrivateKey(client, pk);
    const address = await signer.getRecommendedAddress();
    const addressObj = await ccc.Address.fromString(address, client);
    const publicKey = addressObj.script.args;

    return { address, publicKey, privateKey: pk };
}

/**
 * Get a CCC signer for building and signing transactions.
 */
export function getSigner(client: ccc.Client, wallet: WalletInfo): ccc.SignerCkbPrivateKey {
    return new ccc.SignerCkbPrivateKey(client, wallet.privateKey);
}

/**
 * Sign and send a CKB transaction locally.
 */
export async function signAndSendTransaction(
    _address: string,
    unsignedTx: ccc.Transaction,
    client: ccc.Client,
): Promise<string> {
    const pk = loadPrivateKey();
    if (!pk) {
        throw new Error('No wallet found. Run `lottery init` first or set CKB_PRIVATE_KEY env var.');
    }
    const signer = new ccc.SignerCkbPrivateKey(client, pk);
    const signedTx = await signer.signTransaction(unsignedTx);
    return await client.sendTransaction(signedTx);
}

/**
 * Check if a wallet exists (env var or config file).
 */
export function walletExists(): boolean {
    return !!loadPrivateKey();
}

/**
 * Get the wallet config file path.
 */
export function getWalletPath(): string {
    return WALLET_FILE;
}
