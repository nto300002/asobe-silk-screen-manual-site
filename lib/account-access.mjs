export function accountAccessStatus(account) {
  if (!account) return 401;
  if (!account.active || !['participant', 'staff', 'admin'].includes(account.role)) return 403;
  return 200;
}
