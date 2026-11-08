export type Pending = { id: string; kind: string; userId: number; [key: string]: unknown }
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('sp-work', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('data')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function readLocal<T>(key: string): Promise<T | undefined> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('data', 'readonly')
    const request = tx.objectStore('data').get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}
export async function writeLocal(key: string, value: unknown) {
  const db = await open()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('data', 'readwrite')
    tx.objectStore('data').put(value, key)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
export async function clearLocal() {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('data', 'readwrite')
    tx.objectStore('data').clear()
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => reject(tx.error)
  })
}

export async function changeQueue(update: (queue: Pending[]) => Pending[]) {
  const db = await open()
  return new Promise<Pending[]>((resolve, reject) => {
    const tx = db.transaction('data', 'readwrite')
    const store = tx.objectStore('data')
    const request = store.get('queue')
    let queue: Pending[] = []
    request.onsuccess = () => { queue = update(request.result || []); store.put(queue, 'queue') }
    tx.oncomplete = () => { db.close(); resolve(queue) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
