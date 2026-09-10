const dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open("aivy-take-studio", 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    db.createObjectStore("projects", { keyPath: "id" });
    const takes = db.createObjectStore("takes", { keyPath: "id" });
    takes.createIndex("project", "project");
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function operation(store, mode, fn) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let value;
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => {
      value = req.result;
    };
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error || req.error);
    tx.onabort = () => reject(tx.error || Error("Local save was interrupted."));
  });
}
export const projects = () =>
  operation("projects", "readonly", (s) => s.getAll());
export const saveProject = (p) =>
  operation("projects", "readwrite", (s) => s.put(p));
export const projectTakes = (id) =>
  operation("takes", "readonly", (s) => s.index("project").getAll(id));
export const saveTake = (t) => operation("takes", "readwrite", (s) => s.put(t));
export const deleteTake = (id) =>
  operation("takes", "readwrite", (s) => s.delete(id));
// A take is not marked saved until the transaction is committed.
export async function persistStorage() {
  try {
    return await navigator.storage?.persist?.();
  } catch {
    return false;
  }
}
