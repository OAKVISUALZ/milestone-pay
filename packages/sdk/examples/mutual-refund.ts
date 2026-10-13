import {
  Account,
  Keypair,
  TransactionBuilder,
  Transaction,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { TESTNET_NETWORK_PASSPHRASE } from "@milestone-pay/shared";
import { MilestoneEscrowClient } from "../src/client.js";

/**
 * Runnable SDK/CLI Demonstration of Mutual Refund Multi-Party Authorization.
 *
 * In the MilestonePay Soroban contract, `refund_milestone(agreement_id, milestone_id)`
 * enforces:
 *   agreement.client.require_auth();
 *   agreement.freelancer.require_auth();
 *
 * Neither party can unilaterally seize or refund locked funds. This script demonstrates
 * the complete off-chain XDR envelope signing workflow between Client and Freelancer:
 *  1. Client constructs the `refund_milestone` transaction and signs the envelope.
 *  2. Client serializes the partially-signed envelope to Base64 XDR and shares it with Freelancer.
 *  3. Freelancer deserializes the XDR, inspects the contract invocation parameters, and co-signs.
 *  4. Both ed25519 signatures are cryptographically verified against the transaction hash.
 */
async function runMutualRefundDemo() {
  console.log("=== MilestonePay Mutual Refund Multi-Signature Demonstration ===\n");

  const contractId = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
  const clientKp = Keypair.random();
  const freelancerKp = Keypair.random();

  console.log(`Contract ID        : ${contractId}`);
  console.log(`Client Address     : ${clientKp.publicKey()}`);
  console.log(`Freelancer Address : ${freelancerKp.publicKey()}`);
  console.log(`Agreement / MS     : Agreement #1, Milestone #1\n`);

  const sdk = new MilestoneEscrowClient({
    contractId,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  });

  // Step 1: Client constructs the refund_milestone operation
  const refundOp = sdk.refundMilestoneOp({
    agreementId: 1,
    milestoneId: 1,
  });

  const sourceAccount = new Account(clientKp.publicKey(), "1000001");
  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(refundOp)
    .setTimeout(300)
    .build();

  // Client signs first
  tx.sign(clientKp);
  const partialXdr = tx.toXDR();
  console.log("[Step 1] Client constructed refund_milestone TX and signed.");
  console.log(`         Signatures on envelope: ${tx.signatures.length}`);
  console.log(`         Partial XDR (${partialXdr.length} chars): ${partialXdr.slice(0, 64)}...\n`);

  // Step 2: Freelancer receives the partial XDR, parses it, and co-signs
  const reconstructedTx = TransactionBuilder.fromXDR(
    partialXdr,
    TESTNET_NETWORK_PASSPHRASE
  ) as Transaction;

  if (reconstructedTx.operations.length !== 1 || reconstructedTx.operations[0].type !== "invokeHostFunction") {
    throw new Error("Unexpected transaction structure received by freelancer");
  }

  reconstructedTx.sign(freelancerKp);
  const finalXdr = reconstructedTx.toXDR();
  console.log("[Step 2] Freelancer inspected XDR and appended counter-signature.");
  console.log(`         Signatures on envelope: ${reconstructedTx.signatures.length}`);
  console.log(`         Final Co-Signed XDR   : ${finalXdr.slice(0, 64)}...\n`);

  // Step 3: Cryptographic verification of both signatures against the transaction hash
  const txHash = reconstructedTx.hash();
  const sig0Valid = clientKp.verify(txHash, reconstructedTx.signatures[0].signature());
  const sig1Valid = freelancerKp.verify(txHash, reconstructedTx.signatures[1].signature());

  console.log("[Step 3] Cryptographic Verification of Co-Signed Envelope:");
  console.log(`         TX Hash (Hex)         : ${txHash.toString("hex")}`);
  console.log(`         Client Sig Valid      : ${sig0Valid}`);
  console.log(`         Freelancer Sig Valid  : ${sig1Valid}\n`);

  if (!sig0Valid || !sig1Valid) {
    throw new Error("Multi-signature verification failed!");
  }

  console.log("SUCCESS: Both client and freelancer signatures verified on refund_milestone envelope.");
}

runMutualRefundDemo().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
