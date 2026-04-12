export function getAdminEmail(headers: Headers): string | null {
  return (
    headers.get("cf-access-authenticated-user-email") ??
    headers.get("x-test-admin-email") ??
    null
  );
}

export function isAdminRequest(headers: Headers): boolean {
  return Boolean(getAdminEmail(headers));
}
