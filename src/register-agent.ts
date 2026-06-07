import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
} from "viem";
import { arcTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const RPC_URL = process.env.RPC_URL!;
const PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY! as `0x${string}`;
const METADATA_URI = process.env.METADATA_URI!;

const IDENTITY_REGISTRY =
  "0x8004A818BFB912233c491871b3d84c89A494BD9e";

const account = privateKeyToAccount(PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: arcTestnet,
  transport: http(RPC_URL),
});

async function main() {
  console.log("Wallet:", account.address);

  const identityContract = getContract({
    address: IDENTITY_REGISTRY,
    abi: [
      {
        name: "register",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "metadataURI", type: "string" }],
        outputs: [],
      },
    ],
    client: {
      public: publicClient,
      wallet: walletClient,
    },
  });

  const tx = await identityContract.write.register([
    METADATA_URI,
  ]);

  console.log("TX:", tx);

  const receipt =
    await publicClient.waitForTransactionReceipt({
      hash: tx,
    });

  console.log("Success!");
  console.log("Block:", receipt.blockNumber);
}

main().catch(console.error);