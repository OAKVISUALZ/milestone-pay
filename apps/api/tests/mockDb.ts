export class InMemoryDatabase {
  public authChallenges: Map<string, any> = new Map();
  public projects: Map<string, any> = new Map();
  public milestones: Map<string, any> = new Map();
  public indexerStates: Map<string, any> = new Map();
  public processedEvents: Map<string, any> = new Map();

  public reset() {
    this.authChallenges.clear();
    this.projects.clear();
    this.milestones.clear();
    this.indexerStates.clear();
    this.processedEvents.clear();
  }

  public get prismaMock() {
    return {
      authChallenge: {
        create: async ({ data }: any) => {
          const record = { id: `ch_${Date.now()}_${Math.random()}`, ...data };
          this.authChallenges.set(data.nonce, record);
          return record;
        },
        findUnique: async ({ where }: any) => {
          if (where.nonce) return this.authChallenges.get(where.nonce) || null;
          return null;
        },
        update: async ({ where, data }: any) => {
          for (const [nonce, item] of this.authChallenges.entries()) {
            if (item.id === where.id || item.nonce === where.nonce) {
              const updated = { ...item, ...data };
              this.authChallenges.set(nonce, updated);
              return updated;
            }
          }
          return null;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const [nonce, item] of this.authChallenges.entries()) {
            const matchId = !where.id || item.id === where.id;
            const matchUsed = where.used === undefined || item.used === where.used;
            if (matchId && matchUsed) {
              this.authChallenges.set(nonce, { ...item, ...data });
              count++;
            }
          }
          return { count };
        },
      },
      project: {
        findFirst: async ({ where }: any) => {
          for (const p of this.projects.values()) {
            const matchAgreement = where?.agreementId === undefined || p.agreementId === where.agreementId;
            if (matchAgreement) return p;
          }
          return null;
        },
        create: async ({ data, include }: any) => {
          const id = `proj_${Date.now()}_${Math.random()}`;
          const milestonesData = data.milestones?.create ? [data.milestones.create] : [];
          const projectRecord = {
            id,
            agreementId: data.agreementId ?? null,
            title: data.title,
            description: data.description,
            clientAddress: data.clientAddress,
            freelancerAddress: data.freelancerAddress,
            tokenAddress: data.tokenAddress,
            status: data.status ?? "ACTIVE",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          this.projects.set(id, projectRecord);

          const createdMilestones: any[] = [];
          for (const ms of milestonesData) {
            const msId = `ms_${Date.now()}_${Math.random()}`;
            const msRecord = {
              id: msId,
              projectId: id,
              milestoneIndex: ms.milestoneIndex ?? 1,
              title: ms.title,
              deliverableCriteria: ms.deliverableCriteria,
              amountStroops: ms.amountStroops,
              status: ms.status ?? "CREATED",
              deliverableUrl: null,
              deliverableNotes: null,
              deliverableHash: null,
              deliverableSubmittedAt: null,
              fundedTxHash: null,
              releasedTxHash: null,
              refundedTxHash: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            this.milestones.set(msId, msRecord);
            createdMilestones.push(msRecord);
          }

          if (include?.milestones) {
            return { ...projectRecord, milestones: createdMilestones };
          }
          return projectRecord;
        },
        findMany: async ({ where, skip = 0, take = 10, include }: any) => {
          let list = Array.from(this.projects.values());
          if (where?.OR) {
            list = list.filter((p) =>
              where.OR.some(
                (cond: any) =>
                  (cond.clientAddress && p.clientAddress === cond.clientAddress) ||
                  (cond.freelancerAddress && p.freelancerAddress === cond.freelancerAddress)
              )
            );
          }
          const paginated = list.slice(skip, skip + take);
          if (include?.milestones) {
            return paginated.map((p) => ({
              ...p,
              milestones: Array.from(this.milestones.values()).filter((m) => m.projectId === p.id),
            }));
          }
          return paginated;
        },
        count: async () => this.projects.size,
        findUnique: async ({ where, include }: any) => {
          let p = null;
          if (where.id) p = this.projects.get(where.id);
          else if (where.agreementId) {
            p = Array.from(this.projects.values()).find((x) => x.agreementId === where.agreementId);
          }
          if (!p) return null;
          if (include?.milestones) {
            return {
              ...p,
              milestones: Array.from(this.milestones.values()).filter((m) => m.projectId === p.id),
            };
          }
          return p;
        },
        update: async ({ where, data, include }: any) => {
          const p = this.projects.get(where.id);
          if (!p) return null;
          const updated = { ...p, ...data, updatedAt: new Date() };
          this.projects.set(where.id, updated);
          if (include?.milestones) {
            return {
              ...updated,
              milestones: Array.from(this.milestones.values()).filter((m) => m.projectId === p.id),
            };
          }
          return updated;
        },
      },
      milestone: {
        findUnique: async ({ where, include }: any) => {
          const ms = this.milestones.get(where.id);
          if (!ms) return null;
          if (include?.project) {
            return { ...ms, project: this.projects.get(ms.projectId) };
          }
          return ms;
        },
        update: async ({ where, data }: any) => {
          const ms = this.milestones.get(where.id);
          if (!ms) return null;
          const updated = { ...ms, ...data, updatedAt: new Date() };
          this.milestones.set(where.id, updated);
          return updated;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const [id, ms] of this.milestones.entries()) {
            if (
              (!where.projectId || ms.projectId === where.projectId) &&
              (!where.milestoneIndex || ms.milestoneIndex === where.milestoneIndex)
            ) {
              this.milestones.set(id, { ...ms, ...data, updatedAt: new Date() });
              count++;
            }
          }
          return { count };
        },
        findMany: async ({ where }: any) => {
          return Array.from(this.milestones.values()).filter(
            (m) => !where.projectId || m.projectId === where.projectId
          );
        },
      },
      indexerState: {
        findUnique: async () => this.indexerStates.get("default") || null,
        create: async ({ data }: any) => {
          this.indexerStates.set("default", { ...data, updatedAt: new Date() });
          return this.indexerStates.get("default");
        },
        update: async ({ data }: any) => {
          const curr = this.indexerStates.get("default") || {};
          const updated = { ...curr, ...data, updatedAt: new Date() };
          this.indexerStates.set("default", updated);
          return updated;
        },
      },
      processedEvent: {
        findUnique: async ({ where }: any) => this.processedEvents.get(where.id) || null,
        create: async ({ data }: any) => {
          this.processedEvents.set(data.id, { ...data, processedAt: new Date() });
          return this.processedEvents.get(data.id);
        },
      },
    };
  }
}
