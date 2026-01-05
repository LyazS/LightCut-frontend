/**
 * 音频波形渲染器
 * 
 * 负责将LOD数据渲染到Canvas
 * 支持渐变色、振幅缩放等视觉效果
 */

import type { WaveformLODData, WaveformRenderOptions } from './types'
import { int16ToFloat } from './utils'

/**
 * 音频波形渲染器类
 */
export class AudioWaveformRenderer {
  /**
   * 渲染指定时间范围的波形
   * 
   * @param canvas Canvas元素
   * @param lodData LOD数据
   * @param startTime 开始时间（秒）
   * @param endTime 结束时间（秒）
   * @param options 渲染选项
   */
  renderRange(
    canvas: HTMLCanvasElement,
    lodData: WaveformLODData,
    startTime: number,
    endTime: number,
    options: WaveformRenderOptions
  ): void {
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      console.warn('无法获取Canvas 2D上下文')
      return
    }
    
    // 计算样本索引范围
    const { startIndex, endIndex } = this.calculateIndexRange(
      startTime,
      endTime,
      lodData
    )
    
    // 设置Canvas尺寸
    canvas.width = options.width
    canvas.height = options.height
    
    // 清空画布
    if (options.backgroundColor) {
      ctx.fillStyle = options.backgroundColor
      ctx.fillRect(0, 0, options.width, options.height)
    } else {
      ctx.clearRect(0, 0, options.width, options.height)
    }
    
    // 绘制波形（使用第一个声道）
    this.drawWaveform(
      ctx,
      lodData.maxValues,
      lodData.minValues,
      startIndex,
      endIndex,
      options
    )
    
    // 绘制基线
    this.drawBaseline(ctx, options)
  }
  
  /**
   * 计算时间范围对应的样本索引
   * 
   * @param startTime 开始时间（秒）
   * @param endTime 结束时间（秒）
   * @param lodData LOD数据
   * @returns 样本索引范围
   */
  private calculateIndexRange(
    startTime: number,
    endTime: number,
    lodData: WaveformLODData
  ): { startIndex: number; endIndex: number } {
    // 计算降采样后的采样率
    const samplesPerSecond = lodData.sampleRate / lodData.downsampleFactor
    
    const startIndex = Math.floor(startTime * samplesPerSecond)
    const endIndex = Math.ceil(endTime * samplesPerSecond)
    
    return {
      startIndex: Math.max(0, startIndex),
      endIndex: Math.min(lodData.maxValues.length, endIndex)
    }
  }
  
  /**
   * 绘制波形
   * 
   * @param ctx Canvas 2D上下文
   * @param maxValues 最大值数组（Int16格式）
   * @param minValues 最小值数组（Int16格式）
   * @param startIndex 开始索引
   * @param endIndex 结束索引
   * @param options 渲染选项
   */
  private drawWaveform(
    ctx: CanvasRenderingContext2D,
    maxValues: Int16Array,
    minValues: Int16Array,
    startIndex: number,
    endIndex: number,
    options: WaveformRenderOptions
  ): void {
    const { width, height, amplitude = 1.0, baselineY, gradient } = options
    const sampleCount = endIndex - startIndex
    
    if (sampleCount <= 0) {
      return
    }
    
    const pixelsPerSample = width / sampleCount
    
    // 设置渐变色或纯色
    if (gradient) {
      ctx.fillStyle = gradient
    } else {
      ctx.fillStyle = '#4ecdc4' // 默认颜色
    }
    
    // 绘制每个样本
    for (let i = 0; i < sampleCount; i++) {
      const sampleIndex = startIndex + i
      
      // 防止越界
      if (sampleIndex >= maxValues.length) {
        break
      }
      
      const x = i * pixelsPerSample
      
      // 从Int16转换为归一化的Float值 (-1.0 到 1.0)
      const maxValue = int16ToFloat(maxValues[sampleIndex])
      const minValue = int16ToFloat(minValues[sampleIndex])
      
      // 计算波形的振幅范围（max和min之间的差值）
      const amplitude_range = Math.max(Math.abs(maxValue), Math.abs(minValue))
      
      // 计算波形高度（只在baseline上方显示）
      const waveHeight = amplitude_range * (baselineY - 10) * amplitude
      const topY = baselineY - waveHeight
      
      // 绘制垂直线条（至少1像素宽）
      if (waveHeight > 0.5) {
        ctx.fillRect(x, topY, Math.max(1, pixelsPerSample), waveHeight)
      }
    }
  }
  
  /**
   * 绘制基线
   * 
   * @param ctx Canvas 2D上下文
   * @param options 渲染选项
   */
  private drawBaseline(
    ctx: CanvasRenderingContext2D,
    options: WaveformRenderOptions
  ): void {
    const { width, baselineY } = options
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, baselineY)
    ctx.lineTo(width, baselineY)
    ctx.stroke()
  }
  
  /**
   * 创建渐变色
   * 
   * @param ctx Canvas 2D上下文
   * @param height Canvas高度
   * @returns 渐变色对象
   */
  createGradient(
    ctx: CanvasRenderingContext2D,
    height: number
  ): CanvasGradient {
    const gradient = ctx.createLinearGradient(0, height, 0, 0)
    gradient.addColorStop(0, '#96ceb4')
    gradient.addColorStop(0.3, '#4ecdc4')
    gradient.addColorStop(0.6, '#45b7d1')
    gradient.addColorStop(1, '#ff6b6b')
    return gradient
  }
  
}