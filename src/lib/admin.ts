export const ADMIN_EMAILS = (
  process.env.ADMIN_EMAILS ?? "sepipsy@gmail.com,sepspipsy@gmail.com"
)
  .split(",")
  .map((e) => e.trim().toLowerCase());

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
