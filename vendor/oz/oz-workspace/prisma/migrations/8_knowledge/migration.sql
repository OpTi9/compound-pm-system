-- Knowledge compounding storage
CREATE TABLE "KnowledgeItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "roomId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'learning',
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "tagsJson" TEXT NOT NULL DEFAULT '[]',
  "sourcePrdId" TEXT,
  "sourceWorkItemId" TEXT,
  "createdByUserId" TEXT,
  "createdByAgentId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "KnowledgeItem_sourcePrdId_fkey" FOREIGN KEY ("sourcePrdId") REFERENCES "Prd" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "KnowledgeItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "KnowledgeItem_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "KnowledgeItem_roomId_idx" ON "KnowledgeItem"("roomId");
CREATE INDEX "KnowledgeItem_kind_idx" ON "KnowledgeItem"("kind");
CREATE INDEX "KnowledgeItem_sourcePrdId_idx" ON "KnowledgeItem"("sourcePrdId");
CREATE INDEX "KnowledgeItem_sourceWorkItemId_idx" ON "KnowledgeItem"("sourceWorkItemId");
CREATE INDEX "KnowledgeItem_createdByUserId_idx" ON "KnowledgeItem"("createdByUserId");
CREATE INDEX "KnowledgeItem_createdByAgentId_idx" ON "KnowledgeItem"("createdByAgentId");
