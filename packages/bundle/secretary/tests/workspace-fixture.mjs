import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Seeds the DSH workspace store for a fresh DSH_HOME.
 *
 * The desktop runtime creates a default workspace on first boot; the npm CLI
 * used by CI does not. Tests need one stable workspace before opening the UI.
 */
export async function seedWorkspace(home, path, title = 'Default workspace') {
  const id = randomUUID()
  const now = new Date().toISOString()
  await mkdir(join(home, 'storages'), { recursive: true })
  await mkdir(path, { recursive: true })
  await writeFile(join(home, 'storages', 'workspace.json'), JSON.stringify({
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, workspaceIds: [id], archivedSessionIds: [], pinnedSessionIds: [] },
    tables: {
      workspaces: {
        [id]: { path, title, sessionIds: [], createdAt: now, updatedAt: now },
      },
    },
  }, null, 2))
}
