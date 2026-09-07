import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '..')
const wasmRoot = resolve(projectRoot, 'src/core/utils/music-analysis/wasm')
const output = resolve(projectRoot, 'src/core/utils/music-analysis/dsp-engine.wasm')
const configuredCargo = process.env.CARGO
let cargo = configuredCargo ?? 'cargo'
let cargoArgs = ['build', '--release', '--target', 'wasm32-unknown-unknown']

// Use the Cargo selected by rust-toolchain.toml when rustup is available. This
// keeps the build on the pinned toolchain even when Homebrew's Cargo is first
// on PATH and does not have the wasm32 standard library installed.
if (!configuredCargo) {
  const activeToolchain = spawnSync('rustup', ['show', 'active-toolchain'], {
    cwd: wasmRoot,
    encoding: 'utf8',
  })
  const toolchain =
    activeToolchain.status === 0 ? activeToolchain.stdout.trim().split(/\s+/)[0] : ''
  if (toolchain) {
    cargo = 'rustup'
    cargoArgs = ['run', toolchain, 'cargo', ...cargoArgs]
  }
}

const result = spawnSync(cargo, cargoArgs, {
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
