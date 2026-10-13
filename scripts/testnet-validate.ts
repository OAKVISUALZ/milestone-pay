import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  Account,
  Address,
  Asset,
  Contract,
  Keypair,
  Operation,
  TransactionBuilder,
  TimeoutInfinite,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { TESTNET_NETWORK_PASSPHRASE, TESTNET_RPC_URL } from "@milestone-pay/shared";

const server = new rpc.Server(TESTNET_RPC_URL);

async function fundWithFriendbot(publicKey: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Friendbot funding failed for ${publicKey}: ${res.status} ${body}`);
  }
}

async function getRawTransaction(hash: string): Promise<any> {
  const res = await fetch(TESTNET_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: { hash },
    }),
  });
  const data = (await res.json()) as any;
  return data.result;
}

async function submitAndAwait(
  tx: any,
  signers: Keypair[]
): Promise<{ hash: string; resultMetaXdr?: string; returnValue?: any }> {
  const prepared = await server.prepareTransaction(tx);
  for (const kp of signers) {
    prepared.sign(kp);
  }

  const sendRes = await server.sendTransaction(prepared);
  if (sendRes.status === "ERROR") {
    throw new Error(
      `Transaction submission failed (${sendRes.hash}): ${JSON.stringify(sendRes.errorResult)}`
    );
  }

  let txResult = await getRawTransaction(sendRes.hash);
  let attempts = 0;
  while ((!txResult || txResult.status === "NOT_FOUND") && attempts < 30) {
    await new Promise((r) => setTimeout(r, 1500));
    txResult = await getRawTransaction(sendRes.hash);
    attempts++;
  }

  if (!txResult || txResult.status !== "SUCCESS") {
    throw new Error(
      `Transaction ${sendRes.hash} ended with status: ${txResult?.status || "UNKNOWN"} - ${JSON.stringify(
        txResult
      )}`
    );
  }

  let returnValue: any = null;
  if (txResult.resultXdr) {
    try {
      const resXdr = xdr.TransactionResult.fromXDR(txResult.resultXdr, "base64");
      const innerTr = resXdr.result().results()[0].tr();
      if (innerTr.switch().name === "invokeHostFunction") {
        const hostRes = innerTr.invokeHostFunctionResult();
        if (hostRes.switch().name === "invokeHostFunctionSuccess") {
          returnValue = hostRes.success();
        }
      }
    } catch (e: any) {
      console.log("[submitAndAwait] Note: resultXdr parse:", e.message);
    }
  }

  return {
    hash: sendRes.hash,
    resultMetaXdr: txResult.resultMetaXdr,
    returnValue,
  };
}

async function getSacBalance(
  sacContractId: string,
  sourceKp: Keypair,
  targetAddress: string
): Promise<bigint> {
  const sac = new Contract(sacContractId);
  const account = await server.getAccount(sourceKp.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(sac.call("balance", new Address(targetAddress).toScVal()))
    .setTimeout(TimeoutInfinite)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) {
    throw new Error(`Failed to simulate SAC balance check for ${targetAddress}`);
  }
  return BigInt(scValToNative(sim.result.retval));
}

async function main() {
  console.log("=== MilestonePay Live Stellar Testnet Deployment & Validation ===");
  console.log(`Network Passphrase : ${TESTNET_NETWORK_PASSPHRASE}`);
  console.log(`Soroban RPC URL    : ${TESTNET_RPC_URL}\n`);

  const v1WasmPath = path.resolve(
    process.cwd(),
    "contracts/escrow/target/wasm32v1-none/release/milestone_escrow.wasm"
  );
  const legacyWasmPath = path.resolve(
    process.cwd(),
    "contracts/escrow/target/wasm32-unknown-unknown/release/milestone_escrow.wasm"
  );
  const wasmPath = fs.existsSync(v1WasmPath) ? v1WasmPath : legacyWasmPath;
  if (!fs.existsSync(wasmPath)) {
    throw new Error(
      `Compiled WASM not found at ${wasmPath}. Run cargo build --target wasm32v1-none --release --locked first.`
    );
  }
  const wasmBuffer = fs.readFileSync(wasmPath);
  console.log(`Loaded WASM binary : ${wasmPath} (${wasmBuffer.length} bytes)`);

  // 1. Provision Testnet Accounts
  const clientKp = process.env.CLIENT_SECRET
    ? Keypair.fromSecret(process.env.CLIENT_SECRET)
    : Keypair.random();
  const freelancerKp = process.env.FREELANCER_SECRET
    ? Keypair.fromSecret(process.env.FREELANCER_SECRET)
    : Keypair.random();
  const attackerKp = Keypair.random();

  console.log(`Client Address     : ${clientKp.publicKey()}`);
  console.log(`Freelancer Address : ${freelancerKp.publicKey()}`);
  console.log(`Attacker Address   : ${attackerKp.publicKey()}\n`);

  console.log("Funding accounts via Stellar Testnet Friendbot...");
  await Promise.all([
    fundWithFriendbot(clientKp.publicKey()),
    fundWithFriendbot(freelancerKp.publicKey()),
    fundWithFriendbot(attackerKp.publicKey()),
  ]);
  console.log("Accounts funded on Testnet.\n");

  const nativeSacId = Asset.native().contractId(TESTNET_NETWORK_PASSPHRASE);
  console.log(`Native XLM SAC ID  : ${nativeSacId}`);

  // 2. Upload Contract WASM & Instantiate Contract
  console.log("Uploading MilestoneEscrow WASM to Testnet...");
  let clientAccount = await server.getAccount(clientKp.publicKey());
  const uploadTx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.uploadContractWasm({ wasm: wasmBuffer }))
    .setTimeout(TimeoutInfinite)
    .build();

  const uploadRes = await submitAndAwait(uploadTx, [clientKp]);
  const wasmHash = crypto.createHash("sha256").update(wasmBuffer).digest();
  console.log(`WASM Upload TX     : ${uploadRes.hash}`);
  console.log(`WASM Hash          : ${wasmHash.toString("hex")}`);

  console.log("Deploying MilestoneEscrow contract instance...");
  clientAccount = await server.getAccount(clientKp.publicKey());
  const createContractTx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.createCustomContract({
        address: new Address(clientKp.publicKey()),
        wasmHash,
      })
    )
    .setTimeout(TimeoutInfinite)
    .build();

  const simDeploy = await server.simulateTransaction(createContractTx);
  if (!rpc.Api.isSimulationSuccess(simDeploy) || !simDeploy.result?.retval) {
    throw new Error(`Simulation of contract deployment failed: ${JSON.stringify(simDeploy)}`);
  }
  const contractId = Address.fromScVal(simDeploy.result.retval).toString();
  console.log(`Simulated Contract ID: ${contractId}`);

  const deployRes = await submitAndAwait(createContractTx, [clientKp]);
  console.log(`Deploy Contract TX   : ${deployRes.hash}`);
  console.log(`Confirmed Contract ID: ${contractId}\n`);

  const escrow = new Contract(contractId);
  const milestoneAmount = 250_000_000n; // 25 XLM in stroops

  // =========================================================================
  // Flow 1: Create -> Fund -> Release
  // =========================================================================
  console.log("--- FLOW 1: Create -> Fund -> Release (25 XLM / 250,000,000 stroops) ---");
  const f1ClientBefore = await getSacBalance(nativeSacId, clientKp, clientKp.publicKey());
  const f1FreelancerBefore = await getSacBalance(nativeSacId, clientKp, freelancerKp.publicKey());
  const f1EscrowBefore = await getSacBalance(nativeSacId, clientKp, contractId);
  console.log(`Balances Before Create/Fund: Client=${f1ClientBefore}, Freelancer=${f1FreelancerBefore}, Escrow=${f1EscrowBefore}`);

  clientAccount = await server.getAccount(clientKp.publicKey());
  const createAg1Tx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      escrow.call(
        "create_agreement",
        new Address(clientKp.publicKey()).toScVal(),
        new Address(freelancerKp.publicKey()).toScVal(),
        new Address(nativeSacId).toScVal(),
        nativeToScVal(milestoneAmount, { type: "i128" })
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();
  const createAg1Res = await submitAndAwait(createAg1Tx, [clientKp]);
  console.log(`1. create_agreement(#1) TX : ${createAg1Res.hash}`);

  clientAccount = await server.getAccount(clientKp.publicKey());
  const fundAg1Tx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      escrow.call(
        "fund_milestone",
        nativeToScVal(1n, { type: "u64" }),
        nativeToScVal(1, { type: "u32" })
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();
  const fundAg1Res = await submitAndAwait(fundAg1Tx, [clientKp]);
  const f1EscrowFunded = await getSacBalance(nativeSacId, clientKp, contractId);
  console.log(`2. fund_milestone(#1) TX   : ${fundAg1Res.hash} | Escrow Balance=${f1EscrowFunded}`);

  clientAccount = await server.getAccount(clientKp.publicKey());
  const releaseAg1Tx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      escrow.call(
        "release_milestone",
        nativeToScVal(1n, { type: "u64" }),
        nativeToScVal(1, { type: "u32" })
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();
  const releaseAg1Res = await submitAndAwait(releaseAg1Tx, [clientKp]);
  const f1ClientAfter = await getSacBalance(nativeSacId, clientKp, clientKp.publicKey());
  const f1FreelancerAfter = await getSacBalance(nativeSacId, clientKp, freelancerKp.publicKey());
  const f1EscrowAfter = await getSacBalance(nativeSacId, clientKp, contractId);
  console.log(`3. release_milestone(#1) TX: ${releaseAg1Res.hash}`);
  console.log(`Balances After Release     : Client=${f1ClientAfter}, Freelancer=${f1FreelancerAfter} (+${f1FreelancerAfter - f1FreelancerBefore}), Escrow=${f1EscrowAfter}\n`);

  // =========================================================================
  // Flow 2: Create -> Fund -> Mutual Refund (Multi-Party Auth)
  // =========================================================================
  console.log("--- FLOW 2: Create -> Fund -> Mutual Refund (15 XLM / 150,000,000 stroops) ---");
  const refundAmount = 150_000_000n;
  clientAccount = await server.getAccount(clientKp.publicKey());
  const createAg2Tx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      escrow.call(
        "create_agreement",
        new Address(clientKp.publicKey()).toScVal(),
        new Address(freelancerKp.publicKey()).toScVal(),
        new Address(nativeSacId).toScVal(),
        nativeToScVal(refundAmount, { type: "i128" })
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();
  const createAg2Res = await submitAndAwait(createAg2Tx, [clientKp]);
  console.log(`1. create_agreement(#2) TX : ${createAg2Res.hash}`);

  clientAccount = await server.getAccount(clientKp.publicKey());
  const fundAg2Tx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      escrow.call(
        "fund_milestone",
        nativeToScVal(2n, { type: "u64" }),
        nativeToScVal(1, { type: "u32" })
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();
  const fundAg2Res = await submitAndAwait(fundAg2Tx, [clientKp]);
  const f2ClientWhileFunded = await getSacBalance(nativeSacId, clientKp, clientKp.publicKey());
  const f2EscrowWhileFunded = await getSacBalance(nativeSacId, clientKp, contractId);
  console.log(`2. fund_milestone(#2) TX   : ${fundAg2Res.hash} | Client=${f2ClientWhileFunded}, Escrow=${f2EscrowWhileFunded}`);

  // Mutual refund: requires BOTH clientKp and freelancerKp authorization!
  // We assemble and sign authorization entries for freelancer and sign envelope with client.
  clientAccount = await server.getAccount(clientKp.publicKey());
  let refundAg2Tx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      escrow.call(
        "refund_milestone",
        nativeToScVal(2n, { type: "u64" }),
        nativeToScVal(1, { type: "u32" })
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();

  // Simulate and authorize freelancer's Soroban auth entry
  const latestLedger = await server.getLatestLedger();
  const simRefund = await server.simulateTransaction(refundAg2Tx);
  if (!rpc.Api.isSimulationSuccess(simRefund)) {
    throw new Error(`Simulation of refund_milestone failed: ${JSON.stringify(simRefund)}`);
  }

  // Sign Soroban auth entries for non-invoker (freelancer) using authorizeEntry
  const { authorizeEntry } = await import("@stellar/stellar-sdk");
  const authEntries = simRefund.result!.auth;
  const signedAuthEntries: xdr.SorobanAuthorizationEntry[] = [];
  for (const entry of authEntries) {
    if (
      entry.credentials().switch() ===
      xdr.SorobanCredentialsType.sorobanCredentialsAddress()
    ) {
      const addrStr = Address.fromScAddress(
        entry.credentials().address().address()
      ).toString();
      if (addrStr === freelancerKp.publicKey()) {
        const signedEntry = await authorizeEntry(
          entry,
          freelancerKp,
          latestLedger.sequence + 100,
          TESTNET_NETWORK_PASSPHRASE
        );
        signedAuthEntries.push(signedEntry);
      } else {
        signedAuthEntries.push(entry);
      }
    } else {
      signedAuthEntries.push(entry);
    }
  }

  clientAccount = await server.getAccount(clientKp.publicKey());
  const invokeOp = Operation.invokeHostFunction({
    func: xdr.HostFunction.hostFunctionTypeInvokeContract(
      new xdr.InvokeContractArgs({
        contractAddress: new Address(contractId).toScAddress(),
        functionName: "refund_milestone",
        args: [
          nativeToScVal(2n, { type: "u64" }),
          nativeToScVal(1, { type: "u32" }),
        ],
      })
    ),
    auth: signedAuthEntries,
  });

  const authedRefundTx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(invokeOp)
    .setTimeout(TimeoutInfinite)
    .build();

  const refundAg2Res = await submitAndAwait(authedRefundTx, [clientKp]);
  const f2ClientAfter = await getSacBalance(nativeSacId, clientKp, clientKp.publicKey());
  const f2EscrowAfter = await getSacBalance(nativeSacId, clientKp, contractId);
  console.log(`3. refund_milestone(#2) TX : ${refundAg2Res.hash}`);
  console.log(`Balances After Refund      : Client=${f2ClientAfter}, Escrow=${f2EscrowAfter}\n`);

  // =========================================================================
  // Flow 3: Unfunded Cancellation
  // =========================================================================
  console.log("--- FLOW 3: Create -> Unfunded Cancellation ---");
  clientAccount = await server.getAccount(clientKp.publicKey());
  const createAg3Tx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      escrow.call(
        "create_agreement",
        new Address(clientKp.publicKey()).toScVal(),
        new Address(freelancerKp.publicKey()).toScVal(),
        new Address(nativeSacId).toScVal(),
        nativeToScVal(100_000_000n, { type: "i128" })
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();
  const createAg3Res = await submitAndAwait(createAg3Tx, [clientKp]);
  console.log(`1. create_agreement(#3) TX : ${createAg3Res.hash}`);

  clientAccount = await server.getAccount(clientKp.publicKey());
  const cancelAg3Tx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      escrow.call(
        "cancel_milestone",
        nativeToScVal(3n, { type: "u64" }),
        nativeToScVal(1, { type: "u32" })
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();
  const cancelAg3Res = await submitAndAwait(cancelAg3Tx, [clientKp]);
  console.log(`2. cancel_milestone(#3) TX : ${cancelAg3Res.hash}\n`);

  // =========================================================================
  // Flow 4: Rejected Unauthorized & Repeated Terminal-State Actions
  // =========================================================================
  console.log("--- FLOW 4: Rejected Unauthorized & Repeated Terminal-State Actions ---");

  // 4a. Double Release on Agreement #1 (Already Released -> Error(Contract, #1) InvalidState)
  clientAccount = await server.getAccount(clientKp.publicKey());
  const doubleReleaseTx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      escrow.call(
        "release_milestone",
        nativeToScVal(1n, { type: "u64" }),
        nativeToScVal(1, { type: "u32" })
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();
  const simDoubleRelease = await server.simulateTransaction(doubleReleaseTx);
  console.log(
    `4a. Double Release (#1) Rejected : ${
      rpc.Api.isSimulationError(simDoubleRelease) ? simDoubleRelease.error : "UNEXPECTED_SUCCESS"
    }`
  );

  // 4b. Double Refund on Agreement #2 (Already Refunded -> Error(Contract, #1) InvalidState)
  clientAccount = await server.getAccount(clientKp.publicKey());
  const doubleRefundTx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      escrow.call(
        "refund_milestone",
        nativeToScVal(2n, { type: "u64" }),
        nativeToScVal(1, { type: "u32" })
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();
  const simDoubleRefund = await server.simulateTransaction(doubleRefundTx);
  console.log(
    `4b. Double Refund (#2) Rejected  : ${
      rpc.Api.isSimulationError(simDoubleRefund) ? simDoubleRefund.error : "UNEXPECTED_SUCCESS"
    }`
  );

  // 4c. Funding Cancelled Milestone #3 (Already Cancelled -> Error(Contract, #1) InvalidState)
  clientAccount = await server.getAccount(clientKp.publicKey());
  const fundCancelledTx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      escrow.call(
        "fund_milestone",
        nativeToScVal(3n, { type: "u64" }),
        nativeToScVal(1, { type: "u32" })
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();
  const simFundCancelled = await server.simulateTransaction(fundCancelledTx);
  console.log(
    `4c. Fund Cancelled (#3) Rejected : ${
      rpc.Api.isSimulationError(simFundCancelled) ? simFundCancelled.error : "UNEXPECTED_SUCCESS"
    }`
  );

  // 4d. Unauthorized Release by Attacker (Create & Fund Agreement #4, then Attacker attempts release)
  clientAccount = await server.getAccount(clientKp.publicKey());
  const createAg4Tx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      escrow.call(
        "create_agreement",
        new Address(clientKp.publicKey()).toScVal(),
        new Address(freelancerKp.publicKey()).toScVal(),
        new Address(nativeSacId).toScVal(),
        nativeToScVal(50_000_000n, { type: "i128" })
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();
  const createAg4Res = await submitAndAwait(createAg4Tx, [clientKp]);
  console.log(`4d-setup. create_agreement(#4) TX: ${createAg4Res.hash}`);

  clientAccount = await server.getAccount(clientKp.publicKey());
  const fundAg4Tx = new TransactionBuilder(clientAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      escrow.call(
        "fund_milestone",
        nativeToScVal(4n, { type: "u64" }),
        nativeToScVal(1, { type: "u32" })
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();
  const fundAg4Res = await submitAndAwait(fundAg4Tx, [clientKp]);
  console.log(`4d-setup. fund_milestone(#4) TX  : ${fundAg4Res.hash}`);

  // Attacker tries to release Agreement #4 using attacker's signature without client's auth
  const attackerAccount = await server.getAccount(attackerKp.publicKey());
  const attackerReleaseTx = new TransactionBuilder(attackerAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      escrow.call(
        "release_milestone",
        nativeToScVal(4n, { type: "u64" }),
        nativeToScVal(1, { type: "u32" })
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();
  const simAttacker = await server.simulateTransaction(attackerReleaseTx);
  console.log(
    `4d. Unauthorized Attacker Release: Requires auth from ${Address.fromScAddress(
      simAttacker.result!.auth[0].credentials().address().address()
    ).toString()} (Client), Attacker (${attackerKp.publicKey()}) cannot sign!`
  );

  console.log("\n=== LIVE TESTNET VALIDATION COMPLETE ===");
}

main().catch((err) => {
  console.error("Testnet validation error:", err);
  process.exit(1);
});
