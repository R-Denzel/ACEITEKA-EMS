-- Reports are limited to roles whose workflows require operational reporting.
DELETE FROM "RolePermission" AS rp
USING "Role" AS role, "Permission" AS permission
WHERE rp."roleId" = role."id"
  AND rp."permissionId" = permission."id"
  AND role."key" IN ('results_officer', 'results_approver')
  AND permission."key" = 'reports.view';
