-- CreateTable
CREATE TABLE "Environment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerKeyHash" TEXT,
  "name" TEXT NOT NULL,
  "dockerImage" TEXT NOT NULL,
  "reposText" TEXT NOT NULL DEFAULT '',
  "setupCommandsText" TEXT NOT NULL DEFAULT '',
  "envVarsText" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Environment_ownerKeyHash_idx" ON "Environment"("ownerKeyHash");

-- CreateIndex
CREATE INDEX "Environment_name_idx" ON "Environment"("name");
