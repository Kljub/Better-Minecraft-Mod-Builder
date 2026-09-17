import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * A locally-unique id, safe to call anywhere. crypto.randomUUID() only exists in secure contexts
 * (HTTPS or localhost) — reaching the dev server over plain HTTP via a LAN IP is not a secure
 * context, where that API is simply absent and throws.
 */
export function genId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Copies text to the clipboard, same secure-context caveat as genId() — navigator.clipboard is
 * simply absent over plain HTTP on a LAN IP. Falls back to the deprecated but still universally
 * supported execCommand("copy") via a throwaway textarea.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("execCommand(\"copy\") failed");
  } finally {
    document.body.removeChild(textarea);
  }
}
