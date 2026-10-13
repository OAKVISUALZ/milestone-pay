import { Router, Request, Response } from "express";

export const openapiRouter = Router();

export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "MilestonePay API",
    version: "0.1.0",
    description:
      "Backend API for MilestonePay: Off-chain metadata, cryptographic wallet authentication, and Soroban escrow indexing.",
  },
  servers: [
    {
      url: "http://localhost:4000",
      description: "Local development server",
    },
  ],
  paths: {
    "/api/health": {
      get: {
        summary: "Service Health Check",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    timestamp: { type: "string" },
                    network: { type: "string", example: "testnet" },
                    version: { type: "string", example: "0.1.0" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/challenge": {
      post: {
        summary: "Generate cryptographic wallet ownership challenge",
        description: "Returns a single-use expiring nonce challenge message bound to network and domain.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["publicKey"],
                properties: {
                  publicKey: {
                    type: "string",
                    example: "GBBMY6Z3G77S6ZDR3U6L3R5J2ZCVY7W7H6T3E6KBLQ6F3J7X4H6F7K6L",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Challenge generated successfully",
          },
          "400": {
            description: "Invalid public key format",
          },
        },
      },
    },
    "/api/auth/verify": {
      post: {
        summary: "Verify signed challenge and issue session token",
        description: "Verifies the ed25519 signature of the challenge message. Burns the nonce to prevent replay.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["publicKey", "nonce", "signature"],
                properties: {
                  publicKey: { type: "string" },
                  nonce: { type: "string" },
                  signature: { type: "string", description: "Base64 or Hex signature" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Authenticated successfully",
          },
          "401": {
            description: "Signature invalid, expired, or challenge already used",
          },
        },
      },
    },
    "/api/projects": {
      get: {
        summary: "List projects with pagination",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
          { name: "address", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Paginated list of projects" },
        },
      },
      post: {
        summary: "Create a new project and initial milestone",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: [
                  "title",
                  "description",
                  "freelancerAddress",
                  "milestoneTitle",
                  "amountStroops",
                  "deliverableCriteria",
                ],
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  freelancerAddress: { type: "string" },
                  tokenAddress: { type: "string" },
                  milestoneTitle: { type: "string" },
                  amountStroops: { type: "string", description: "Base unit stroops as string" },
                  deliverableCriteria: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Project created" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/projects/{id}": {
      get: {
        summary: "Get project details by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Project details" },
          "404": { description: "Project not found" },
        },
      },
    },
    "/api/projects/{id}/link-contract": {
      post: {
        summary: "Link off-chain project to confirmed on-chain agreement ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Project linked to contract agreement" },
        },
      },
    },
    "/api/projects/milestones/{id}/deliverable": {
      post: {
        summary: "Freelancer submits off-chain deliverable reference",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["deliverableUrl", "notes"],
                properties: {
                  deliverableUrl: { type: "string" },
                  notes: { type: "string" },
                  commitOrHash: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Deliverable reference saved" },
          "403": { description: "Only assigned freelancer can submit deliverable" },
        },
      },
    },
  },
};

openapiRouter.get("/openapi.json", (_req: Request, res: Response) => {
  res.json(openapiSpec);
});

openapiRouter.get("/docs", (_req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>MilestonePay API Documentation</title>
        <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
        <script>
          window.onload = () => {
            window.ui = SwaggerUIBundle({
              url: '/api/openapi.json',
              dom_id: '#swagger-ui',
            });
          };
        </script>
      </body>
    </html>
  `);
});
