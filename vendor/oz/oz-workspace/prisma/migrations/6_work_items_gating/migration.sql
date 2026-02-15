-- Add gating/chain fields to WorkItem for task->review->rework loops
ALTER TABLE "WorkItem" ADD COLUMN "chainId" TEXT;
ALTER TABLE "WorkItem" ADD COLUMN "sourceItemId" TEXT;
ALTER TABLE "WorkItem" ADD COLUMN "iteration" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkItem" ADD COLUMN "maxIterations" INTEGER NOT NULL DEFAULT 3;

CREATE INDEX "WorkItem_chainId_idx" ON "WorkItem"("chainId");
CREATE INDEX "WorkItem_sourceItemId_idx" ON "WorkItem"("sourceItemId");
CREATE INDEX "WorkItem_chainId_iteration_idx" ON "WorkItem"("chainId", "iteration");
