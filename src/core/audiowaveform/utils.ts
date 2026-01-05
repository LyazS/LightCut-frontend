/**
 * 音频波形LOD系统 - 辅助函数
 * 
 * 提供LOD生成所需的各种辅助函数
 */

import type { WaveformLODLevel } from './types'

/**
 * 从Float32 PCM数据生成单个LOD层级
 * 当无法直接从MediaBunny提取Int16时使用此方法
 * 
 * @param pcmData 原始PCM数据（单声道，Float32格式，范围-1.0到1.0）
 * @param downsampleFactor 降采样因子
 * @returns LOD层级数据（Int16格式）
 */
export function generateLODLevel(
  pcmData: Float32Array,
  downsampleFactor: number
): { maxValues: Int16Array; minValues: Int16Array } {
  const outputLength = Math.ceil(pcmData.length / downsampleFactor)
  const maxValues = new Int16Array(outputLength)
  const minValues = new Int16Array(outputLength)
  
  for (let i = 0; i < outputLength; i++) {
    const startIdx = i * downsampleFactor
    const endIdx = Math.min(startIdx + downsampleFactor, pcmData.length)
    
    let max = -Infinity
    let min = Infinity
    
    for (let j = startIdx; j < endIdx; j++) {
      const sample = pcmData[j]
      if (sample > max) max = sample
      if (sample < min) min = sample
    }
    
    // 转换为Int16范围 (-32768 到 32767)
    // 先限制在-1.0到1.0范围内，然后乘以32767
    maxValues[i] = Math.round(Math.max(-1, Math.min(1, max)) * 32767)
    minValues[i] = Math.round(Math.max(-1, Math.min(1, min)) * 32767)
  }
  
  return { maxValues, minValues }
}


/**
 * 将Int16样本值转换为Float32
 * 
 * @param value Int16样本值（范围-32768到32767）
 * @returns Float32样本值（范围-1.0到1.0）
 */
export function int16ToFloat(value: number): number {
  return value / 32767
}


/**
 * 验证PCM数据的有效性
 * 
 * @param pcmData PCM数据
 * @returns 是否有效
 */
export function validatePCMData(pcmData: Float32Array | Int16Array): boolean {
  if (!pcmData || pcmData.length === 0) {
    return false
  }
  
  // 检查是否包含NaN或Infinity
  for (let i = 0; i < pcmData.length; i++) {
    const value = pcmData[i]
    if (!isFinite(value)) {
      return false
    }
  }
  
  return true
}