import { ccc } from '@ckb-ccc/shell';

const CKB_TESTNET_RPC = 'https://testnet.ckb.dev/rpc';

export function createClient(): ccc.ClientPublicTestnet {
    return new ccc.ClientPublicTestnet({ url: CKB_TESTNET_RPC });
}
