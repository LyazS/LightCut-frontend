/**
 * LOD层级选择器
 * 
 * 根据当前缩放级别和像素密度选择最优LOD层级
 * 确保在不同缩放级别下都能获得最佳的渲染性能和视觉质量
 */

import type { WaveformLODLevel, LODConfig } from './types'
import { LOD_CONFIGS } from './types'

/**
 * LOD层级选择器类
 */
export class AudioWaveformLODSelector {
  /**
   * 根据zoomLevel选择最优LOD层级
   * 
   * @param zoomLevel 当前缩放级别
   * @param pixelsPerFrame 每帧像素数（可选，用于更精确的选择）
   * @param sampleRate 原始采样率（默认48000）
   * @returns 最优LOD层级
   */
  selectLODLevel(
    zoomLevel: number,
    pixelsPerFrame?: number,
    sampleRate: number = 48000
  ): WaveformLODLevel {
    // 基于zoomLevel的简单选择
    for (const config of LOD_CONFIGS) {
      if (zoomLevel >= config.minZoomLevel && zoomLevel < config.maxZoomLevel) {
        return config.level
      }
    }
    
    // 默认返回最低层级（最粗糙）
    return LOD_CONFIGS[LOD_CONFIGS.length - 1].level
  }
  
}