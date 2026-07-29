import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const swPath = resolve('public/sw.js')

const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ??
  process.env.GITHUB_SHA?.slice(0, 8) ??
  String(Date.now())

const contents = await readFile(swPath, 'utf8')
const stamped = contents.replace(/^const CACHE = '.*'$/m, `const CACHE = 'trinity-staff-${buildId}'`)

if (stamped === contents) {
  throw new Error(`Could not find a CACHE constant to stamp in ${swPath}`)
}

await writeFile(swPath, stamped)
console.log(`Stamped service worker cache version: trinity-staff-${buildId}`)
