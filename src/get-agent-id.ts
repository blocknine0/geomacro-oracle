import "dotenv/config";
import {
  createPublicClient,
  getContract,
  http,
  parseAbiItem,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

const IDENTITY_REGISTRY =
  "0x8004A818BFB912233c491871b3d84c89A494BD9e";

const account = privateKeyToAccount(
  process.env.OWNER_PRIVATE_KEY as `0x${string}`
);

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

async function main() {
  const latestBlock = await publicClient.getBlockNumber();

  const fromBlock =
    latestBlock > 10000n ? latestBlock - 10000n : 0n;

  const transferLogs = await publicClient.getLogs({
    address: IDENTITY_REGISTRY,
    event: parseAbiItem(
      "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
    ),
    args: {
      to: account.address,
    },
    fromBlock,
    toBlock: latestBlock,
  });

  const agentId =
    transferLogs[transferLogs.length - 1].args.tokenId;

  const contract = getContract({
    address: IDENTITY_REGISTRY,
    abi: [
      {
        name: "ownerOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ type: "address" }],
      },
      {
        name: "tokenURI",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ type: "string" }],
      },
    ],
    client: publicClient,
  });

  const owner = await contract.read.ownerOf([agentId!]);
  const tokenURI = await contract.read.tokenURI([agentId!]);

  console.log("Agent ID:", agentId);
  console.log("Owner:", owner);
  console.log("Metadata URI:", tokenURI);
}

main().catch(console.error);