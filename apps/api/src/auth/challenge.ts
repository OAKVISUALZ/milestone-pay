import crypto from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { TESTNET_NETWORK_PASSPHRASE } from "@milestone-pay/shared";
import { prisma } from "../db/client.js";

/**
 * Custom Ed25519 Signed-Message Challenge-Response Authentication Protocol.
 *
 * Architectural Note (SEP-10 vs Custom Challenge):
 * MilestonePay implements a custom ed25519 signed-message challenge protocol rather than
 * full SEP-10 (Stellar Web Authentication). Full SEP-10 requires the backend to hold a
 * server Stellar keypair and construct XDR transaction envelopes containing ManageData
 * operations. Because MilestonePay's backend is strictly non-custodial and holds zero
 * Stellar private keys, it issues UTF-8 domain-bound challenge strings verified directly
 * against the caller's ed25519 public key.
 */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function buildChallengeMessage(
  domain: string,
  publicKey: string,
  networkPassphrase: string,
  nonce: string
): string {
  return `${domain} auth challenge for ${publicKey} on ${networkPassphrase}: ${nonce}`;
}

export async function createAuthChallenge(
  publicKey: string,
  domain: string = "milestonepay.local",
  networkPassphrase: string = TESTNET_NETWORK_PASSPHRASE
): Promise<{ nonce: string; message: string; expiresAt: Date }> {
  const nonce = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

  await prisma.authChallenge.create({
    data: {
      publicKey,
      nonce,
      domain,
      networkPassphrase,
      expiresAt,
      used: false,
    },
  });

  const message = buildChallengeMessage(domain, publicKey, networkPassphrase, nonce);
  return { nonce, message, expiresAt };
}

export async function verifyAuthChallenge(params: {
  publicKey: string;
  nonce: string;
  signature: string;
  domain?: string;
  networkPassphrase?: string;
}): Promise<{ valid: boolean; error?: string }> {
  const domain = params.domain || "milestonepay.local";
  const networkPassphrase = params.networkPassphrase || TESTNET_NETWORK_PASSPHRASE;

  const challenge = await prisma.authChallenge.findUnique({
    where: { nonce: params.nonce },
  });

  if (!challenge) {
    return { valid: false, error: "Challenge not found" };
  }

  if (challenge.used) {
    return { valid: false, error: "Challenge has already been used (replay detected)" };
  }

  if (challenge.expiresAt < new Date()) {
    return { valid: false, error: "Challenge has expired" };
  }

  if (challenge.publicKey !== params.publicKey) {
    return { valid: false, error: "Public key mismatch" };
  }

  if (challenge.domain !== domain || challenge.networkPassphrase !== networkPassphrase) {
    return { valid: false, error: "Domain or network passphrase mismatch" };
  }

  // Construct message
  const message = buildChallengeMessage(domain, params.publicKey, networkPassphrase, params.nonce);
  const messageBuffer = Buffer.from(message, "utf-8");

  // Decode signature (support base64 or hex)
  let sigBuffer: Buffer;
  try {
    if (/^[0-9a-fA-F]+$/.test(params.signature) && params.signature.length === 128) {
      sigBuffer = Buffer.from(params.signature, "hex");
    } else {
      sigBuffer = Buffer.from(params.signature, "base64");
    }
  } catch {
    return { valid: false, error: "Malformed signature format" };
  }

  let verified = false;
  try {
    const kp = Keypair.fromPublicKey(params.publicKey);
    verified = kp.verify(messageBuffer, sigBuffer);
  } catch (err: any) {
    return { valid: false, error: `Signature verification failed: ${err.message}` };
  }

  if (!verified) {
    return { valid: false, error: "Invalid cryptographic signature" };
  }

  // Atomically consume challenge only if it has not yet been marked used (prevents concurrent TOCTOU replay)
  const consumed = await prisma.authChallenge.updateMany({
    where: { id: challenge.id, used: false },
    data: { used: true },
  });

  if (consumed.count === 0) {
    return { valid: false, error: "Challenge has already been used (replay detected)" };
  }

  return { valid: true };
}
