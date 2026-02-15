-- Add composite index for common filtered queries
CREATE INDEX "AgentRun_userId_state_idx" ON "AgentRun"("userId", "state");
