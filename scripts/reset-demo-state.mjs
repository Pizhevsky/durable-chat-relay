import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const files = [
  'data/helper.sqlite',
  'data/helper.sqlite-shm',
  'data/helper.sqlite-wal',
  'data/central.sqlite',
  'data/central.sqlite-shm',
  'data/central.sqlite-wal'
]

for (const file of files) {
  await rm(resolve(file), { force: true })
}

console.log('Removed local Node demo SQLite files.')
console.log('')
console.log('Also clear browser storage for the demo origin:')
console.log("  localStorage.clear()")
console.log("  sessionStorage.clear()")
console.log("  indexedDB.deleteDatabase('durable-chat')")
console.log('')
console.log('If using Laravel as CENTRAL_URL, reset/migrate/seed the Laravel database too.')
