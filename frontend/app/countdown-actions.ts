'use client';

import { ccc, KnownScript } from '@ckb-ccc/connector-react';
import offckb from '@/offckb.config';
import { scriptToHash } from '@nervosnetwork/ckb-sdk-utils';

const SHANNONS_PER_CKB = BigInt(100000000);
const MIN_POT_CAPACITY_SHANNONS = BigInt(120) * SHANNONS_PER_CKB;

function logRawTx(stage: string, tx: any) {
  try {
    const json = JSON.stringify(
      tx,
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    );
    console.group(`RawTransaction:${stage}`);
    console.log(json);
    console.groupEnd();
  } catch (e) {
    console.warn(`RawTransaction:${stage} stringify failed`, e);
    console.log(tx);
  }
}

function toU32LEHex(n: number): string {
  const v = BigInt(n >>> 0);
  let h = v.toString(16);
  h = h.padStart(8, '0');
  const bytes = h.match(/../g)!.reverse().join('');
  return bytes;
}

function toU64LEHex(n: bigint): string {
  const v = n & BigInt('0xffffffffffffffff');
  let h = v.toString(16);
  h = h.padStart(16, '0');
  const bytes = h.match(/../g)!.reverse().join('');
  return bytes;
}

function fromU64LE(hexNoPrefix: string, offset: number): bigint {
  const slice = hexNoPrefix.slice(offset * 2, offset * 2 + 16);
  const bytes = slice.match(/../g)!.reverse().join('');
  return BigInt('0x' + bytes);
}

export function getLotteryTypeScript(): { codeHash: `0x${string}`; hashType: 'data' | 'type' | 'data1'; args: '0x' } {
  const s = offckb.myScripts['lottery'] ?? offckb.myScripts['countdown'];
  if (!s) throw new Error('lottery script not found in offckb config');
  return { codeHash: s.codeHash, hashType: s.hashType, args: '0x' };
}

export function buildLotteryArgs(platformLockHash: `0x${string}`, houseEdgeBp: number, confirmations: number): `0x${string}` {
  const ph = (platformLockHash.startsWith('0x') ? platformLockHash.slice(2) : platformLockHash).padStart(64, '0');
  const bp = toU32LEHex(houseEdgeBp).slice(0, 4);
  const cf = toU32LEHex(confirmations).slice(0, 4);
  return `0x${ph}${bp}${cf}` as const;
}

export function getLotteryTypeScriptWithArgs(cfg: { platformLockHash: `0x${string}`; houseEdgeBp: number; confirmations: number }): { codeHash: `0x${string}`; hashType: 'data' | 'type' | 'data1'; args: `0x${string}` } {
  const base = getLotteryTypeScript();
  const args = buildLotteryArgs(cfg.platformLockHash, cfg.houseEdgeBp, cfg.confirmations);
  return { ...base, args };
}

export function decodeLotteryTypeArgs(args: `0x${string}`): { platformLockHash: `0x${string}`; houseEdgeBp: number; confirmations: number } {
  const hex = args.startsWith('0x') ? args.slice(2) : args;
  const ph = ('0x' + hex.slice(0, 64)) as `0x${string}`;
  const bpLE = hex.slice(64, 68);
  const cfLE = hex.slice(68, 72);
  const bp = Number(parseInt(bpLE.match(/../g)!.reverse().join(''), 16));
  const cf = Number(parseInt(cfLE.match(/../g)!.reverse().join(''), 16));
  return { platformLockHash: ph, houseEdgeBp: bp, confirmations: cf };
}

export function getAlwaysSuccessLock(): { codeHash: `0x${string}`; hashType: 'data' | 'type' | 'data1'; args: '0x' } {
  const sMy = offckb.myScripts['always_success'];
  const s = sMy ?? offckb.systemScripts.always_success?.script;
  if (!s) throw new Error('always_success script not found in offckb config');
  return { codeHash: s.codeHash, hashType: s.hashType, args: '0x' };
}

export async function getAlwaysSuccessCellDeps(client: ccc.Client): Promise<ccc.CellDep[]> {
  const sMy = offckb.myScripts['always_success'];
  const s = sMy ?? offckb.systemScripts.always_success?.script;
  if (!s) throw new Error('always_success script not found in offckb config');
  return client.getCellDeps(s.cellDeps);
}

export async function getLotteryCellDeps(client: ccc.Client): Promise<ccc.CellDep[]> {
  const s = offckb.myScripts['lottery'] ?? offckb.myScripts['countdown'];
  if (!s) throw new Error('lottery script not found in offckb config');
  return client.getCellDeps(s.cellDeps);
}

function encodeLotteryBetData(stakeShannons: bigint, guess: 0 | 1, bettorLockHash: `0x${string}`): `0x${string}` {
  const bh = (bettorLockHash.startsWith('0x') ? bettorLockHash.slice(2) : bettorLockHash).padStart(64, '0');
  const hex = toU64LEHex(stakeShannons) + (guess === 0 ? '00' : '01') + bh;
  return (`0x${hex}`) as const;
}

export function decodeLotteryBetData(dataHex: `0x${string}`): { stakeShannons: bigint; guess: 0 | 1; bettorLockHash: `0x${string}` } {
  const hex = dataHex.startsWith('0x') ? dataHex.slice(2) : dataHex;
  if (hex.length !== 82) throw new Error('invalid bet data length');
  const stake = fromU64LE(hex, 0);
  const guessByte = hex.slice(16, 18);
  const guess = guessByte === '00' ? 0 : 1;
  const lh = ('0x' + hex.slice(18, 82)) as `0x${string}`;
  return { stakeShannons: stake, guess, bettorLockHash: lh };
}

export async function createLotteryBet(
  signer: ccc.Signer,
  cfg: { platformLockHash: `0x${string}`; houseEdgeBp: number; confirmations: number },
  params: { stakeCkb: string | number; guess: 0 | 1 },
): Promise<string> {
  const client = signer.client;
  const [{ hash }, depsLottery, depsAlways] = await Promise.all([getTipHeader(client), getLotteryCellDeps(client), getAlwaysSuccessCellDeps(client)]);
  const type = getLotteryTypeScriptWithArgs(cfg);
  const lock = getAlwaysSuccessLock();
  const stakeShannons = BigInt(ccc.fixedPointFrom(params.stakeCkb));
  const addr = await signer.getRecommendedAddress();
  const bettorLock = (await ccc.Address.fromString(addr, client)).script;
  const bettorHash = scriptToHash(bettorLock) as `0x${string}`;
  const depsWallet = await getWalletLockCellDeps(client, bettorLock);
  const data = encodeLotteryBetData(stakeShannons, params.guess, bettorHash);
  const tx = ccc.Transaction.from({
    cellDeps: [...depsLottery, ...depsAlways, ...depsWallet],
    headerDeps: [hash],
    outputs: [{ lock, type, capacity: stakeShannons }],
    outputsData: [data],
  });
  logRawTx('init:create_bet', tx);
  await tx.completeInputsByCapacity(signer);
  logRawTx('afterInputs:create_bet', tx);
  await tx.completeFeeBy(signer);
  logRawTx('final:create_bet', tx);
  return signer.sendTransaction(tx);
}

async function getHeaderByHash(client: ccc.Client, hash: string): Promise<{ hash: string; number: bigint } | null> {
  try {
    const url = offckb.rpcUrl;
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'get_header', params: [hash] }) });
    const json = await res.json();
    const h = json?.result;
    if (!h) return null;
    return { hash: h.hash, number: BigInt(h.number) };
  } catch (_e) {
    return null;
  }
}

export async function getCellCreationBlockNumber(client: ccc.Client, cell: ccc.Cell): Promise<bigint | null> {
  try {
    const res: any = await client.getTransaction(cell.outPoint.txHash);
    const bh: string | undefined =
      res?.txStatus?.blockHash ??
      res?.tx_status?.block_hash ??
      res?.blockHash ??
      res?.transaction?.blockHash ??
      res?.transaction?.txStatus?.blockHash ??
      res?.transaction?.tx_status?.block_hash;
    if (!bh) {
      try {
        const url = offckb.rpcUrl;
        const raw = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'get_transaction', params: [cell.outPoint.txHash] }) });
        const json = await raw.json();
        const bh2: string | undefined = json?.result?.tx_status?.block_hash;
        if (!bh2) return null;
        const header = await getHeaderByHash(client, bh2);
        return header?.number ?? null;
      } catch (_e2) {
        return null;
      }
    }
    const header = await getHeaderByHash(client, bh);
    return header?.number ?? null;
  } catch (_e) {
    return null;
  }
}

export async function checkBetResultByTipHeader(client: ccc.Client, bet: ccc.Cell, cfg: { confirmations: number }): Promise<{ win: boolean; nibble: number; headerHash: string; target: bigint }> {
  const { number } = await getTipHeader(client);
  const { guess } = decodeLotteryBetData(bet.outputData);
  const created = await getCellCreationBlockNumber(client, bet);
  if (created == null) {
    return null as any;
  }
  const target = created + BigInt(cfg.confirmations);
  if (number < target) {
    return null as any;
  }
  const h = await client.getHeaderByNumber(target);
  if (!h?.hash) throw new Error('目标区块头不可用');
  const nibble = parseInt(h.hash.slice(-1), 16);
  const win = (guess === 0 && nibble < 8) || (guess === 1 && nibble >= 8);
  return { win, nibble, headerHash: h.hash, target };
}

function encodePotData(): `0x${string}` {
  return '0x01' as const;
}

export async function createPotCell(
  signer: ccc.Signer,
  cfg: { platformAddress: string; houseEdgeBp: number; confirmations: number },
  capacityCkb: string | number,
): Promise<string> {
  const client = signer.client;
  const [{ hash }, depsLottery, depsAlways] = await Promise.all([
    getTipHeader(client),
    getLotteryCellDeps(client),
    getAlwaysSuccessCellDeps(client),
  ]);
  const platformLock = (await ccc.Address.fromString(cfg.platformAddress, client)).script;
  const ph = scriptToHash(platformLock) as `0x${string}`;
  const type = getLotteryTypeScriptWithArgs({ platformLockHash: ph, houseEdgeBp: cfg.houseEdgeBp, confirmations: cfg.confirmations });
  const addr = await signer.getRecommendedAddress();
  const walletLock = (await ccc.Address.fromString(addr, client)).script;
  const depsWallet = await getWalletLockCellDeps(client, walletLock);
  const capacity = BigInt(ccc.fixedPointFrom(capacityCkb));
  const tx = ccc.Transaction.from({
    cellDeps: [...depsLottery, ...depsAlways, ...depsWallet],
    headerDeps: [hash],
    outputs: [{ lock: getAlwaysSuccessLock(), type, capacity }],
    outputsData: [encodePotData()],
  });
  logRawTx('init:create_pot', tx);
  await tx.completeInputsByCapacity(signer);
  logRawTx('afterInputs:create_pot', tx);
  await tx.completeFeeBy(signer);
  logRawTx('final:create_pot', tx);
  return signer.sendTransaction(tx);
}

export async function settleLotteryMyWins(
  signer: ccc.Signer,
  cfg: { platformAddress: string; confirmations: number; houseEdgeBp: number },
  bets: ccc.Cell[],
  loserBets: ccc.Cell[],
  pot?: ccc.Cell,
): Promise<string> {
  const client = signer.client;
  const [{ hash, number }, depsLottery, depsAlways] = await Promise.all([getTipHeader(client), getLotteryCellDeps(client), getAlwaysSuccessCellDeps(client)]);
  const addr = await signer.getRecommendedAddress();
  const walletLock = (await ccc.Address.fromString(addr, client)).script;
  const myHash = scriptToHash(walletLock);
  const platformLock = (await ccc.Address.fromString(cfg.platformAddress, client)).script;
  const depsWallet = await getWalletLockCellDeps(client, walletLock);
  const depsPlatform = await getWalletLockCellDeps(client, platformLock);
  const headersSet = new Set<string>();
  let confEff = cfg.confirmations;
  let edgeEff = cfg.houseEdgeBp;
  const first = bets[0] ?? loserBets[0] ?? pot;
  const a = (first as any)?.cellOutput?.type?.args as `0x${string}` | undefined;
  if (a) {
    const dec = decodeLotteryTypeArgs(a);
    confEff = dec.confirmations;
    edgeEff = dec.houseEdgeBp;
    const phCfg = scriptToHash(platformLock);
    if (phCfg.toLowerCase() !== dec.platformLockHash.toLowerCase()) {
      throw new Error(`平台锁与脚本参数不一致: cfg ${phCfg} != args ${dec.platformLockHash}`);
    }
  }
  let winnersStake = BigInt(0);
  let payoutTotal = BigInt(0);
  let feeTotal = BigInt(0);
  const inputs: any[] = [];
  for (const c of bets) {
    const d = decodeLotteryBetData(c.outputData);
    const created = await getCellCreationBlockNumber(client, c);
    if (created == null) continue;
    const hCreated1 = await client.getHeaderByNumber(created);
    const target = created + BigInt(confEff);
    if (BigInt(number) < target) continue;
    const h = await client.getHeaderByNumber(target);
    if (!h?.hash) continue;
    const nib1 = parseInt(h.hash.slice(-1), 16);
    const win = (d.guess === 0 && nib1 < 8) || (d.guess === 1 && nib1 >= 8);
    if (win && d.bettorLockHash.toLowerCase() === myHash.toLowerCase()) {
      if (hCreated1?.hash) headersSet.add(hCreated1.hash);
      headersSet.add(h.hash);
      winnersStake += d.stakeShannons;
      const payout = (d.stakeShannons * BigInt(10000 - edgeEff)) / BigInt(10000);
      const fee = (d.stakeShannons * BigInt(edgeEff) + BigInt(9999)) / BigInt(10000);
      payoutTotal += payout;
      feeTotal += fee;
      inputs.push(ccc.CellInput.from({ previousOutput: c.outPoint }));
    }
  }
  let potIn = BigInt(0);
  let selectedLosersStake = BigInt(0);
  const needFromLosers = payoutTotal;
  const usedLosers = new Set<string>();
  const losersShuffled = [...loserBets].sort(() => Math.random() - 0.5);
  for (const c of losersShuffled) {
    if (selectedLosersStake >= needFromLosers) break;
    const d = decodeLotteryBetData(c.outputData);
    const created = await getCellCreationBlockNumber(client, c);
    if (created == null) continue;
    const hCreated2 = await client.getHeaderByNumber(created);
    const target = created + BigInt(confEff);
    if (BigInt(number) < target) continue;
    const h = await client.getHeaderByNumber(target);
    if (!h?.hash) continue;
    const nib2 = parseInt(h.hash.slice(-1), 16);
    const win = (d.guess === 0 && nib2 < 8) || (d.guess === 1 && nib2 >= 8);
    if (!win) {
      const key = `${c.outPoint.txHash}:${c.outPoint.index}`;
      usedLosers.add(key);
      if (hCreated2?.hash) headersSet.add(hCreated2.hash);
      headersSet.add(h.hash);
      selectedLosersStake += d.stakeShannons;
      inputs.push(ccc.CellInput.from({ previousOutput: c.outPoint }));
    }
  }

  if (winnersStake === BigInt(0)) {
    throw new Error('当前账户暂无已确认且中奖的下注');
  }

  if (selectedLosersStake < payoutTotal) {
    const shortfall = payoutTotal - selectedLosersStake;
    if (!pot) {
      throw new Error('输家不足以覆盖中奖利润，且无奖池可用');
    }
    potIn = pot.cellOutput.capacity;
    if (potIn < shortfall) {
      throw new Error('奖池与输家总额不足以覆盖中奖利润');
    }
    inputs.push(ccc.CellInput.from({ previousOutput: pot.outPoint }));
  }

  let baseOutCap = potIn + selectedLosersStake - payoutTotal;
  if (baseOutCap < MIN_POT_CAPACITY_SHANNONS) {
    for (const c of losersShuffled) {
      if (baseOutCap >= MIN_POT_CAPACITY_SHANNONS) break;
      const key = `${c.outPoint.txHash}:${c.outPoint.index}`;
      if (usedLosers.has(key)) continue;
      const d = decodeLotteryBetData(c.outputData);
      const created = await getCellCreationBlockNumber(client, c);
      if (created == null) continue;
      const hCreated3 = await client.getHeaderByNumber(created);
      const target = created + BigInt(confEff);
      if (BigInt(number) < target) continue;
      const h3 = await client.getHeaderByNumber(target);
      if (!h3?.hash) continue;
      const nib3 = parseInt(h3.hash.slice(-1), 16);
      const win3 = (d.guess === 0 && nib3 < 8) || (d.guess === 1 && nib3 >= 8);
      if (!win3) {
        usedLosers.add(key);
        if (hCreated3?.hash) headersSet.add(hCreated3.hash);
        headersSet.add(h3.hash);
        selectedLosersStake += d.stakeShannons;
        inputs.push(ccc.CellInput.from({ previousOutput: c.outPoint }));
        baseOutCap = potIn + selectedLosersStake - payoutTotal;
      }
    }
  }

  if (baseOutCap < MIN_POT_CAPACITY_SHANNONS) {
    const listed = await listLotteryCells(client, { platformLockHash: scriptToHash(platformLock) as `0x${string}`, houseEdgeBp: edgeEff, confirmations: confEff }, 20);
    for (const p of listed.pots) {
      if (baseOutCap >= MIN_POT_CAPACITY_SHANNONS) break;
      if (pot && (p.outPoint.txHash === pot.outPoint.txHash && p.outPoint.index === pot.outPoint.index)) continue;
      inputs.push(ccc.CellInput.from({ previousOutput: p.outPoint }));
      potIn += p.cellOutput.capacity;
      baseOutCap = potIn + selectedLosersStake - payoutTotal;
    }
  }

  if (baseOutCap < MIN_POT_CAPACITY_SHANNONS) {
    throw new Error('输家与奖池不足以维持最小奖池容量，无法使用钱包补足');
  }

  const outputs: any[] = [];
  const outputsData: (`0x${string}`)[] = [];
  outputs.push({ lock: walletLock, capacity: winnersStake + payoutTotal });
  outputsData.push('0x');
  {
    const outCap = baseOutCap;
    if (pot) {
      outputs.push({ lock: pot.cellOutput.lock, type: pot.cellOutput.type, capacity: outCap });
      outputsData.push(encodePotData());
    } else {
      const typeOut = getLotteryTypeScriptWithArgs({ platformLockHash: scriptToHash(platformLock) as `0x${string}`, houseEdgeBp: edgeEff, confirmations: confEff });
      const lockOut = getAlwaysSuccessLock();
      outputs.push({ lock: lockOut, type: typeOut, capacity: outCap });
      outputsData.push(encodePotData());
    }
  }

  const headerDepsList = Array.from(headersSet);
  if (!headerDepsList.includes(hash)) headerDepsList.push(hash);

  const mergedDeps = [...depsLottery, ...depsAlways, ...depsWallet, ...depsPlatform];
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
  logRawTx('init:settle', tx);
  console.info('SettleDebug', {
    winnersStake: winnersStake.toString(),
    payoutTotal: payoutTotal.toString(),
    feeTotal: feeTotal.toString(),
    potIn: potIn.toString(),
    selectedLosersStake: selectedLosersStake.toString(),
    headerDeps: headerDepsList
  });
  await tx.completeInputsByCapacity(signer);
  logRawTx('afterInputs:settle', tx);
  await tx.completeFeeBy(signer);
  logRawTx('final:settle', tx);
  const signed = await signer.signTransaction(tx);
  return await signer.client.sendTransaction(signed, 'passthrough');
}

export async function listLotteryCells(
  client: ccc.Client,
  cfg: { platformLockHash: `0x${string}`; houseEdgeBp: number; confirmations: number },
  limit: number = 50,
): Promise<{ bets: ccc.Cell[]; pots: ccc.Cell[] }> {
  const type = getLotteryTypeScriptWithArgs(cfg);
  const bets: ccc.Cell[] = [];
  const pots: ccc.Cell[] = [];
  let count = 0;
  for await (const cell of client.findCellsByType(type, true, 'desc', limit)) {
    const d = (cell as any).outputData as `0x${string}`;
    if (d && d.length >= 2 && d.slice(0, 4).toLowerCase() === '0x01') {
      pots.push(cell);
    } else {
      bets.push(cell);
    }
    count++;
    if (count >= limit) break;
  }
  return { bets, pots };
}

export async function transferPotToNormalCell(
  signer: ccc.Signer,
  pot: ccc.Cell,
  toAddress: string,
): Promise<string> {
  const client = signer.client;
  const [{ hash }, depsLottery, depsAlways] = await Promise.all([
    getTipHeader(client),
    getLotteryCellDeps(client),
    getAlwaysSuccessCellDeps(client),
  ]);
  const addr = await ccc.Address.fromString(toAddress, client);
  const toLock = addr.script;
  const walletAddr = await signer.getRecommendedAddress();
  const walletLock = (await ccc.Address.fromString(walletAddr, client)).script;
  const depsWallet = await getWalletLockCellDeps(client, walletLock);
  const input = ccc.CellInput.from({ previousOutput: pot.outPoint });
  const tx = ccc.Transaction.from({
    cellDeps: [...depsLottery, ...depsAlways, ...depsWallet],
    headerDeps: [hash],
    inputs: [input],
    outputs: [{ lock: toLock, capacity: pot.cellOutput.capacity }],
    outputsData: ['0x'],
  });
  logRawTx('init:transfer_pot', tx);
  await tx.completeInputsByCapacity(signer);
  logRawTx('afterInputs:transfer_pot', tx);
  await tx.completeFeeBy(signer);
  logRawTx('final:transfer_pot', tx);
  return signer.sendTransaction(tx);
}

function scriptEq(a: any, b: any): boolean {
  return !!a && !!b && a.codeHash?.toLowerCase() === b.codeHash?.toLowerCase() && a.hashType === b.hashType;
}

export async function getWalletLockCellDeps(client: ccc.Client, walletLock: any): Promise<ccc.CellDep[]> {
  const scriptsMap = (client as any)?.scripts ?? {};

  const prefer = [
    offckb.systemScripts.omnilock?.script,
    offckb.systemScripts.secp256k1_blake160_sighash_all?.script,
    offckb.systemScripts.secp256k1_blake160_multisig_all?.script,
    offckb.systemScripts.anyone_can_pay?.script,
  ];
  const fallback = [
    scriptsMap[KnownScript.OmniLock],
    scriptsMap[KnownScript.Secp256k1Blake160],
    scriptsMap[KnownScript.Secp256k1Multisig],
    scriptsMap[KnownScript.AnyoneCanPay],
    scriptsMap[KnownScript.JoyId]
  ];
  for (const s of [...prefer, ...fallback]) {
    if (!s) continue;
    if (scriptEq(walletLock, s)) {
      return client.getCellDeps(s.cellDeps);
    }
  }
  return [];
}

export async function getTipHeader(client: ccc.Client): Promise<{ hash: string; number: bigint }> {
  const header = await client.getTipHeader();
  return { hash: header.hash, number: BigInt(header.number) };
}
