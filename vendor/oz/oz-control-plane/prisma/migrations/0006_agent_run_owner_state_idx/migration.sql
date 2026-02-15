-- Add composite index for common filtered queries
CREATE INDEX "AgentRun_ownerKeyHash_state_idx" ON "AgentRun"("ownerKeyHash", "state");
