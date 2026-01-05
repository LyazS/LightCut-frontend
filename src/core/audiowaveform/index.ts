/**
 * 音频波形LOD系统 - 统一导出
 * 
 * 提供音频波形LOD系统的所有公开API
 */

// 类型定义
export type {
  WaveformLODLevel,
  LODConfig,
  WaveformLODData,
  AudioWaveformLOD,
  WaveformRenderOptions,
  LODProgressCallback,
} from './types'

export { LOD_CONFIGS } from './types'

// 核心类
export { AudioWaveformLODGenerator } from './AudioWaveformLODGenerator'
export { AudioWaveformLODSelector } from './AudioWaveformLODSelector'
export { AudioWaveformRenderer } from './AudioWaveformRenderer'

// 辅助函数
export {
  generateLODLevel,
  int16ToFloat,
  validatePCMData,
} from './utils'