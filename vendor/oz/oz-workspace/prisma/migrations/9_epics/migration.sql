-- Epics (PRD -> Epic -> WorkItems)
PRAGMA foreign_keys=OFF;

CREATE TABLE "Epic" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "prdId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Epic_prdId_fkey" FOREIGN KEY ("prdId") REFERENCES "Prd" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Epic_prdId_idx" ON "Epic"("prdId");
CREATE INDEX "Epic_status_idx" ON "Epic"("status");
CREATE INDEX "Epic_prdId_order_idx" ON "Epic"("prdId", "order");

-- WorkItems may optionally attach to an Epic.
-- SQLite can't add FK constraints via ALTER TABLE, so we rebuild the table.
CREATE TABLE "new_WorkItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "payload" TEXT NOT NULL DEFAULT '{}',

  "chainId" TEXT,
  "sourceItemId" TEXT,
  "iteration" INTEGER NOT NULL DEFAULT 0,
  "maxIterations" INTEGER NOT NULL DEFAULT 3,

  "roomId" TEXT,
  "agentId" TEXT,
  "sourceTaskId" TEXT,
  "epicId" TEXT,

  "claimedAt" DATETIME,
  "leaseExpiresAt" DATETIME,
  "runId" TEXT,

  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "lastError" TEXT,

  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkItem_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkItem_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkItem_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Epic" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_WorkItem" (
  "id",
  "type",
  "status",
  "payload",
  "chainId",
  "sourceItemId",
  "iteration",
  "maxIterations",
  "roomId",
  "agentId",
  "sourceTaskId",
  "claimedAt",
  "leaseExpiresAt",
  "runId",
  "attempts",
  "maxAttempts",
  "lastError",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "type",
  "status",
  "payload",
  "chainId",
  "sourceItemId",
  "iteration",
  "maxIterations",
  "roomId",
  "agentId",
  "sourceTaskId",
  "claimedAt",
  "leaseExpiresAt",
  "runId",
  "attempts",
  "maxAttempts",
  "lastError",
  "createdAt",
  "updatedAt"
FROM "WorkItem";

DROP TABLE "WorkItem";
ALTER TABLE "new_WorkItem" RENAME TO "WorkItem";

CREATE INDEX "WorkItem_status_leaseExpiresAt_idx" ON "WorkItem"("status", "leaseExpiresAt");
CREATE INDEX "WorkItem_chainId_idx" ON "WorkItem"("chainId");
CREATE INDEX "WorkItem_sourceItemId_idx" ON "WorkItem"("sourceItemId");
CREATE INDEX "WorkItem_chainId_iteration_idx" ON "WorkItem"("chainId", "iteration");
CREATE INDEX "WorkItem_roomId_idx" ON "WorkItem"("roomId");
CREATE INDEX "WorkItem_agentId_idx" ON "WorkItem"("agentId");
CREATE INDEX "WorkItem_sourceTaskId_idx" ON "WorkItem"("sourceTaskId");
CREATE INDEX "WorkItem_epicId_idx" ON "WorkItem"("epicId");

PRAGMA foreign_keys=ON;
