/**
 * Asks the browser to treat this site's storage as persistent.
 *
 * Without it, IndexedDB sits in the "best effort" bucket: Chrome is free to
 * evict it when the disk fills up, and the history disappears with no warning.
 * Granting is silent when the site looks like something the person uses, and a
 * refusal costs nothing, so the result only matters for the message shown in
 * the interface.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
