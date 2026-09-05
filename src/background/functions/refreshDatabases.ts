import { Storage } from "@plasmohq/storage"

import { getDatabase } from "~api/getDatabase"
import { STORAGE_KEYS } from "~utils/consts"
import { formatDB } from "~utils/functions/notion"
import type { StoredDatabase } from "~utils/types"

const refreshDatabases = async () => {
  console.log("refreshing databases")
  const storage = new Storage()
  const databases = await storage.get<StoredDatabase[]>(STORAGE_KEYS.databases)
  if (!databases) return

  const refreshResults = await Promise.all(
    databases.filter(Boolean).map(async (storedDatabase) => {
      try {
        const database = await getDatabase(storedDatabase.id)

        // A failed refresh must not unlink a database. Notion can be
        // temporarily unavailable, the access token can be rotating, or the
        // request can be rate-limited when the service worker starts.
        if (!database) return [storedDatabase.id, null] as const

        const refreshedDatabase = formatDB(database)
        if (!refreshedDatabase) return [storedDatabase.id, null] as const

        return [storedDatabase.id, refreshedDatabase] as const
      } catch (err) {
        console.error(
          `Could not refresh database ${storedDatabase.id}; keeping cached data`,
          err
        )
        return [storedDatabase.id, null] as const
      }
    })
  )

  const refreshedById = new Map(refreshResults)

  // Read storage again before committing. The user may have linked or removed
  // a database while the Notion requests were in flight.
  const currentDatabases =
    (await storage.get<StoredDatabase[]>(STORAGE_KEYS.databases)) ?? []
  const refreshedDatabases = currentDatabases.filter(Boolean).map((stored) => {
    const refreshed = refreshedById.get(stored.id)
    return refreshed ? preserveTagSelection(stored, refreshed) : stored
  })

  await storage.set(STORAGE_KEYS.databases, refreshedDatabases)
  await storage.set(STORAGE_KEYS.refreshed, true)
}

const preserveTagSelection = (
  storedDatabase: StoredDatabase,
  refreshedDatabase: StoredDatabase
) => {
  const storedTagProperty =
    storedDatabase.tags[storedDatabase.tagPropertyIndex]
  if (!storedTagProperty) return refreshedDatabase

  const tagPropertyIndex = refreshedDatabase.tags.findIndex(
    (property) =>
      property.id === storedTagProperty.id ||
      property.name === storedTagProperty.name
  )
  if (tagPropertyIndex === -1) return refreshedDatabase

  const storedTag = storedTagProperty.options[storedDatabase.tagIndex]
  const tagIndex = storedTag
    ? refreshedDatabase.tags[tagPropertyIndex].options.findIndex(
        (tag) => tag.id === storedTag.id || tag.name === storedTag.name
      )
    : -1

  return {
    ...refreshedDatabase,
    tagPropertyIndex,
    tagIndex
  }
}

export default refreshDatabases
