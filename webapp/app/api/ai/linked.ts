import { currentUser } from "@/lib/server/auth";
import {
  accountQueue, isLimitError, markLimited, nextFree, openAccount, recordQuota,
  type AiProvider, type Quota, type RunAccount,
} from "@/lib/server/aiAccounts";

/**
 * Picks the logged-in user's linked account for a CLI run (Settings → AI → Accounts): queue order,
 * accounts with free quota first. A run that fails with "limit reached" marks that account and
 * moves on to the next one. Without linked accounts (or without accounts at all) `fn` runs once
 * with the host's own CLI login, as before.
 */
export async function withLinkedAccount<T>(
  request: Request,
  provider: AiProvider,
  fn: (account: RunAccount | undefined, onQuota: (q: Quota) => void) => Promise<T>,
): Promise<T> {
  const user = await currentUser(request).catch(() => null);
  return withUserAccount(user?.id ?? null, provider, fn);
}

/** Same, for a user known some other way (e.g. the companion mod's bearer token). */
export async function withUserAccount<T>(
  userId: number | null,
  provider: AiProvider,
  fn: (account: RunAccount | undefined, onQuota: (q: Quota) => void) => Promise<T>,
): Promise<T> {
  const user = userId == null ? null : { id: userId };
  const queue = user ? await accountQueue(user.id, provider) : [];
  if (!user || !queue.length) return fn(undefined, () => {});

  let lastError: unknown = null;
  for (const row of queue) {
    const account = await openAccount(user.id, row);
    let quota: Quota | null = null;
    try {
      const result = await fn(account, (q) => { quota = q; });
      if (quota) await recordQuota(account.id, quota);
      return result;
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (quota && (quota as Quota).status === "limited") await recordQuota(account.id, quota);
      else if (isLimitError(msg)) await markLimited(account.id);
      else throw e; // a real error — another account wouldn't do better
    } finally {
      await account.finish().catch(() => {});
    }
  }
  const free = nextFree(await accountQueue(user.id, provider));
  throw new Error(`All linked ${provider} accounts are at their usage limit${free ? ` — the next one frees up at ${new Date(free).toLocaleString()}` : ""}. (${lastError instanceof Error ? lastError.message : String(lastError)})`);
}
