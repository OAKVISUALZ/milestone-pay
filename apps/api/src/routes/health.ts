import { Router, Request, Response } from "express";
import { TESTNET_RPC_URL, TESTNET_NETWORK_PASSPHRASE } from "@milestone-pay/shared";

export const healthRouter = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    network: "testnet",
    networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE || TESTNET_NETWORK_PASSPHRASE,
    rpcUrl: process.env.STELLAR_RPC_URL || TESTNET_RPC_URL,
    version: "0.1.0",
    uptimeSeconds: Math.floor(process.uptime()),
  });
});
