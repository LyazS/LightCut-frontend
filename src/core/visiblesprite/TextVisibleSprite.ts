import { ImgClip } from '@webav/av-cliper'
import { debounce } from 'lodash'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import type { TextStyleConfig } from '@/core/timelineitem/type'
import { framesToMicroseconds } from '@/core/utils/timeUtils'
import { BaseVisibleSprite } from '@/core/visiblesprite/BaseVisibleSprite'
import { TextHelper } from '@/core/utils'

/**
 * 文本可见精灵类，继承自BaseVisibleSprite
 * 提供文本内容和样式的动态更新能力
 */
export class TextVisibleSprite extends BaseVisibleSprite {
  /**
   * 当前文本内容
   */
  #text: string

  /**
   * 当前文本样式配置
   */
  #textStyle: TextStyleConfig

  /**
   * 时间范围信息（帧数版本）
   * 对于文本，clipStartTime 和 clipEndTime 都设置为 -1，不使用
   * 所有时间计算都基于 timelineStartTime 和 timelineEndTime
   */
  #timeRange: UnifiedTimeRange = {
    timelineStartTime: 0, // 帧数
    timelineEndTime: 150, // 默认150帧（5秒@30fps）
    clipStartTime: -1, // 文本不使用此属性
    clipEndTime: -1, // 文本不使用此属性
  }

  /**
   * 更新状态标记
   */
  #isUpdating: boolean = false

  /**
   * 防抖延迟时间（毫秒）
   */
  private static readonly DEBOUNCE_DELAY = 300

  /**
   * 防抖更新函数
   */
  #debouncedUpdate: ReturnType<typeof debounce>

  /**
   * 默认显示时长（帧数） - 150帧（5秒@30fps）
   */
  public static readonly DEFAULT_DURATION = 150

  /**
   * 私有构造函数，使用静态工厂方法创建实例
   * @param clip ImgClip实例
   * @param text 文本内容
   * @param style 文本样式
   */
  private constructor(clip: ImgClip, text: string, style: TextStyleConfig) {
    // 调用父类构造函数
    super(clip)

    this.#text = text
    this.#textStyle = style

    // 初始化防抖更新函数
    this.#debouncedUpdate = debounce(() => this.#performUpdate(), TextVisibleSprite.DEBOUNCE_DELAY)

    // 初始化时间设置
    this.#updateVisibleSpriteTime()

    console.log('✅ [TextVisibleSprite] 文本精灵创建完成:', {
      text: text.substring(0, 20) + (text.length > 20 ? '...' : ''),
      style: style,
    })
  }

  /**
   * 静态工厂方法：创建文本精灵
   * @param text 文本内容
   * @param style 文本样式配置（可选，使用默认样式）
   * @returns Promise<TextVisibleSprite>
   */
  static async create(
    text: string = '示例文本',
    style: Partial<TextStyleConfig> = {},
  ): Promise<TextVisibleSprite> {
    try {
      console.log('🎨 [TextVisibleSprite] 开始创建文本精灵:', { text, style })

      // 验证和补全样式配置
      const validatedStyle = TextHelper.validateTextStyle(style)

      // 创建文本 ImgClip
      const imgClip = await TextHelper.createTextImgClip(text, validatedStyle)

      // 创建精灵实例
      const sprite = new TextVisibleSprite(imgClip, text, validatedStyle)

      console.log('✅ [TextVisibleSprite] 文本精灵创建成功')
      return sprite
    } catch (error) {
      console.error('❌ [TextVisibleSprite] 创建文本精灵失败:', error)
      throw new Error(`创建文本精灵失败: ${(error as Error).message}`)
    }
  }

  // ==================== 文本更新接口 ====================

  /**
   * 更新文本内容
   * @param text 新的文本内容
   */
  async updateText(text: string): Promise<void> {
    if (this.#text === text) {
      console.log('📝 [TextVisibleSprite] 文本内容未变化，跳过更新')
      return
    }

    console.log('📝 [TextVisibleSprite] 更新文本内容:', {
      old: this.#text.substring(0, 20) + '...',
      new: text.substring(0, 20) + '...',
    })

    this.#text = text
    await this.#scheduleUpdate()
  }

  /**
   * 更新文本样式
   * @param style 新的文本样式配置
   */
  async updateStyle(style: Partial<TextStyleConfig>): Promise<void> {
    const newStyle = TextHelper.validateTextStyle({ ...this.#textStyle, ...style })

    // 检查样式是否真的有变化
    if (JSON.stringify(this.#textStyle) === JSON.stringify(newStyle)) {
      console.log('🎨 [TextVisibleSprite] 文本样式未变化，跳过更新')
      return
    }

    console.log('🎨 [TextVisibleSprite] 更新文本样式:', { old: this.#textStyle, new: newStyle })

    this.#textStyle = newStyle
    await this.#scheduleUpdate()
  }

  /**
   * 同时更新文本内容和样式
   * @param text 新的文本内容
   * @param style 新的文本样式配置
   */
  async updateTextAndStyle(text: string, style: Partial<TextStyleConfig>): Promise<void> {
    const newStyle = TextHelper.validateTextStyle({ ...this.#textStyle, ...style })

    // 检查是否有变化
    const textChanged = this.#text !== text
    const styleChanged = JSON.stringify(this.#textStyle) !== JSON.stringify(newStyle)

    if (!textChanged && !styleChanged) {
      console.log('📝🎨 [TextVisibleSprite] 文本和样式均未变化，跳过更新')
      return
    }

    console.log('📝🎨 [TextVisibleSprite] 同时更新文本和样式:', {
      textChanged,
      styleChanged,
      text: text.substring(0, 20) + '...',
      style: newStyle,
    })

    this.#text = text
    this.#textStyle = newStyle
    await this.#scheduleUpdate()
  }

  // ==================== 获取器方法 ====================

  /**
   * 获取当前文本内容
   * @returns 当前文本内容
   */
  getText(): string {
    return this.#text
  }

  /**
   * 获取当前文本样式
   * @returns 当前文本样式配置
   */
  getTextStyle(): TextStyleConfig {
    return { ...this.#textStyle } // 返回副本，避免外部修改
  }

  /**
   * 获取文本渲染后的尺寸信息
   * @returns 文本尺寸信息
   */
  async getTextMeta(): Promise<{ width: number; height: number }> {
    const clip = this.getClip() as ImgClip
    if (clip && 'meta' in clip) {
      const meta = clip.meta
      return {
        width: meta.width,
        height: meta.height,
      }
    }
    return { width: 0, height: 0 }
  }

  // ==================== 时间轴接口 ====================

  /**
   * 设置在时间轴上的开始时间（文本在整个项目时间轴上的位置）
   * @param startTime 时间轴开始时间（帧数）
   */
  setTimelineStartTime(startTime: number): void {
    this.#timeRange.timelineStartTime = Math.round(startTime)
    this.#updateVisibleSpriteTime()
  }

  /**
   * 设置在时间轴上的结束时间
   * @param endTime 时间轴结束时间（帧数）
   */
  setTimelineEndTime(endTime: number): void {
    this.#timeRange.timelineEndTime = Math.round(endTime)
    this.#updateVisibleSpriteTime()
  }

  /**
   * 获取在时间轴上的开始时间
   * @returns 时间轴开始时间（帧数）
   */
  getTimelineStartTime(): number {
    return this.#timeRange.timelineStartTime
  }

  /**
   * 获取在时间轴上的结束时间
   * @returns 时间轴结束时间（帧数）
   */
  getTimelineEndTime(): number {
    return this.#timeRange.timelineEndTime
  }

  /**
   * 同时设置时间轴的时间范围
   * @param options 时间范围配置
   */
  setTimeRange(options: {
    timelineStartTime?: number
    timelineEndTime?: number
    clipStartTime?: number
    clipEndTime?: number
  }): void {
    if (options.timelineStartTime !== undefined) {
      this.#timeRange.timelineStartTime = Math.round(options.timelineStartTime)
    }
    if (options.timelineEndTime !== undefined) {
      this.#timeRange.timelineEndTime = Math.round(options.timelineEndTime)
    }
    // 对于文本，忽略 clipStartTime 和 clipEndTime 参数，保持为 -1

    this.#updateVisibleSpriteTime()
  }

  /**
   * 获取时间范围信息
   * @returns 时间范围信息
   */
  getTimeRange(): UnifiedTimeRange {
    return { ...this.#timeRange } // 返回副本
  }

  /**
   * 重置时间范围到默认状态
   */
  resetTimeRange(): void {
    this.#timeRange = {
      timelineStartTime: 0,
      timelineEndTime: TextVisibleSprite.DEFAULT_DURATION,
      clipStartTime: -1, // 文本不使用此属性
      clipEndTime: -1, // 文本不使用此属性
    }
    this.#updateVisibleSpriteTime()
  }

  /**
   * 检查时间范围是否有效
   * @returns 是否有效
   */
  isTimeRangeValid(): boolean {
    const { timelineStartTime, timelineEndTime } = this.#timeRange

    // 检查时间轴时间范围是否有效
    if (timelineStartTime < 0 || timelineEndTime < 0) return false
    if (timelineStartTime >= timelineEndTime) return false

    return true
  }

  // ==================== 私有方法 ====================

  /**
   * 调度更新（带防抖）
   */
  async #scheduleUpdate(): Promise<void> {
    // 使用 lodash 的防抖函数
    this.#debouncedUpdate()
  }

  /**
   * 执行实际的更新操作
   * 注意：由于 WebAV 的 VisibleSprite 在构造时绑定 clip，无法运行时替换
   * 这个方法主要用于触发外部重新创建精灵的流程
   */
  async #performUpdate(): Promise<void> {
    if (this.#isUpdating) {
      console.log('⏳ [TextVisibleSprite] 正在更新中，跳过重复更新')
      return
    }

    this.#isUpdating = true

    try {
      console.log('🔄 [TextVisibleSprite] 开始执行文本更新')

      // 由于 WebAV 的限制，我们无法直接替换内部的 clip
      // 实际的更新需要通过外部重新创建精灵来实现
      // 这里我们只触发更新事件，让外部系统知道需要重新创建

      // 触发更新事件，通知外部需要重新创建精灵
      this.getEventTool().emit('propsChange', {
        // 添加文本更新的标记
        textUpdate: {
          text: this.#text,
          style: this.#textStyle,
          needsRecreation: true,
        },
      })

      console.log('📢 [TextVisibleSprite] 文本更新事件已触发，等待外部重新创建精灵')
    } catch (error) {
      console.error('❌ [TextVisibleSprite] 文本更新失败:', error)
      throw error
    } finally {
      this.#isUpdating = false
    }
  }

  /**
   * 创建新的文本精灵实例（用于替换当前实例）
   * @returns Promise<TextVisibleSprite> 新的精灵实例
   */
  async createUpdatedSprite(): Promise<TextVisibleSprite> {
    console.log('🔄 [TextVisibleSprite] 创建更新后的精灵实例')

    // 保存当前状态
    const currentState = this.#saveCurrentState()

    // 创建新的精灵
    const newSprite = await TextVisibleSprite.create(this.#text, this.#textStyle)

    // 恢复状态
    newSprite.rect.x = currentState.rect.x
    newSprite.rect.y = currentState.rect.y
    newSprite.rect.w = currentState.rect.w
    newSprite.rect.h = currentState.rect.h
    newSprite.rect.angle = currentState.rect.angle
    newSprite.setOpacityValue(currentState.opacity)
    newSprite.zIndex = currentState.zIndex

    // 恢复时间范围
    newSprite.#timeRange = { ...currentState.timeRange }
    newSprite.#updateVisibleSpriteTime()

    console.log('✅ [TextVisibleSprite] 更新后的精灵实例创建完成')
    return newSprite
  }

  /**
   * 保存当前精灵状态
   */
  #saveCurrentState() {
    return {
      rect: {
        x: this.rect.x,
        y: this.rect.y,
        w: this.rect.w,
        h: this.rect.h,
        angle: this.rect.angle,
      },
      opacity: this.getOpacityValue(),
      zIndex: this.zIndex,
      timeRange: { ...this.#timeRange },
    }
  }

  /**
   * 更新 VisibleSprite 的 time 属性
   * 根据当前的时间范围设置同步更新父类的时间属性
   * 内部使用帧数计算，设置WebAV时转换为微秒
   */
  #updateVisibleSpriteTime(): void {
    const { timelineStartTime, timelineEndTime } = this.#timeRange
    const displayDuration = timelineEndTime - timelineStartTime

    // 设置 VisibleSprite.time 属性（转换为微秒给WebAV）
    // offset: 在时间轴上的播放开始位置（微秒）
    // duration: 在时间轴上占用的时长（微秒）
    // 文本不需要playbackRate，保持默认值1.0
    this.time = {
      offset: framesToMicroseconds(timelineStartTime),
      duration: framesToMicroseconds(displayDuration),
      playbackRate: 1.0, // 文本固定为1.0，没有倍速概念
    }
  }
}
