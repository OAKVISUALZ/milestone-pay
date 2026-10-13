import {
  Address,
  Contract,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  xdr,
  scValToNative,
} from "@stellar/stellar-sdk";
import { TESTNET_NETWORK_PASSPHRASE } from "@milestone-pay/shared";

export interface VerifyRefundEnvelopeParams {
  envelopeXdr: string;
  contractId: string;
  agreementId: number;
  milestoneIndex: number;
  clientAddress: string;
  freelancerAddress: string;
  networkPassphrase?: string;
}

export interface VerifyRefundEnvelopeResult {
  valid: boolean;
  txHash: string;
  clientSigned: boolean;
  freelancerSigned: boolean;
  error?: string;
}

/**
 * Validates a refund transaction envelope:
 * - Ensures valid XDR structure and network passphrase
 * - Ensures exactly 1 operation: refund_milestone on expected contract
 * - Validates agreementId and milestoneIndex arguments
 * - Cryptographically verifies client and freelancer signatures
 */
export function verifyRefundEnvelope(
  params: VerifyRefundEnvelopeParams
): VerifyRefundEnvelopeResult {
  const networkPassphrase = params.networkPassphrase || TESTNET_NETWORK_PASSPHRASE;

  let tx: Transaction;
  try {
    const raw = TransactionBuilder.fromXDR(params.envelopeXdr, networkPassphrase);
    if (!("operations" in raw) || !("signatures" in raw)) {
      return {
        valid: false,
        txHash: "",
        clientSigned: false,
        freelancerSigned: false,
        error: "Fee bump transactions are not supported for refund coordination",
      };
    }
    tx = raw as Transaction;
  } catch (err: any) {
    return {
      valid: false,
      txHash: "",
      clientSigned: false,
      freelancerSigned: false,
      error: `Invalid transaction envelope XDR: ${err.message}`,
    };
  }

  const txHash = tx.hash().toString("hex");

  // Validate operations: exactly 1 operation targeting refund_milestone
  if (tx.operations.length !== 1) {
    return {
      valid: false,
      txHash,
      clientSigned: false,
      freelancerSigned: false,
      error: `Expected exactly 1 operation, found ${tx.operations.length}`,
    };
  }

  const op = tx.operations[0];
  if (op.type !== "invokeHostFunction") {
    return {
      valid: false,
      txHash,
      clientSigned: false,
      freelancerSigned: false,
      error: `Unexpected operation type: ${op.type}. Expected invokeHostFunction.`,
    };
  }

  const invokeOp = op as Operation.InvokeHostFunction;
  const func = invokeOp.func;
  if (func.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()) {
    return {
      valid: false,
      txHash,
      clientSigned: false,
      freelancerSigned: false,
      error: "Host function must be InvokeContract",
    };
  }

  const invokeArgs = func.invokeContract();
  const contractAddrStr = Address.fromScAddress(invokeArgs.contractAddress()).toString();
  if (contractAddrStr !== params.contractId) {
    return {
      valid: false,
      txHash,
      clientSigned: false,
      freelancerSigned: false,
      error: `Contract mismatch: envelope targets ${contractAddrStr}, expected ${params.contractId}`,
    };
  }

  const fnName = invokeArgs.functionName().toString();
  if (fnName !== "refund_milestone") {
    return {
      valid: false,
      txHash,
      clientSigned: false,
      freelancerSigned: false,
      error: `Function mismatch: envelope invokes ${fnName}, expected refund_milestone`,
    };
  }

  const args = invokeArgs.args();
  if (args.length !== 2) {
    return {
      valid: false,
      txHash,
      clientSigned: false,
      freelancerSigned: false,
      error: `Expected 2 arguments (agreementId, milestoneIndex), found ${args.length}`,
    };
  }

  const opAgreementId = Number(scValToNative(args[0]));
  const opMilestoneIndex = Number(scValToNative(args[1]));

  if (opAgreementId !== params.agreementId || opMilestoneIndex !== params.milestoneIndex) {
    return {
      valid: false,
      txHash,
      clientSigned: false,
      freelancerSigned: false,
      error: `Argument mismatch: envelope specifies agreement #${opAgreementId}, ms #${opMilestoneIndex}. Expected agreement #${params.agreementId}, ms #${params.milestoneIndex}.`,
    };
  }

  // Cryptographic Signature Verification
  let clientSigned = false;
  let freelancerSigned = false;

  const clientKp = Keypair.fromPublicKey(params.clientAddress);
  const freelancerKp = Keypair.fromPublicKey(params.freelancerAddress);
  const hashBuffer = tx.hash();

  for (const decSig of tx.signatures) {
    const rawSig = decSig.signature();
    try {
      if (clientKp.verify(hashBuffer, rawSig)) {
        clientSigned = true;
      }
    } catch {
      // Signature mismatch
    }

    try {
      if (freelancerKp.verify(hashBuffer, rawSig)) {
        freelancerSigned = true;
      }
    } catch {
      // Signature mismatch
    }
  }

  return {
    valid: true,
    txHash,
    clientSigned,
    freelancerSigned,
  };
}

/**
 * Appends a decorated signature from a given signer to an existing transaction envelope.
 */
export function appendSignatureToEnvelope(
  envelopeXdr: string,
  signer: Keypair,
  networkPassphrase = TESTNET_NETWORK_PASSPHRASE
): string {
  const tx = TransactionBuilder.fromXDR(envelopeXdr, networkPassphrase) as Transaction;
  tx.sign(signer);
  return tx.toXDR();
}
