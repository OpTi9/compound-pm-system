-- CreateTable
CREATE TABLE "AgentRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerKeyHash" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "harness" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "providerType" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "remoteRunId" TEXT,
  "state" TEXT NOT NULL DEFAULT 'QUEUED',
  "output" TEXT NOT NULL DEFAULT '',
  "errorMessage" TEXT,
  "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProviderUsage" (
  "providerKey" TEXT NOT NULL PRIMARY KEY,
  "windowStartedAt" DATETIME NOT NULL,
  "windowSeconds" INTEGER NOT NULL,
  "messagesUsed" INTEGER NOT NULL,
  "messagesLimit" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "AgentRun_ownerKeyHash_idx" ON "AgentRun"("ownerKeyHash");

-- CreateIndex
CREATE INDEX "AgentRun_state_idx" ON "AgentRun"("state");

-- CreateIndex
CREATE INDEX "AgentRun_queuedAt_idx" ON "AgentRun"("queuedAt");

