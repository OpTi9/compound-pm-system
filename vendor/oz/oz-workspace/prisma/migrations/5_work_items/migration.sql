-- WorkItem queue table for orchestrator-driven autonomous PM workflows
CREATE TABLE "WorkItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "payload" TEXT NOT NULL DEFAULT '{}',

  "roomId" TEXT,
  "agentId" TEXT,
  "sourceTaskId" TEXT,

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
  CONSTRAINT "WorkItem_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "WorkItem_status_leaseExpiresAt_idx" ON "WorkItem"("status", "leaseExpiresAt");
CREATE INDEX "WorkItem_roomId_idx" ON "WorkItem"("roomId");
CREATE INDEX "WorkItem_agentId_idx" ON "WorkItem"("agentId");
CREATE INDEX "WorkItem_sourceTaskId_idx" ON "WorkItem"("sourceTaskId");
