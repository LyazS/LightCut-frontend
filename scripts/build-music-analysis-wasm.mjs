import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '..')
const wasmRoot = resolve(projectRoot, 'src/core/utils/music-analysis/wasm')
const output = resolve(projectRoot, 'src/core/utils/music-analysis/dsp-engine.wasm')
const cargo = process.env.CARGO ?? 'cargo'
const result = spawnSync(cargo, ['build', '--release', '--target', 'wasm32-unknown-unknown'], {
  cwd: wasmRoot,
  stdio: 'inherit',
})

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

await mkdir(dirname(output), { recursive: true })
await copyFile(
  resolve(wasmRoot, 'target/wasm32-unknown-unknown/release/simple_music_dsp.wasm'),
  output,
)
