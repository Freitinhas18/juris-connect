const DB_NAME = "juris-connect-demo-documents";
const STORE_NAME = "files";
export const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024;

function openDatabase(): Promise<IDBDatabase> {
  if (!("indexedDB" in window)) return Promise.reject(new Error("Este navegador não oferece armazenamento local de arquivos."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento local."));
  });
}

export async function storeDocumentFile(id: string, file: File): Promise<void> {
  const db = await openDatabase();
  try { await new Promise<void>((resolve, reject) => { const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(file, id); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}
export async function readDocumentFile(id: string): Promise<Blob | undefined> {
  const db = await openDatabase();
  try { return await new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id); request.onsuccess = () => resolve(request.result as Blob | undefined); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}
export async function removeDocumentFile(id: string): Promise<void> {
  const db = await openDatabase();
  try { await new Promise<void>((resolve, reject) => { const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}
