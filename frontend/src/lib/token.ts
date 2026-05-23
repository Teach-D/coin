export function parseUserIdFromToken(token: string | null): number {
  if (!token) return 0;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return Number(payload.sub ?? payload.userId ?? payload.id ?? 0);
  } catch {
    return 0;
  }
}
