-- Add WorkItem lease owner token to prevent stale/overlapping updates across orchestrator instances.
ALTER TABLE "WorkItem" ADD COLUMN "leaseOwner" TEXT;

CREATE INDEX "WorkItem_leaseOwner_idx" ON "WorkItem"("leaseOwner");

-- Composite indexes for common multi-tenant access patterns.
CREATE INDEX "Message_roomId_userId_idx" ON "Message"("roomId", "userId");
CREATE INDEX "Task_roomId_userId_idx" ON "Task"("roomId", "userId");
CREATE INDEX "Artifact_roomId_userId_idx" ON "Artifact"("roomId", "userId");

