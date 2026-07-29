import * as ort from 'onnxruntime-web/wasm'
import { loadOnnxModel, type OnnxModelConfig, type OnnxModelLoadOptions } from '@/core/onnx'
import { modelManifest } from '@/generated/model-manifest'
import {
  BEAT_THIS_MEL_BINS,
  BEAT_THIS_MODEL_ID,
} from './types'

const beatThisModelConfig: OnnxModelConfig = {
  modelId: BEAT_THIS_MODEL_ID,
  version: modelManifest.beat_this_small0.version,
  chunks: modelManifest.beat_this_small0.chunks,
  executionProviders: ['wasm'],
  graphOptimizationLevel: 'all',
  cache: {
    enabled: true,
  },
  inputs: [
    {
      name: 'log_mel',
      tensorType: 'float32',
      shape: [1, 'any', BEAT_THIS_MEL_BINS],
    },
  ],
  outputs: [
    {
      name: 'beat_logits',
      tensorType: 'float32',
      shape: ['any', 'any'],
    },
    {
      name: 'downbeat_logits',
      tensorType: 'float32',
      shape: ['any', 'any'],
    },
  ],
}

export async function loadBeatThisRunner(options?: OnnxModelLoadOptions) {
  const runner = await loadOnnxModel(beatThisModelConfig, options)
  const [inputName] = runner.inputNames
  const [beatOutputName, downbeatOutputName] = runner.outputNames

  if (!inputName || !beatOutputName || !downbeatOutputName) {
    throw new Error('Beat This 模型输入或输出元数据缺失')
  }

  return {
    async run(input: Float32Array, frameCount: number) {
      const tensor = new ort.Tensor('float32', input, [1, frameCount, BEAT_THIS_MEL_BINS])
      const result = await runner.run({ [inputName]: tensor })
      const beat = result[beatOutputName]
      const downbeat = result[downbeatOutputName]

      if (!(beat?.data instanceof Float32Array) || !(downbeat?.data instanceof Float32Array)) {
        throw new Error('Beat This 模型输出为空或类型不正确')
      }

      return {
        beat: beat.data,
        downbeat: downbeat.data,
      }
    },
  }
}
