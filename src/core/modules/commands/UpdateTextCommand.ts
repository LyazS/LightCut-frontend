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
import type { TextStyleConfig } from '@/core/timelineitem/texttype'
import { textToImageBitmap2 } from '@/core/bunnyUtils/ToBitmap'

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

      // 1. 保存原始数据
      const oldConfigHeight = item.config.height
      const oldConfigWidth = item.config.width
      const oldBitmapHeight = item.runtime.textBitmap?.height ?? oldConfigHeight
      const oldBitmapWidth = item.runtime.textBitmap?.width ?? oldConfigWidth

      const bitmapHeightRatio = oldConfigHeight / oldBitmapHeight
      const bitmapWidthRatio = oldConfigWidth / oldBitmapWidth

      // 2. 合并新样式到旧样式
      const mergedStyle: TextStyleConfig = {
        ...item.config.style,
        ...this.newStyle,
      }

      // 3. 使用 textToImageBitmap2 重建 textBitmap
      const newTextBitmap = await textToImageBitmap2(this.newText, mergedStyle)
      const newBitmapHeight = newTextBitmap.height
      const newBitmapWidth = newTextBitmap.width

      // 6. 更新 item 的配置
      item.config.text = this.newText
      item.config.style = mergedStyle

      // 按比例调整宽高
      item.config.height = newBitmapHeight * bitmapHeightRatio
      item.config.width = newBitmapWidth * bitmapWidthRatio

      // 7. 更新 runtime.textBitmap
      item.runtime.textBitmap?.close()
      item.runtime.textBitmap = newTextBitmap
    } catch (error) {
      console.error(`❌ 更新文本失败:`, error)
      throw error
    }
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

        // 1. 使用原始数据重建 textBitmap
        const originalStyle = this.originalTimelineItemData.config.style
        const originalText = this.originalTimelineItemData.config.text
        const newTextBitmap = await textToImageBitmap2(originalText, originalStyle)

        // 2. 批量恢复原始配置（保持响应式引用）
        Object.assign(item.config, this.originalTimelineItemData.config)

        // 3. 更新 runtime.textBitmap
        item.runtime.textBitmap?.close()
        item.runtime.textBitmap = newTextBitmap

        console.log(`✅ 文本撤销成功: ${this.timelineItemId}`, {
          restoredText: originalText.substring(0, 20) + '...',
          restoredSize: { width: item.config.width, height: item.config.height },
        })
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
