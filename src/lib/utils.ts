import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string | Date | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

/**
 * Appends `authuser=<email>` to any Google web URL so multi-account browsers
 * open the exact Google account logged into Dash instead of defaulting to u/0.
 */
export function withGoogleAuthUser(
  rawUrl: string,
  authEmail?: string | null
): string {
  if (!rawUrl || !authEmail?.trim()) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname.endsWith("google.com")) return rawUrl;
    if (!parsed.searchParams.has("authuser")) {
      parsed.searchParams.set("authuser", authEmail.trim());
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}
