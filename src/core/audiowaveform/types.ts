/**
 * 音频波形LOD系统 - 类型定义
 * 
 * 本文件定义了音频波形LOD（Level of Detail）系统的所有核心类型
 * 包括LOD层级、波形数据结构、配置等
 */

/**
 * LOD层级枚举
 * 定义5个LOD层级，采用4倍降采样策略
 */
export enum WaveformLODLevel {
  L0 = 0,  // 原始采样率 (1x)
  L1 = 1,  // 4x降采样
  L2 = 2,  // 16x降采样
  L3 = 3,  // 64x降采样
  L4 = 4,  // 256x降采样
}

/**
 * LOD配置接口
 * 定义每个LOD层级的配置参数
 */
export interface LODConfig {
  level: WaveformLODLevel
  downsampleFactor: number  // 降采样因子
  minZoomLevel: number      // 最小适用缩放级别
  maxZoomLevel: number      // 最大适用缩放级别
}

/**
 * LOD配置数组
 * 定义所有LOD层级的配置
 */
export const LOD_CONFIGS: LODConfig[] = [
  { level: WaveformLODLevel.L0, downsampleFactor: 1, minZoomLevel: 50, maxZoomLevel: Infinity },
  { level: WaveformLODLevel.L1, downsampleFactor: 4, minZoomLevel: 20, maxZoomLevel: 50 },
  { level: WaveformLODLevel.L2, downsampleFactor: 16, minZoomLevel: 5, maxZoomLevel: 20 },
  { level: WaveformLODLevel.L3, downsampleFactor: 64, minZoomLevel: 1, maxZoomLevel: 5 },
  { level: WaveformLODLevel.L4, downsampleFactor: 256, minZoomLevel: 0, maxZoomLevel: 1 },
]

/**
 * 单个LOD层级的波形数据
 * 存储最大值和最小值对，用于准确渲染波形
 * 
 * 注意：
 * - 只存储第一个声道的数据（减少50%内存）
 * - 使用Int16Array格式（相比Float32Array再减少50%内存）
 * - 总内存优化：相比原始Float32双声道减少75%
 */
export interface WaveformLODData {
  level: WaveformLODLevel
  downsampleFactor: number
  sampleRate: number        // 原始采样率
  duration: number          // 时长（秒）
  
  // 波形数据（只存储第一个声道，使用Int16节省内存）
  maxValues: Int16Array  // 每个采样窗口的最大值 (-32768 到 32767)
  minValues: Int16Array  // 每个采样窗口的最小值 (-32768 到 32767)
}

/**
 * 完整的音频波形LOD集合
 * 包含所有LOD层级的数据和元数据
 */
export interface AudioWaveformLOD {
  // 所有LOD层级的数据
  levels: Map<WaveformLODLevel, WaveformLODData>
  
  // 元数据
  metadata: {
    sampleRate: number
    channels: number          // 原始声道数（仅供参考）
    duration: number
    totalSamples: number
  }
  
  // 注意：只存储第一个声道的波形数据
  
  // 生成状态（按需异步生成）
  status: 'pending' | 'generating' | 'ready' | 'error'
  progress: number  // 0-100
  error?: string
  
  // 生成时间戳（用于调试和缓存管理）
  generatedAt?: number
  
  // ⚠️ 关键：防止重复生成的标记位
  isGenerating?: boolean
  
  // ⚠️ 关键：通知其他实例的版本号（用于触发重新渲染）
  version?: number
}

/**
 * 波形渲染选项
 * 定义渲染波形时的各种参数
 */
export interface WaveformRenderOptions {
  width: number              // Canvas宽度
  height: number             // Canvas高度
  amplitude?: number         // 振幅缩放，默认1.0
  baselineY: number          // 基线Y坐标
  gradient?: CanvasGradient  // 渐变色
  backgroundColor?: string   // 背景色
}

/**
 * LOD生成进度回调函数类型
 */
export type LODProgressCallback = (progress: number) => void