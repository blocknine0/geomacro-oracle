import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import type { AgentSide } from "./agents";

export const AGENT_ARENA_ADDRESS = "0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D";

/** USDC on Arc is the native gas token with 18 decimals (see src/lib/arc.ts). */
export const ARC_USDC_DECIMALS = 18;

export const AGENT_ARENA_ABI = [
  "function createMarket(string marketId)",
  "function stake(string marketId, uint8 side) payable",
  "function declareWinner(string marketId, uint8 winningSide)",
  "function claim(string marketId)",
  "function getMarket(string marketId) view returns (uint8 status, uint8 winner, uint256 hawkTotal, uint256 doveTotal)",
  "function getMyStake(string marketId, address user) view returns (uint256 hawkAmount, uint256 doveAmount)",
] as const;

export const SIDE_CODE: Record<AgentSide, 1 | 2> = { HAWK: 1, DOVE: 2 };
export const SIDE_FROM_CODE: Record<number, AgentSide | null> = {
  0: null,
  1: "HAWK",
  2: "DOVE",
};

export type OnchainMarket = {
  status: number;
  winner: AgentSide | null;
  winnerCode: number;
  hawkTotalWei: bigint;
  doveTotalWei: bigint;
  hawkTotalUsdc: number;
  doveTotalUsdc: number;
  resolved: boolean;
};

export type OnchainStake = {
  hawkWei: bigint;
  doveWei: bigint;
  hawkUsdc: number;
  doveUsdc: number;
};

function getProvider() {
  const eth = (typeof window !== "undefined" ? window.ethereum : undefined) as
    | { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
    | undefined;
  if (!eth) throw new Error("No EVM wallet detected");
  return new BrowserProvider(eth as unknown as ConstructorParameters<typeof BrowserProvider>[0]);
}

function weiToUsdc(wei: bigint): number {
  return Number(formatUnits(wei, ARC_USDC_DECIMALS));
}

export function usdcToWei(amount: string | number): bigint {
  const s = typeof amount === "number" ? amount.toString() : amount;
  return parseUnits(s, ARC_USDC_DECIMALS);
}

export async function readMarket(marketId: string): Promise<OnchainMarket> {
  const provider = getProvider();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_ABI, provider);
  const r = (await contract.getMarket(marketId)) as [bigint, bigint, bigint, bigint];
  const status = Number(r[0]);
  const winnerCode = Number(r[1]);
  const hawkTotalWei = r[2];
  const doveTotalWei = r[3];
  return {
    status,
    winnerCode,
    winner: SIDE_FROM_CODE[winnerCode] ?? null,
    hawkTotalWei,
    doveTotalWei,
    hawkTotalUsdc: weiToUsdc(hawkTotalWei),
    doveTotalUsdc: weiToUsdc(doveTotalWei),
    resolved: winnerCode === 1 || winnerCode === 2,
  };
}

export async function readMyStake(marketId: string, user: string): Promise<OnchainStake> {
  const provider = getProvider();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_ABI, provider);
  const r = (await contract.getMyStake(marketId, user)) as [bigint, bigint];
  return {
    hawkWei: r[0],
    doveWei: r[1],
    hawkUsdc: weiToUsdc(r[0]),
    doveUsdc: weiToUsdc(r[1]),
  };
}

export async function stakeOnContract(
  marketId: string,
  side: AgentSide,
  amountUsdc: string | number,
): Promise<string> {
  const provider = getProvider();
  const signer = await provider.getSigner();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_ABI, signer);
  const value = usdcToWei(amountUsdc);
  const tx = await contract.stake(marketId, SIDE_CODE[side], { value });
  return tx.hash as string;
}

export async function claimOnContract(marketId: string): Promise<string> {
  const provider = getProvider();
  const signer = await provider.getSigner();
  const contract = new Contract(AGENT_ARENA_ADDRESS, AGENT_ARENA_ABI, signer);
  const tx = await contract.claim(marketId);
  await tx.wait();
  return tx.hash as string;
}
