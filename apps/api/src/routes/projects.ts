import { Router, Request, Response } from "express";
import {
  CreateProjectSchema,
  SubmitDeliverableSchema,
  RecordContractAgreementSchema,
} from "@milestone-pay/shared";
import { prisma } from "../db/client.js";

export const projectsRouter = Router();

// Middleware to extract authenticated wallet address from Authorization header
function getAuthAddress(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  try {
    const raw = Buffer.from(authHeader.slice(7), "base64").toString("utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.exp && parsed.exp < Date.now()) {
      return null;
    }
    return parsed.sub || null;
  } catch {
    return null;
  }
}

/**
 * POST /api/projects
 * Create a new project draft with one initial milestone.
 */
projectsRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const caller = getAuthAddress(req);
  if (!caller) {
    res.status(401).json({ error: "Unauthorized: Missing or invalid authentication token" });
    return;
  }

  const parseResult = CreateProjectSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: "Validation failed",
      details: parseResult.error.flatten(),
    });
    return;
  }

  const {
    title,
    description,
    freelancerAddress,
    tokenAddress,
    milestoneTitle,
    amountStroops,
    deliverableCriteria,
  } = parseResult.data;

  if (caller === freelancerAddress) {
    res.status(400).json({ error: "Client address and freelancer address cannot be identical" });
    return;
  }

  try {
    const project = await prisma.project.create({
      data: {
        title,
        description,
        clientAddress: caller,
        freelancerAddress,
        tokenAddress,
        status: "ACTIVE",
        milestones: {
          create: {
            milestoneIndex: 1,
            title: milestoneTitle,
            deliverableCriteria,
            amountStroops,
            status: "CREATED",
          },
        },
      },
      include: {
        milestones: true,
      },
    });

    res.status(201).json({
      success: true,
      project,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create project", message: err.message });
  }
});

/**
 * GET /api/projects
 * List projects with pagination and participant address filtering.
 */
projectsRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
  const address = req.query.address as string | undefined;

  const whereClause: any = {};
  if (address) {
    whereClause.OR = [
      { clientAddress: address },
      { freelancerAddress: address },
    ];
  }

  try {
    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { milestones: true },
      }),
      prisma.project.count({ where: whereClause }),
    ]);

    res.json({
      data: projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch projects", message: err.message });
  }
});

/**
 * GET /api/projects/:id
 * Retrieve project details by ID with milestones.
 */
projectsRouter.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: { milestones: true },
    });

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json({ data: project });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch project", message: err.message });
  }
});

/**
 * POST /api/projects/:id/link-contract
 * Link off-chain project to confirmed on-chain agreement ID.
 */
projectsRouter.post("/:id/link-contract", async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const parseResult = RecordContractAgreementSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      error: "Invalid link payload",
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { agreementId, clientAddress, freelancerAddress, tokenAddress } = parseResult.data;

  try {
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    if (project.clientAddress !== clientAddress || project.freelancerAddress !== freelancerAddress) {
      res.status(403).json({ error: "Participant addresses do not match agreement parameters" });
      return;
    }

    const updated = await prisma.project.update({
      where: { id },
      data: {
        agreementId,
        tokenAddress,
      },
      include: { milestones: true },
    });

    res.json({ success: true, project: updated });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to link agreement", message: err.message });
  }
});

/**
 * POST /api/milestones/:id/deliverable
 * Freelancer submits off-chain deliverable reference.
 */
projectsRouter.post("/milestones/:id/deliverable", async (req: Request, res: Response): Promise<void> => {
  const caller = getAuthAddress(req);
  if (!caller) {
    res.status(401).json({ error: "Unauthorized: Wallet authentication required" });
    return;
  }

  const parseResult = SubmitDeliverableSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: "Validation failed",
      details: parseResult.error.flatten(),
    });
    return;
  }

  const id = req.params.id as string;
  const { deliverableUrl, notes, commitOrHash } = parseResult.data;

  try {
    const milestone: any = await prisma.milestone.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!milestone) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }

    if (milestone.project?.freelancerAddress !== caller) {
      res.status(403).json({ error: "Only the designated freelancer can submit deliverables" });
      return;
    }

    const updated = await prisma.milestone.update({
      where: { id },
      data: {
        deliverableUrl,
        deliverableNotes: notes,
        deliverableHash: commitOrHash || null,
        deliverableSubmittedAt: new Date(),
      },
    });

    res.json({
      success: true,
      milestone: updated,
      message: "Deliverable reference recorded off-chain. Note: Release requires explicit on-chain approval by client.",
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to submit deliverable", message: err.message });
  }
});
