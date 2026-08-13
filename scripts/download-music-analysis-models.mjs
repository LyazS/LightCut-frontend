import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const REPOSITORY_ID = 'azstorm/lightcut-music-analysis-models'
const REVISION = '971366ce07f76f7236b6bca636e162ecc12e985f'
const projectRoot = process.cwd()
const modelsDirectory = path.join(projectRoot, 'model-sources', 'music-analysis')

const MODELS = [
  {
    filename: 'htdemucs-core.onnx',
    size: 174268031,
    sha256: 'ab89734188dad008d23d45e17c49d919ed71bf8d48531b7e7679bc38b94510d3',
  },
  {
    filename: 'harmonix-fold0.onnx',
    size: 3432887,
    sha256: 'c8e2612cd340ef57268f612eafba72360af3948dc8f3aaca0a8bf53333f13430',
  },
  {
    filename: 'harmonix-fold1.onnx',
    size: 3432887,
    sha256: '71bbf13583d0bbcf0c608b0dbe9da98000340494c51ccc2397302db28eef6c52',
  },
  {
    filename: 'harmonix-fold2.onnx',
    size: 3432887,
    sha256: '8fee6f4d27dcdc0ed8644d310887527125d5e0d6caf0585f5fd953174d82bfa2',
  },
  {
    filename: 'harmonix-fold3.onnx',
    size: 3432887,
    sha256: 'e6685c8b2027f5b7e83639725c900f09de0e8efb308cb263c34897aae85b5df4',
  },
  {
    filename: 'harmonix-fold4.onnx',
    size: 3432887,
    sha256: 'bece14436e70417f0bf65cfc288e1f465f9599c2cafad2226f10e0fc48741aae',
  },
  {
    filename: 'harmonix-fold5.onnx',
    size: 3432887,
    sha256: 'a37d14dfc2dae21c85fddec1752792d88b70bcdbfc5d974df35c854993a035e3',
  },
  {
    filename: 'harmonix-fold6.onnx',
    size: 3432887,
    sha256: '353bf6ef0c6f6abf5c3fc31585a56885c1e3fa4e70fe95c5841d560056d65c7a',
  },
  {
    filename: 'harmonix-fold7.onnx',
    size: 3432887,
    sha256: 'fffbfa68890489baaf83038a53b1d73b23485e1bc9a79877c202fa45d6c471ea',
  },
]

function resolveModelUrl(filename) {
  return `https://huggingface.co/${REPOSITORY_ID}/resolve/${REVISION}/${filename}?download=true`
}

async function sha256File(filePath) {
  const hash = createHash('sha256')
  await pipeline(
    createReadStream(filePath),
    new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk)
        callback()
      },
    }),
  )
  return hash.digest('hex')
}

async function isValidModel(filePath, model) {
  try {
    const fileStat = await stat(filePath)
    return fileStat.size === model.size && (await sha256File(filePath)) === model.sha256
  } catch {
    return false
  }
}

async function downloadModel(model) {
  const destination = path.join(modelsDirectory, model.filename)
  const temporaryDestination = `${destination}.download`
  const response = await fetch(resolveModelUrl(model.filename), {
    headers: { 'user-agent': 'LightCut model bootstrapper' },
  })

  if (!response.ok || !response.body) {
    throw new Error(`下载 ${model.filename} 失败: ${response.status} ${response.statusText}`)
  }

  const hash = createHash('sha256')
  let writtenBytes = 0
  const verifier = new Transform({
    transform(chunk, _encoding, callback) {
      writtenBytes += chunk.length
      hash.update(chunk)
      callback(null, chunk)
    },
  })

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      verifier,
      createWriteStream(temporaryDestination),
    )
    const digest = hash.digest('hex')
    if (writtenBytes !== model.size || digest !== model.sha256) {
      throw new Error(
        `${model.filename} 校验失败: 期望 ${model.size} bytes / ${model.sha256}, ` +
          `实际 ${writtenBytes} bytes / ${digest}`,
      )
    }
    await rename(temporaryDestination, destination)
  } catch (error) {
    await rm(temporaryDestination, { force: true })
    throw error
  }
}

async function ensureModels() {
  await mkdir(modelsDirectory, { recursive: true })

  for (const model of MODELS) {
    const destination = path.join(modelsDirectory, model.filename)
    if (await isValidModel(destination, model)) {
      continue
    }

    console.log(`Downloading ${model.filename} from ${REPOSITORY_ID}@${REVISION}`)
    await downloadModel(model)
  }
}

await ensureModels()
