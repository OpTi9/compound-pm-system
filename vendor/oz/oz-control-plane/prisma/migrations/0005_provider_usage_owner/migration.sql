-- Scope ProviderUsage by tenant (ownerKeyHash + providerKey)
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ProviderUsage" (
  "ownerKeyHash" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "windowStartedAt" DATETIME NOT NULL,
  "windowSeconds" INTEGER NOT NULL,
  "messagesUsed" INTEGER NOT NULL,
  "messagesLimit" INTEGER NOT NULL,
  PRIMARY KEY ("ownerKeyHash", "providerKey")
);

INSERT INTO "new_ProviderUsage" (
  "ownerKeyHash",
  "providerKey",
  "windowStartedAt",
  "windowSeconds",
  "messagesUsed",
  "messagesLimit"
)
SELECT
  'global' as "ownerKeyHash",
  "providerKey",
  "windowStartedAt",
  "windowSeconds",
  "messagesUsed",
  "messagesLimit"
FROM "ProviderUsage";

DROP TABLE "ProviderUsage";
ALTER TABLE "new_ProviderUsage" RENAME TO "ProviderUsage";

CREATE INDEX "ProviderUsage_ownerKeyHash_idx" ON "ProviderUsage"("ownerKeyHash");
CREATE INDEX "ProviderUsage_providerKey_idx" ON "ProviderUsage"("providerKey");

PRAGMA foreign_keys=ON;
