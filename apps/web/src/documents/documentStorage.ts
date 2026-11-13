const DB_NAME = "juris-connect-demo-documents";
const STORE_NAME = "files";
export const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024;

// Kept read-only for legacy import. New documents are stored by the API.
function openLegacyDatabase(): Promise<IDBDatabase> {
  if (!("indexedDB" in window)) return Promise.reject(new Error("Este navegador não oferece IndexedDB."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { request.transaction?.abort(); reject(new Error("Nenhum armazenamento legado de arquivos foi encontrado.")); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir os arquivos locais legados."));
  });
}
export async function readDocumentFile(id: string): Promise<Blob | undefined> {
  const db = await openLegacyDatabase();
  try { return await new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id); request.onsuccess = () => resolve(request.result as Blob | undefined); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}
