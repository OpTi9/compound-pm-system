-- PRDs (Product Requirements Documents)
CREATE TABLE "Prd" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "roomId" TEXT NOT NULL,
  "createdBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Prd_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Prd_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Prd_roomId_idx" ON "Prd"("roomId");
CREATE INDEX "Prd_status_idx" ON "Prd"("status");
CREATE INDEX "Prd_createdBy_idx" ON "Prd"("createdBy");
