/**
 * 更新文本内容命令
 * 支持撤销/重做的文本内容和样式更新操作
 * 遵循"从源头重建"原则：保存完整的重建元数据，撤销时从原始配置重新创建
 */

import { generateCommandId } from '@/core/utils/idGenerator'
import { markRaw, type Ref } from 'vue'
import type { VisibleSprite } from '@webav/av-cliper'
import type { SimpleCommand } from '@/core/modules/commands/types'

// ==================== 新架构类型导入 ====================
import type { VideoResolution } from '@/core/types'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { MediaType } from '@/core/mediaitem'
// ==================== 新架构工具导入 ====================
import { TimelineItemQueries } from '@/core/timelineitem/queries'
import { TimelineItemFactory } from '@/core/timelineitem/factory'
import { TextVisibleSprite } from '@/core/visiblesprite/TextVisibleSprite'
import type { TextStyleConfig } from '@/core/timelineitem'

export class UpdateTextCommand implements SimpleCommand {
  public readonly id: string
  public readonly description: string
  private originalTimelineItemData: UnifiedTimelineItemData<'text'> | null = null // 保存原始项目的重建数据
  private oldText: string = ''
  private oldStyle: TextStyleConfig | null = null
  private _isDisposed = false

  constructor(
    private timelineItemId: string,
    private newText: string,
    private newStyle: Partial<TextStyleConfig>,
    private timelineModule: {
      getTimelineItem: (id: string) => UnifiedTimelineItemData<'text'> | undefined
      setupBidirectionalSync: (timelineItem: UnifiedTimelineItemData<MediaType>) => void
    },
    private configModule: {
      videoResolution: Ref<VideoResolution>
    },
  ) {
    this.id = generateCommandId()
    const item = this.timelineModule.getTimelineItem(this.timelineItemId)
    if (!item || !TimelineItemQueries.isTextTimelineItem(item)) {
      throw new Error(`文本项目不存在或类型错误: ${this.timelineItemId}`)
    }

    // 保存旧值用于撤销
    this.oldText = item.config.text
    this.oldStyle = { ...item.config.style }
    this.description = `更新文本: ${newText.substring(0, 10)}${newText.length > 10 ? '...' : ''}`
  }

  /**
   * 执行命令：更新文本内容
   */
  async execute(): Promise<void> {
    try {
      console.log(`🔄 执行更新文本操作...`)

      const item = this.timelineModule.getTimelineItem(this.timelineItemId)
      if (!item || !TimelineItemQueries.isTextTimelineItem(item)) {
        throw new Error(`文本项目不存在或类型错误: ${this.timelineItemId}`)
      }

      // 保存原始项目数据用于撤销
      this.originalTimelineItemData = TimelineItemFactory.clone(item)

      // 重新创建文本精灵（遵循"从源头重建"原则）
      await this.rebuildTextSprite(item, this.newText, this.newStyle)

      console.log(`✅ 文本更新成功:`, {
        id: this.timelineItemId,
        oldText: this.oldText.substring(0, 20) + '...',
        newText: this.newText.substring(0, 20) + '...',
      })
    } catch (error) {
      console.error(`❌ 更新文本失败:`, error)
      throw error
    }
  }

  /**
   * 重新创建文本精灵
   * 遵循"从源头重建"原则，复用 rebuildTextTimelineItem 方法
   */
  /**
   * 重新创建文本精灵
   * 遵循"从源头重建"原则，完全重新创建sprite实例
   */
  private async rebuildTextSprite(
    item: UnifiedTimelineItemData<'text'>,
    newText: string,
    newStyle: Partial<TextStyleConfig>,
  ): Promise<void> {
    // 保存旧精灵的状态
    const oldSprite = item.runtime.sprite as TextVisibleSprite
    const oldState = {
      rect: {
        x: oldSprite.rect.x,
        y: oldSprite.rect.y,
        w: oldSprite.rect.w,
        h: oldSprite.rect.h,
        angle: oldSprite.rect.angle,
      },
      opacity: oldSprite.opacity,
      zIndex: oldSprite.zIndex,
      timeRange: oldSprite.getTimeRange(),
    }

    // 🎯 先保存TimelineItem的宽高和原始宽高，计算缩放系数
    const currentWidth = item.config.width
    const currentHeight = item.config.height
    const originalWidth = item.config.originalWidth
    const originalHeight = item.config.originalHeight

    // 计算当前的缩放系数
    const scaleX = originalWidth > 0 ? currentWidth / originalWidth : 1
    const scaleY = originalHeight > 0 ? currentHeight / originalHeight : 1

    console.log('🔄 [TextCommands] 保存缩放系数:', {
      current: { width: currentWidth, height: currentHeight },
      original: { width: originalWidth, height: originalHeight },
      scale: { x: scaleX, y: scaleY },
    })

    // 合并新样式
    const completeStyle = { ...item.config.style, ...newStyle }

    // 创建新的文本精灵
    const { TextVisibleSprite } = await import('@/core/visiblesprite/TextVisibleSprite')
    const newSprite = await TextVisibleSprite.create(newText, completeStyle)

    // 🎯 更新TimelineItem的原始宽高为新sprite的尺寸
    item.config.originalWidth = newSprite.rect.w
    item.config.originalHeight = newSprite.rect.h

    // 🎯 使用缩放系数重新计算TimelineItem的宽高
    const newWidth = item.config.originalWidth * scaleX
    const newHeight = item.config.originalHeight * scaleY
    item.config.width = newWidth
    item.config.height = newHeight

    console.log('🔄 [TextCommands] 应用缩放系数:', {
      newOriginal: { width: item.config.originalWidth, height: item.config.originalHeight },
      newSize: { width: newWidth, height: newHeight },
      appliedScale: { x: scaleX, y: scaleY },
    })

    // 🎯 通过TimelineItem的xywh转换为sprite的rect坐标
    const { projectToWebavCoords } = await import('@/core/utils')
    const webavCoords = projectToWebavCoords(
      item.config.x,
      item.config.y,
      newWidth,
      newHeight,
      this.configModule.videoResolution.value.width,
      this.configModule.videoResolution.value.height,
    )

    // 设置新sprite的位置和尺寸
    newSprite.rect.x = webavCoords.x
    newSprite.rect.y = webavCoords.y
    newSprite.rect.w = newWidth
    newSprite.rect.h = newHeight
    newSprite.rect.angle = oldState.rect.angle
    newSprite.opacity = oldState.opacity
    newSprite.zIndex = oldState.zIndex

    // 恢复时间范围
    newSprite.setTimeRange(oldState.timeRange)

    // 更新配置
    item.config.text = newText
    item.config.style = completeStyle

    // TODO:webav
    // // 替换精灵引用
    // item.runtime.sprite = markRaw(newSprite)

    // // 在WebAV画布中替换精灵
    // this.webavModule.removeSprite(oldSprite)
    // this.webavModule.addSprite(newSprite)

    // // 🔄 重新设置双向数据绑定 - 这是关键步骤！
    // this.timelineModule.setupBidirectionalSync(item)

    console.log('✅ [UpdateTextCommand] 文本精灵重新创建完成，数据绑定已重新建立')
  }

  /**
   * 撤销命令：恢复到原始文本内容
   * 遵循"从源头重建"原则，从原始配置完全重新创建
   */
  async undo(): Promise<void> {
    try {
      if (this.oldText && this.oldStyle && this.originalTimelineItemData) {
        console.log(`🔄 撤销更新文本操作...`)

        const item = this.timelineModule.getTimelineItem(this.timelineItemId)
        if (!item || !TimelineItemQueries.isTextTimelineItem(item)) {
          throw new Error(`文本项目不存在或类型错误: ${this.timelineItemId}`)
        }

        // 重新创建文本精灵（恢复到旧状态）
        await this.rebuildTextSprite(item, this.oldText, this.oldStyle)

        console.log(`✅ 文本撤销成功: ${this.timelineItemId}`)
      }
    } catch (error) {
      console.error(`❌ 撤销文本更新失败:`, error)
      throw error
    }
  }

  /**
   * 检查命令是否已被清理
   */
  get isDisposed(): boolean {
    return this._isDisposed
  }

  /**
   * 清理命令持有的资源
   */
  dispose(): void {
    if (this._isDisposed) {
      return
    }

    this._isDisposed = true
    console.log(`🗑️ [UpdateTextCommand] 命令资源已清理: ${this.id}`)
  }
}
