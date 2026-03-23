---
name: CKB Hash Lottery
description: Bet on CKB block hash last hex character (big/small), win 1.93x payout. Provably fair on-chain lottery powered by PoW.
version: 0.2.0
---

# CKB Hash Lottery Agent

A provably fair on-chain lottery on CKB blockchain. Bet on whether the last hex character of a future block hash is **BIG (8-F)** or **SMALL (0-7)**. Win rate 50%, payout 1.93x.

## Demo

![CKB Hash Lottery Agent demo](./demo.gif)

## Install

```bash
git clone https://github.com/tianlitao/ckb_lottery.git
cd ckb_lottery/agent
npm install
```

## Quick Start

```bash
# 1. Initialize wallet
npx tsx src/index.ts init

# 2. Fund your wallet with CKB Testnet tokens
#    Copy the address from init output, then visit:
#    https://faucet.nervos.org/

# 3. Check balance
npx tsx src/index.ts balance

# 4. Place a bet
npx tsx src/index.ts bet --guess big --amount 500

# 5. Wait ~10 seconds for block confirmation, then check result
npx tsx src/index.ts status

# 6. Claim winnings
npx tsx src/index.ts claim
```

## Commands

### `init` - Create Wallet

```bash
npx tsx src/index.ts init
npx tsx src/index.ts init --force   # regenerate wallet
```

Generates a secp256k1 wallet, saves private key to `~/.ckb-lottery/wallet.json`.
You can also set `CKB_PRIVATE_KEY` env var instead (takes priority).

### `balance` - Check Balance

```bash
npx tsx src/index.ts balance
```

Shows wallet address, CKB balance, and unclaimed winnings.

### `bet` - Place a Bet

```bash
npx tsx src/index.ts bet --guess <big|small> --amount <CKB>
npx tsx src/index.ts bet --guess big --amount 500 --json
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--guess` | Yes | `big` (8-F) or `small` (0-7) |
| `--amount` | Yes | CKB to bet, minimum 200 |
| `--json` | No | Output as JSON |

### `status` - View Lottery State

```bash
npx tsx src/index.ts status
```

Shows current block, pot size, all active bets with win/lose results. Your bets marked `[MINE]`.

### `claim` - Claim Winnings

```bash
npx tsx src/index.ts claim
npx tsx src/index.ts claim --json
```

Settles all confirmed winning bets and transfers payout to your wallet.

## Natural Language Mapping

When used with an AI agent (Claude Code, OpenClaw, etc.), map user intent to commands:

| User says | Command |
|-----------|---------|
| "I bet big with 500 CKB" | `bet --guess big --amount 500` |
| "Bet small, 300 CKB" | `bet --guess small --amount 300` |
| "Check my status" / "Show results" | `status` |
| "Claim my winnings" | `claim` |
| "What's my balance?" | `balance` |
| "Set up my wallet" | `init` |

Chinese is also supported:

| User says | Command |
|-----------|---------|
| "我猜大，下注 500 CKB" | `bet --guess big --amount 500` |
| "查看状态" | `status` |
| "领取奖金" | `claim` |
| "查看余额" | `balance` |

## Execution Pattern

1. Parse user's natural language to determine intent: `init`, `bet`, `status`, `claim`, or `balance`
2. For `bet`: extract guess direction (`big`/`small`) and amount (default 500 if unspecified, minimum 200)
3. Run the command via `npx tsx src/index.ts <command> [options]` inside the `ckb_lottery/agent` directory
4. Present output to user in a friendly format
5. If bet was placed, suggest waiting ~10s then checking `status`

## Error Handling

| Error | Solution |
|-------|----------|
| No wallet found | Run `init` or set `CKB_PRIVATE_KEY` env var |
| Insufficient balance | Show balance, suggest visiting faucet: https://faucet.nervos.org/ |
| Invalid guess | Must be "big" or "small" |
| Amount too low | Minimum bet is 200 CKB |
| No claimable bets | Place a bet first and wait for confirmation |

## Safety

- Confirm bets > 1000 CKB before executing
- This is CKB **Testnet** only - no real value at risk
- Results are provably fair: determined by PoW block hash, unpredictable by anyone
- Private keys stored locally with 0600 permissions, no external servers

## Game Rules

| Rule | Value |
|------|-------|
| Bet target | Last hex char of block hash |
| SMALL | 0-7 (8 values) |
| BIG | 8-F (8 values) |
| Win probability | 50% |
| Payout | 1.93x |
| House edge | 7% |
| Min bet | 200 CKB |
| Confirmation | 1 block (~10s) |
| Network | CKB Testnet |

## Configuration

| Item | Value |
|------|-------|
| Wallet file | `~/.ckb-lottery/wallet.json` |
| Private key env | `CKB_PRIVATE_KEY` |
| RPC endpoint | `https://testnet.ckb.dev/rpc` |
| Faucet | https://faucet.nervos.org/ |
| Source | https://github.com/tianlitao/ckb_lottery |
