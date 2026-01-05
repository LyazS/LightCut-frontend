/**
 * 音频波形LOD生成器
 * 
 * 负责从MediaBunny解码音频并生成所有LOD层级
 * 支持按需异步生成，不阻塞UI
 */

import type { BunnyMedia } from '../mediabunny/bunny-media'
import type {
  AudioWaveformLOD,
  WaveformLODData,
  WaveformLODLevel,
  LODProgressCallback,
} from './types'
import { LOD_CONFIGS } from './types'
import { generateLODLevel, validatePCMData } from './utils'

/**
 * 音频波形LOD生成器类
 */
export class AudioWaveformLODGenerator {
  /**
   * 从BunnyMedia生成完整的LOD数据
   * 
   * @param bunnyMedia MediaBunny实例
   * @param onProgress 进度回调（0-100）
   * @returns 完整的LOD数据
   */
  async generateFromBunnyMedia(
    bunnyMedia: BunnyMedia,
    onProgress?: LODProgressCallback
  ): Promise<AudioWaveformLOD> {
    // 1. 获取音频轨道信息
    const audioTrackInfo = bunnyMedia.getAudioTrackInfo()
    if (!audioTrackInfo) {
      throw new Error('音频轨道不存在')
    }
    
    // 2. 提取PCM数据
    const pcmData = await this.extractPCMFromBunnyMedia(bunnyMedia)
    
    // 3. 生成所有LOD层级
    return this.generateFromPCM(pcmData, audioTrackInfo.sampleRate, onProgress)
  }
  
  /**
   * 从原始PCM数据生成LOD
   * 
   * @param pcmData 原始PCM数据（多声道）
   * @param sampleRate 采样率
   * @param onProgress 进度回调（0-100）
   * @returns 完整的LOD数据
   */
  async generateFromPCM(
    pcmData: Float32Array[],
    sampleRate: number,
    onProgress?: LODProgressCallback
  ): Promise<AudioWaveformLOD> {
    if (!pcmData || pcmData.length === 0) {
      throw new Error('PCM数据为空')
    }
    
    // 只使用第一个声道
    const firstChannelData = pcmData[0]
    
    // 验证PCM数据
    if (!validatePCMData(firstChannelData)) {
      throw new Error('PCM数据无效（包含NaN或Infinity）')
    }
    
    const levels = new Map<WaveformLODLevel, WaveformLODData>()
    const totalSteps = LOD_CONFIGS.length
    
    // 生成每个LOD层级（只处理第一个声道）
    for (let i = 0; i < LOD_CONFIGS.length; i++) {
      const config = LOD_CONFIGS[i]
      
      const lodData = this.generateSingleLevel(
        firstChannelData,
        config.level,
        config.downsampleFactor,
        sampleRate
      )
      
      levels.set(config.level, lodData)
      
      // 更新进度
      if (onProgress) {
        const progress = Math.round(((i + 1) / totalSteps) * 100)
        onProgress(progress)
      }
      
      // 让出控制权，避免阻塞UI
      if (i < LOD_CONFIGS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }
    
    return {
      levels,
      metadata: {
        sampleRate,
        channels: pcmData.length,
        duration: firstChannelData.length / sampleRate,
        totalSamples: firstChannelData.length,
      },
      status: 'ready',
      progress: 100,
      generatedAt: Date.now(),
      isGenerating: false,
      version: 1,
    }
  }
  
  /**
   * 生成单个LOD层级（只处理第一个声道）
   * 
   * @param pcmData 单声道PCM数据
   * @param level LOD层级
   * @param downsampleFactor 降采样因子
   * @param sampleRate 采样率
   * @returns LOD层级数据
   */
  private generateSingleLevel(
    pcmData: Float32Array,
    level: WaveformLODLevel,
    downsampleFactor: number,
    sampleRate: number
  ): WaveformLODData {
    const { maxValues, minValues } = generateLODLevel(pcmData, downsampleFactor)
    
    return {
      level,
      downsampleFactor,
      sampleRate,
      duration: pcmData.length / sampleRate,
      maxValues,
      minValues,
    }
  }
  
  /**
   * 从BunnyMedia提取PCM数据
   * 
   * @param bunnyMedia MediaBunny实例
   * @returns PCM数据数组（每个声道一个Float32Array）
   */
  private async extractPCMFromBunnyMedia(
    bunnyMedia: BunnyMedia
  ): Promise<Float32Array[]> {
    const audioBuffersFunc = bunnyMedia.audioBuffersFunc()
    if (!audioBuffersFunc) {
      throw new Error('音频轨道不存在')
    }

    const allChannelData: Float32Array[][] = []
    
    // 遍历所有音频缓冲区
    for await (const wrappedBuffer of audioBuffersFunc()) {
      const audioBuffer = wrappedBuffer.buffer
      
      // 提取每个声道的数据
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        if (!allChannelData[channel]) {
          allChannelData[channel] = []
        }
        const channelData = audioBuffer.getChannelData(channel)
        allChannelData[channel].push(new Float32Array(channelData))
      }
    }
    
    // 合并每个声道的所有片段
    return allChannelData.map(channelFragments => {
      const totalLength = channelFragments.reduce((sum, arr) => sum + arr.length, 0)
      const merged = new Float32Array(totalLength)
      let offset = 0
      for (const fragment of channelFragments) {
        merged.set(fragment, offset)
        offset += fragment.length
      }
      return merged
    })
  }
  
}