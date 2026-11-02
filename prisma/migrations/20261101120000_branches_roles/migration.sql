CREATE TABLE "Branch" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Role" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "capabilities" TEXT NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "Branch" ("code","name","active","createdAt","updatedAt")
VALUES ('01','Head office',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "Role" ("key","name","capabilities","system","active","createdAt","updatedAt") VALUES
('admin','Administrator','["manageUsers","manageSettings","manageContacts","viewContacts","manageQuotations","manageDocuments","recordPayments","viewDocuments","viewCosts","viewAudit","viewPaymentLedger","exportContacts"]',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('agent','Agent','["manageContacts","viewContacts","manageQuotations","manageDocuments","viewDocuments","viewCosts"]',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('accountant','Accountant','["viewContacts","manageDocuments","recordPayments","viewDocuments","viewCosts","viewAudit","viewPaymentLedger","exportContacts"]',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('viewer','Viewer','["viewDocuments"]',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
