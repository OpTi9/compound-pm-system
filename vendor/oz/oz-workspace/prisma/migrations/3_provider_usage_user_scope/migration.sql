-- Scope ProviderUsage by user (userId + providerKey)
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ProviderUsage" (
  "userId" TEXT NOT NULL DEFAULT 'global',
  "providerKey" TEXT NOT NULL,
  "windowStartedAt" DATETIME NOT NULL,
  "windowSeconds" INTEGER NOT NULL,
  "messagesUsed" INTEGER NOT NULL,
  "messagesLimit" INTEGER NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  PRIMARY KEY ("userId", "providerKey")
);

INSERT INTO "new_ProviderUsage" (
  "userId",
  "providerKey",
  "windowStartedAt",
  "windowSeconds",
  "messagesUsed",
  "messagesLimit",
  "updatedAt"
)
SELECT
  'global' as "userId",
  "providerKey",
  "windowStartedAt",
  "windowSeconds",
  "messagesUsed",
  "messagesLimit",
  "updatedAt"
FROM "ProviderUsage";

DROP TABLE "ProviderUsage";
ALTER TABLE "new_ProviderUsage" RENAME TO "ProviderUsage";

CREATE INDEX "ProviderUsage_userId_idx" ON "ProviderUsage"("userId");
CREATE INDEX "ProviderUsage_providerKey_idx" ON "ProviderUsage"("providerKey");

PRAGMA foreign_keys=ON;
