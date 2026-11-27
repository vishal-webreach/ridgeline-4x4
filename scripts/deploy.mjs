// Builds the game and publishes dist/ to the gh-pages branch (GitHub Pages).
// Usage: npm run deploy
import { execSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()

const remote = out('git remote get-url origin')
const commit = out('git rev-parse --short HEAD')

run('npm run build')

const dir = mkdtempSync(join(tmpdir(), 'ridgeline-deploy-'))
try {
  cpSync('dist', dir, { recursive: true })
  writeFileSync(join(dir, '.nojekyll'), '') // serve files as-is
  run('git init -q -b gh-pages', dir)
  run('git add -A', dir)
  run(`git commit -q -m "Deploy ${commit}"`, dir)
  run(`git push -q -f ${remote} gh-pages`, dir)
  console.log(`\nDeployed ${commit} to gh-pages – GitHub Pages updates in about a minute.`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
