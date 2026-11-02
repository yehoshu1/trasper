-- RedefineTables
PRAGMA busy_timeout=15000;
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FareLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optionId" TEXT NOT NULL,
    "passengerId" TEXT,
    "passengerType" TEXT NOT NULL DEFAULT 'adult',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "costMinor" BIGINT NOT NULL,
    CONSTRAINT "FareLine_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "QuoteOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FareLine_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "Passenger" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FareLine" ("costMinor", "id", "optionId", "passengerId", "passengerType", "quantity")
SELECT "costMinor", "id", "optionId", "passengerId",
       COALESCE((SELECT "type" FROM "Passenger" WHERE "Passenger"."id" = "FareLine"."passengerId"), 'adult'),
       1
FROM "FareLine";
DROP TABLE "FareLine";
ALTER TABLE "new_FareLine" RENAME TO "FareLine";
CREATE INDEX "FareLine_optionId_idx" ON "FareLine"("optionId");
CREATE INDEX "FareLine_passengerId_idx" ON "FareLine"("passengerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
