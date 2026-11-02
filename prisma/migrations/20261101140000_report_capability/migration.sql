-- RBAC: reports are a capability, initially granted to administrators and accountants.
UPDATE "Role"
SET "capabilities" = json_insert("capabilities", '$[#]', 'viewReports'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN ('admin', 'accountant')
  AND "capabilities" NOT LIKE '%"viewReports"%';
