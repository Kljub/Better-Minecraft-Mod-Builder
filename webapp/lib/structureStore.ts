/**
 * Structure template files (.nbt) for the Structures element — binary and potentially large, so
 * they live in IndexedDB (own database, like the texture store) instead of the project JSON in
 * localStorage. The element spec only stores the key. Per browser, like custom textures.
 */
import { cloudDeleteFile, cloudPutFile } from "@/lib/cloud/sync";

const DB_NAME = "mc-ui-builder-structures";
const STORE = "structures";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  }));
}

/** Stores the file and returns its key ("<random>/<file name>"). */
export async function saveStructureFile(file: Blob, name: string): Promise<string> {
  const key = `${crypto.randomUUID().slice(0, 8)}/${name.replace(/[^\w.-]/g, "_")}`;
  await run("readwrite", (s) => s.put(file, key));
  cloudPutFile("structure", key, file);
  return key;
}

export async function loadStructureFile(key: string): Promise<Blob | undefined> {
  if (!key) return undefined;
  return (await run<Blob | undefined>("readonly", (s) => s.get(key))) ?? undefined;
}

export async function loadStructureFiles(keys: string[]): Promise<Record<string, Blob>> {
  const out: Record<string, Blob> = {};
  for (const key of new Set(keys.filter(Boolean))) {
    const blob = await loadStructureFile(key);
    if (blob) out[key] = blob;
  }
  return out;
}

export async function deleteStructureFile(key: string): Promise<void> {
  await run("readwrite", (s) => s.delete(key));
  cloudDeleteFile("structure", key);
}
