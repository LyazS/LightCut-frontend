import * as ort from 'onnxruntime-web/webgpu'
import {
  disposeOnnxModel,
  loadOnnxModel,
  type OnnxModelConfig,
  type OnnxModelLoadOptions,
} from '@/core/onnx'
import { modelManifest } from '@/generated/model-manifest'
import {
  DEMUCS_COMPLEX_STEMS_LENGTH,
  DEMUCS_SEGMENT_SAMPLES,
  DEMUCS_TIME_STEMS_LENGTH,
} from './dsp'

const MODEL_MANIFEST = modelManifest as Record<
  string,
  { version: string; chunks: readonly { path: string; size: number }[] }
>

export const MUSIC_ANALYSIS_DEMUCS_MODEL_ID = 'htdemucs-core'
export const MUSIC_ANALYSIS_HARMONIX_MODEL_IDS = Array.from(
  { length: 8 },
  (_, index) => `harmonix-fold${index}`,
)

function getModelManifestEntry(modelId: string) {
  const entry = MODEL_MANIFEST[modelId]
  if (!entry) {
    throw new Error(`音乐结构分析模型未打包: ${modelId}`)
  }
  return entry
}

function createDemucsConfig(): OnnxModelConfig {
  const entry = getModelManifestEntry(MUSIC_ANALYSIS_DEMUCS_MODEL_ID)
  return {
    modelId: MUSIC_ANALYSIS_DEMUCS_MODEL_ID,
    version: entry.version,
    chunks: entry.chunks,
    executionProviders: ['webgpu', 'wasm'],
    graphOptimizationLevel: 'all',
    cache: { enabled: true },
    inputs: [
      { name: 'mix', tensorType: 'float32', shape: [1, 2, DEMUCS_SEGMENT_SAMPLES] },
      { name: 'stft', tensorType: 'float32', shape: [1, 2, 2_048, 336, 2] },
    ],
    outputs: [
      { name: 'complex_stems', tensorType: 'float32', shape: [1, 4, 2, 2_048, 336, 2] },
      { name: 'time_stems', tensorType: 'float32', shape: [1, 4, 2, DEMUCS_SEGMENT_SAMPLES] },
    ],
  }
}

function createHarmonixConfig(modelId: string): OnnxModelConfig {
  const entry = getModelManifestEntry(modelId)
  return {
    modelId,
    version: entry.version,
    chunks: entry.chunks,
    executionProviders: ['webgpu', 'wasm'],
    graphOptimizationLevel: 'all',
    cache: { enabled: true },
    allowExtraOutputs: true,
    inputs: [{ name: 'features', tensorType: 'float32', shape: [1, 4, 'any', 81] }],
    outputs: [
      { name: 'beat', tensorType: 'float32', shape: ['any', 'any'] },
      { name: 'downbeat', tensorType: 'float32', shape: ['any', 'any'] },
      { name: 'section', tensorType: 'float32', shape: ['any', 'any'] },
      { name: 'function', tensorType: 'float32', shape: ['any', 10, 'any'] },
    ],
  }
}

function requireFloat32Output(
  output: ort.InferenceSession.ReturnType[string] | undefined,
  modelId: string,
  name: string,
  expectedLength: number,
): Float32Array {
  if (!(output?.data instanceof Float32Array) || output.data.length !== expectedLength) {
    throw new Error(`${modelId} 输出 ${name} 无效`)
  }
  return output.data
}

export async function loadDemucsRunner(options?: OnnxModelLoadOptions) {
  const runner = await loadOnnxModel(createDemucsConfig(), options)
  const [mixName, stftName] = runner.inputNames
  const [complexStemsName, timeStemsName] = runner.outputNames
  if (!mixName || !stftName || !complexStemsName || !timeStemsName) {
    throw new Error('HTDemucs 模型元数据不完整')
  }

  return {
    async run(
      mix: Float32Array,
      stft: Float32Array,
    ): Promise<{ complexStems: Float32Array; timeStems: Float32Array }> {
      const result = await runner.run({
        [mixName]: new ort.Tensor('float32', mix, [1, 2, DEMUCS_SEGMENT_SAMPLES]),
        [stftName]: new ort.Tensor('float32', stft, [1, 2, 2_048, 336, 2]),
      })
      return {
        complexStems: requireFloat32Output(
          result[complexStemsName],
          MUSIC_ANALYSIS_DEMUCS_MODEL_ID,
          complexStemsName,
          DEMUCS_COMPLEX_STEMS_LENGTH,
        ),
        timeStems: requireFloat32Output(
          result[timeStemsName],
          MUSIC_ANALYSIS_DEMUCS_MODEL_ID,
          timeStemsName,
          DEMUCS_TIME_STEMS_LENGTH,
        ),
      }
    },
    release: () => disposeOnnxModel(MUSIC_ANALYSIS_DEMUCS_MODEL_ID),
  }
}

export async function runHarmonixFold(
  modelId: string,
  features: Float32Array,
  frameCount: number,
  options?: OnnxModelLoadOptions,
): Promise<{
  beat: Float32Array
  downbeat: Float32Array
  section: Float32Array
  function: Float32Array
}> {
  const runner = await loadOnnxModel(createHarmonixConfig(modelId), options)
  const [inputName] = runner.inputNames
  const [beatName, downbeatName, sectionName, functionName] = runner.outputNames
  if (!inputName || !beatName || !downbeatName || !sectionName || !functionName) {
    throw new Error(`${modelId} 模型元数据不完整`)
  }

  try {
    const result = await runner.run({
      [inputName]: new ort.Tensor('float32', features, [1, 4, frameCount, 81]),
    })
    return {
      beat: requireFloat32Output(result[beatName], modelId, beatName, frameCount),
      downbeat: requireFloat32Output(result[downbeatName], modelId, downbeatName, frameCount),
      section: requireFloat32Output(result[sectionName], modelId, sectionName, frameCount),
      function: requireFloat32Output(result[functionName], modelId, functionName, frameCount * 10),
    }
  } finally {
    await disposeOnnxModel(modelId)
  }
}
