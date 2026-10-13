import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./app.js";
import { IndexerService } from "./indexer/service.js";

const PORT = process.env.PORT || 4000;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`[MilestonePay API] Server listening on port ${PORT}`);
  console.log(`[MilestonePay API] OpenAPI specs available at http://localhost:${PORT}/api/docs`);
});

// Start indexer if contract ID is configured
const contractId = process.env.MILESTONE_ESCROW_CONTRACT_ID;
if (contractId) {
  const indexer = new IndexerService(contractId, process.env.STELLAR_RPC_URL);
  indexer.start(parseInt(process.env.INDEXER_POLL_INTERVAL_MS || "5000"));
  console.log(`[Indexer] Started polling for contract: ${contractId}`);
} else {
  console.log("[Indexer] No MILESTONE_ESCROW_CONTRACT_ID provided; running API in metadata mode.");
}

process.on("SIGINT", () => {
  server.close(() => {
    console.log("[MilestonePay API] Server shut down gracefully.");
    process.exit(0);
  });
});
