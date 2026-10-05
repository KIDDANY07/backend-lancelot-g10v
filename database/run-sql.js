require('dotenv').config({ quiet: true })
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Client } = require('pg')

const [, , sqlFile, mode] = process.argv
const isDryRun = mode === '--dry-run'

async function showRoles(client, title) {
  const roles = await client.query('SELECT id_role, name, code FROM roles ORDER BY id_role')
  const users = await client.query(
    'SELECT r.code, COUNT(u.id_user)::int AS usuarios FROM roles r LEFT JOIN users u ON u.id_role = r.id_role GROUP BY r.id_role, r.code ORDER BY r.id_role',
  )
  console.log(title)
  console.table(roles.rows)
  console.table(users.rows)
}

async function main() {
  if (!sqlFile) throw new Error('Indica el archivo SQL, por ejemplo: database/roles.sql')
  if (!process.env.URL_DB) throw new Error('No está configurada la variable URL_DB')

  const statements = readFileSync(resolve(sqlFile), 'utf8')
  const sql = isDryRun ? statements.replace(/COMMIT;\s*$/, 'ROLLBACK;') : statements
  const client = new Client({ connectionString: process.env.URL_DB })
  await client.connect()

  try {
    await showRoles(client, 'Antes:')
    if (isDryRun) {
      const preview = sql.replace(/ROLLBACK;\s*$/, '')
      await client.query(preview)
      await showRoles(client, 'Resultado (simulación, se revierte):')
      await client.query('ROLLBACK')
    } else {
      await client.query(sql)
      await showRoles(client, 'Después:')
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(`No se aplicó el script: ${error.message}`)
  process.exit(1)
})
