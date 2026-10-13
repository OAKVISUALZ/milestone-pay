import { Router, Request, Response } from "express";
import {
  ChallengeRequestSchema,
  ChallengeVerifySchema,
  TESTNET_NETWORK_PASSPHRASE,
} from "@milestone-pay/shared";
import { createAuthChallenge, verifyAuthChallenge } from "../auth/challenge.js";

export const authRouter = Router();

authRouter.post("/challenge", async (req: Request, res: Response): Promise<void> => {
  const parseResult = ChallengeRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: "Invalid request payload",
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { publicKey } = parseResult.data;
  const rawHost = (req.headers.host || "milestonepay.local").split(":")[0];
  const domain = rawHost || "milestonepay.local";
  const networkPassphrase = process.env.STELLAR_NETWORK_PASSPHRASE || TESTNET_NETWORK_PASSPHRASE;

  try {
    const challenge = await createAuthChallenge(publicKey, domain, networkPassphrase);
    res.json({
      publicKey,
      nonce: challenge.nonce,
      message: challenge.message,
      expiresAt: challenge.expiresAt.toISOString(),
      networkPassphrase,
      domain,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to generate challenge", message: err.message });
  }
});

authRouter.post("/verify", async (req: Request, res: Response): Promise<void> => {
  const parseResult = ChallengeVerifySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: "Invalid request payload",
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { publicKey, nonce, signature } = parseResult.data;
  const rawHost = (req.headers.host || "milestonepay.local").split(":")[0];
  const domain = rawHost || "milestonepay.local";
  const networkPassphrase = process.env.STELLAR_NETWORK_PASSPHRASE || TESTNET_NETWORK_PASSPHRASE;

  try {
    const verification = await verifyAuthChallenge({
      publicKey,
      nonce,
      signature,
      domain,
      networkPassphrase,
    });

    if (!verification.valid) {
      res.status(401).json({
        error: "Authentication failed",
        reason: verification.error,
      });
      return;
    }

    // Return session payload
    const token = Buffer.from(
      JSON.stringify({
        sub: publicKey,
        iat: Date.now(),
        exp: Date.now() + 24 * 60 * 60 * 1000,
      })
    ).toString("base64");

    res.json({
      success: true,
      publicKey,
      token,
      expiresIn: 86400,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Verification process failed", message: err.message });
  }
});
