# MediaSync机制重构方案（最终版）

## 概述

本方案基于现有的 `BaseDataSourceProcessor` 架构，通过扩展 `AcquisitionTask` 和修改回调机制，实现更优雅的MediaSync处理。

**重要改进**：针对原方案中使用 `source` 字段判断是否需要更新数据的逻辑不准确问题，改为在 `runtime` 中使用 `needsSync` 字段进行精确控制。

## 核心设计

### 1. 扩展 AcquisitionTask 接口

```typescript
// 在 BaseDataSourceProcessor.ts 中扩展
export interface AcquisitionTask {
  /** 任务唯一标识符 */
  id: string
  /** 关联的媒体项目数据 */
  mediaItem: UnifiedMediaItemData
  /** 媒体处理回调 */
  callbacks?: MediaProcessingCallbacks
}

// 回调接口
export interface MediaProcessingCallbacks {
  onSuccess?: (mediaItem: UnifiedMediaItemData) => void | Promise<void>
  onError?: (mediaItem: UnifiedMediaItemData, error: Error) => void | Promise<void>
}
```

### 2. 修改 BaseDataSourceProcessor

```typescript
export abstract class DataSourceProcessor {
  // ... 现有代码

  /**
   * 添加任务到队列（支持回调）
   * @param mediaItem 媒体项目
   * @param callbacks 媒体处理回调
   */
  addTask(mediaItem: UnifiedMediaItemData, callbacks?: MediaProcessingCallbacks): void {
    const taskId = mediaItem.id

    const task: AcquisitionTask = {
      id: taskId,
      mediaItem: mediaItem,
      callbacks: callbacks, // 存储回调
    }

    this.tasks.set(taskId, task)
    console.log(`📋 [${this.getProcessorType()}] 任务已加入队列: ${taskId} (${mediaItem.name})`)

    this.executeTaskWithLimit(task)
  }

  /**
   * 使用 p-limit 执行任务（支持回调）
   */
  private async executeTaskWithLimit(task: AcquisitionTask): Promise<void> {
    return this.limit(async () => {
      try {
        // 执行具体的任务逻辑
        await this.executeTask(task)
        
        // 任务执行成功后调用 onSuccess 回调
        if (task.callbacks?.onSuccess) {
          try {
            await task.callbacks.onSuccess(task.mediaItem)
          } catch (callbackError) {
            console.error(`❌ [${this.getProcessorType()}] onSuccess 回调执行失败: ${task.id}`, callbackError)
          }
        }
        
      } catch (error) {
        // 任务执行失败后调用 onError 回调
        if (task.callbacks?.onError) {
          try {
            await task.callbacks.onError(task.mediaItem, error as Error)
          } catch (callbackError) {
            console.error(`❌ [${this.getProcessorType()}] onError 回调执行失败: ${task.id}`, callbackError)
          }
        }
        
        console.error(`❌ [${this.getProcessorType()}] 任务执行失败: ${task.id}`, error)
      } finally {
        this.tasks.delete(task.id)
      }
    })
  }

  // ... 其他现有代码
}
```

### 3. 改进的数据结构

```typescript
// 时间轴项目运行时数据：添加简单的同步控制字段
export interface UnifiedTimelineItemRuntime<T extends MediaType = MediaType> {
  /** 与时间轴项目生命周期一致 */
  bunnyClip?: Raw<BunnyClip>
  textBitmap?: ImageBitmap
  renderConfig?: GetConfigs<T>
  
  // 🆕 新增：是否需要媒体数据同步（运行时数据，不持久化）
  needsSync?: boolean
}

// 命令：直接用Set存储关联的媒体ID
export interface SimpleCommand {
  // ... 现有字段
  mediaItemIds: Set<string>
  updateMediaData?(mediaItemId: string, mediaData: UnifiedMediaItemData): void
}
```

### 4. 核心同步函数

```typescript
/**
 * 判断时间轴项目是否需要媒体数据同步
 * @param timelineItem 时间轴项目
 * @returns 是否需要同步
 */
function shouldSyncTimelineItem(timelineItem: UnifiedTimelineItemData): boolean {
  // 1. 如果时间轴项目已经是 ready 状态，不需要同步
  if (timelineItem.timelineStatus === 'ready') {
    return false
  }
  
  // 2. 如果时间轴项目是 error 状态，不需要同步
  if (timelineItem.timelineStatus === 'error') {
    return false
  }
  
  // 3. 如果时间轴项目是 loading 状态，检查 needsSync 标记
  if (timelineItem.timelineStatus === 'loading') {
    // 检查运行时同步标记，默认为 false（不同步）
    return timelineItem.runtime.needsSync ?? false
  }
  
  return false
}

/**
 * 统一的时间轴项目更新逻辑
 */
function updateTimelineItemFromMedia(
  timelineItem: UnifiedTimelineItemData,
  mediaItem: UnifiedMediaItemData
): void {
  const config = timelineItem.config as any
  
  // 更新尺寸信息
  if (mediaItem.runtime.bunny?.originalWidth && mediaItem.runtime.bunny?.originalHeight) {
    config.width = mediaItem.runtime.bunny.originalWidth
    config.height = mediaItem.runtime.bunny.originalHeight
  }
  
  // 更新时长信息
  if (mediaItem.duration !== undefined) {
    const startTime = timelineItem.timeRange.timelineStartTime
    const clipStartTime = timelineItem.timeRange.clipStartTime
    timelineItem.timeRange = {
      timelineStartTime: startTime,
      timelineEndTime: startTime + mediaItem.duration,
      clipStartTime: clipStartTime,
      clipEndTime: clipStartTime + mediaItem.duration,
    }
  }
  
  // 更新状态
  timelineItem.timelineStatus = 'ready'
  
  // 标记同步完成
  timelineItem.runtime.needsSync = false
}

/**
 * 更新相关的时间轴项目
 */
function updateRelatedTimelineItems(mediaItem: UnifiedMediaItemData): void {
  const store = useUnifiedStore()
  const relatedItems = store.timelineItems.value.filter(
    item => item.mediaItemId === mediaItem.id
  )
  
  for (const timelineItem of relatedItems) {
    // 🌟 使用精确的同步判断逻辑
    if (shouldSyncTimelineItem(timelineItem)) {
      updateTimelineItemFromMedia(timelineItem, mediaItem)
      console.log(`🔄 已更新时间轴项目: ${timelineItem.id}`)
    } else {
      console.log(`⏭️ 跳过时间轴项目: ${timelineItem.id} (无需同步)`)
    }
  }
}

/**
 * 更新相关的命令
 */
function updateRelatedCommands(mediaItem: UnifiedMediaItemData): void {
  const store = useUnifiedStore()
  const commands = store.getAllCommands()
  
  for (const command of commands) {
    if (command.isDisposed) continue
    
    // 检查命令是否关联了这个媒体项目
    if (command.mediaItemIds.has(mediaItem.id) && command.updateMediaData) {
      command.updateMediaData(mediaItem.id, mediaItem)
      console.log(`🔄 已更新命令: ${command.id}`)
    }
  }
}

/**
 * 媒体处理成功后的统一处理逻辑
 */
export function handleMediaProcessingSuccess(mediaItem: UnifiedMediaItemData): void {
  console.log(`🎯 开始处理媒体同步: ${mediaItem.name}`)
  
  // 1. 更新相关的时间轴项目
  updateRelatedTimelineItems(mediaItem)
  
  // 2. 更新相关的命令
  updateRelatedCommands(mediaItem)
  
  console.log(`✅ 媒体同步完成: ${mediaItem.name}`)
}
```

### 5. 修改 UnifiedMediaModule

```typescript
function startMediaProcessing(mediaItem: UnifiedMediaItemData) {
  console.log(`🚀 [UnifiedMediaModule] 开始处理媒体项目: ${mediaItem.name}`)

  const dsRegistry = getDataSourceRegistry()
  const processor = dsRegistry.getProcessor(mediaItem.source.type)

  if (processor) {
    // 创建专门用于同步的回调
    const syncCallbacks: MediaProcessingCallbacks = {
      onSuccess: async (mediaItem: UnifiedMediaItemData) => {
        try {
          // 触发统一的媒体同步处理
          handleMediaProcessingSuccess(mediaItem)
        } catch (error) {
          console.error(`❌ [UnifiedMediaModule] 媒体同步处理失败:`, error)
        }
      },
      
      onError: async (mediaItem: UnifiedMediaItemData, error: Error) => {
        console.error(`❌ [UnifiedMediaModule] 媒体处理失败: ${mediaItem.name}`, error)
      }
    }

    // 将回调传递给处理器
    processor.addTask(mediaItem, syncCallbacks)
  } else {
    const error = new Error(`找不到对应的数据源处理器: ${mediaItem.source.type}`)
    console.error(`❌ [UnifiedMediaModule]`, error)
    // 直接设置媒体状态为错误
    mediaItem.mediaStatus = 'error'
    mediaItem.source.errorMessage = error.message
  }
}
```

## 工作流程

1. **调用 startMediaProcessing**
   ```typescript
   startMediaProcessing(mediaItem)  // 无需传入回调，内部自动处理同步
   ```

2. **processor.addTask 存储回调**
   ```typescript
   const task: AcquisitionTask = {
     id: mediaItem.id,
     mediaItem: mediaItem,
     callbacks: syncCallbacks  // 专门用于同步的回调
   }
   ```

3. **executeTask 完成后触发回调**
   ```typescript
   await this.executeTask(task)  // 处理媒体
   
   // 成功后自动调用
   if (task.callbacks?.onSuccess) {
     await task.callbacks.onSuccess(task.mediaItem)
     // 这里会执行：handleMediaProcessingSuccess(mediaItem) - 同步逻辑
   }
   ```

4. **同步逻辑执行**
   ```typescript
   handleMediaProcessingSuccess(mediaItem)
   // -> updateRelatedTimelineItems(mediaItem)  // 只更新 needsSync === true 的项目
   // -> updateRelatedCommands(mediaItem)       // 更新 mediaItemIds.has(mediaItem.id) 的命令
   ```

## 重写 TimelineItemFactory.rebuildForCmd 方法

根据你的要求，需要重写 `TimelineItemFactory.rebuildForCmd` 方法，针对非text类型的媒体项目，根据媒体项目的状态来决定是直接创建ready状态还是loading状态：

```typescript
/**
 * 为命令场景重建时间轴项目（根据媒体状态智能决定）
 * 用于命令执行和项目加载场景，针对非text类型根据媒体状态决定是否直接创建ready状态
 *
 * @param options 重建选项
 * @returns 重建结果，根据媒体状态决定TimelineItem状态
 */
export async function rebuildTimelineItemForCmd(
  options: RebuildKnownTimelineItemOptions,
): Promise<RebuildKnownTimelineItemResult> {
  const { originalTimelineItemData, getMediaItem, logIdentifier } = options

  try {
    if (!originalTimelineItemData) {
      throw new Error('时间轴项目数据不存在')
    }

    console.log(`🔄 [${logIdentifier}] 开始重建时间轴项目（智能状态决定）...`)

    if (TimelineItemQueries.isTextTimelineItem(originalTimelineItemData)) {
      // 文本项目：直接创建ready状态（文本不需要媒体同步）
      console.log(`🔄 [${logIdentifier}] 检测到文本时间轴项目，直接创建ready状态`)

      const newTimelineItem = cloneTimelineItem(originalTimelineItemData, {
        timelineStatus: 'ready',
      })

      return {
        timelineItem: newTimelineItem,
        success: true,
      }
    } else {
      // 非文本项目：根据媒体项目状态决定
      const mediaItem = getMediaItem(originalTimelineItemData.mediaItemId)
      
      if (!mediaItem) {
        console.warn(`⚠️ [${logIdentifier}] 找不到关联的媒体项目: ${originalTimelineItemData.mediaItemId}`)
        // 媒体项目不存在，创建loading状态并标记需要同步
        const newTimelineItem = cloneTimelineItem(originalTimelineItemData, {
          timelineStatus: 'loading',
        }) as UnifiedTimelineItemData<MediaType>
        
        // 标记需要同步
        newTimelineItem.runtime.needsSync = true
        
        return {
          timelineItem: newTimelineItem,
          success: true,
        }
      }

      if (UnifiedMediaItemQueries.isReady(mediaItem)) {
        // 媒体项目已ready：直接创建ready状态并设置bunny对象
        console.log(`🔄 [${logIdentifier}] 媒体项目已ready，直接创建ready状态时间轴项目`)

        const newTimelineItem = cloneTimelineItem(originalTimelineItemData, {
          timelineStatus: 'ready',
        }) as UnifiedTimelineItemData<MediaType>

        // 不需要同步
        newTimelineItem.runtime.needsSync = false

        // 直接设置bunny对象
        try {
          const { setupTimelineItemBunny } = await import('@/core/bunnyUtils/timelineItemSetup')
          await setupTimelineItemBunny(newTimelineItem, mediaItem)
          console.log(`✅ [${logIdentifier}] ready状态时间轴项目创建完成，bunny对象已设置`)
        } catch (bunnyError) {
          console.error(`❌ [${logIdentifier}] 设置bunny对象失败:`, bunnyError)
          // bunny设置失败，降级为loading状态
          newTimelineItem.timelineStatus = 'loading'
          newTimelineItem.runtime.needsSync = true
        }

        return {
          timelineItem: newTimelineItem,
          success: true,
        }
      } else {
        // 媒体项目未ready：创建loading状态并标记需要同步
        console.log(`🔄 [${logIdentifier}] 媒体项目未ready，创建loading状态时间轴项目`)

        const newTimelineItem = cloneTimelineItem(originalTimelineItemData, {
          timelineStatus: 'loading',
        }) as UnifiedTimelineItemData<MediaType>

        // 标记需要同步
        newTimelineItem.runtime.needsSync = true

        console.log(`🔄 [${logIdentifier}] loading状态时间轴项目创建完成:`, {
          id: newTimelineItem.id,
          mediaType: originalTimelineItemData.mediaType,
          timelineStatus: newTimelineItem.timelineStatus,
          needsSync: newTimelineItem.runtime.needsSync,
        })

        return {
          timelineItem: newTimelineItem,
          success: true,
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`❌ [${logIdentifier}] 重建时间轴项目失败:`, errorMessage)

    return {
      timelineItem: originalTimelineItemData as UnifiedTimelineItemData<MediaType>,
      success: false,
      error: errorMessage,
    }
  }
}
```

## 命令示例

### AddTimelineItemCommand（更新版）

更新后的 `AddTimelineItemCommand` 使用重写的 `rebuildForCmd` 方法：

```typescript
export class AddTimelineItemCommand implements SimpleCommand {
  public readonly id: string
  public readonly description: string
  public mediaItemIds: Set<string>
  private originalTimelineItemData: UnifiedTimelineItemData<MediaType>
  
  constructor(timelineItem: UnifiedTimelineItemData<MediaType>) {
    this.id = generateCommandId()
    this.description = `添加时间轴项目: ${timelineItem.id}`
    
    // 关联媒体项目
    this.mediaItemIds = new Set([timelineItem.mediaItemId])
    
    // 保存原始数据用于重建
    this.originalTimelineItemData = TimelineItemFactory.clone(timelineItem)
  }
  
  async execute(): Promise<void> {
    if (!this.originalTimelineItemData) {
      throw new Error('没有有效的时间轴项目数据')
    }
    
    try {
      console.log(`🔄 执行添加操作：从源头重建时间轴项目...`)

      // 🌟 使用重写的 rebuildForCmd，会根据媒体状态智能决定
      const rebuildResult = await TimelineItemFactory.rebuildForCmd({
        originalTimelineItemData: this.originalTimelineItemData,
        getMediaItem: this.mediaModule.getMediaItem,
        logIdentifier: 'AddTimelineItemCommand execute',
      })

      if (!rebuildResult.success) {
        throw new Error(`重建时间轴项目失败: ${rebuildResult.error}`)
      }

      const newTimelineItem = rebuildResult.timelineItem

      // 添加到时间轴
      await this.timelineModule.addTimelineItem(newTimelineItem)

      console.log(`✅ 已添加时间轴项目: ${this.originalTimelineItemData.id}`)
    } catch (error) {
      console.error(`❌ 添加时间轴项目失败: ${this.originalTimelineItemData.id}`, error)
      throw error
    }
  }
  
  async undo(): Promise<void> {
    await this.timelineModule.removeTimelineItem(this.originalTimelineItemData.id)
    console.log(`↩️ 已撤销添加时间轴项目: ${this.originalTimelineItemData.id}`)
  }
  
  updateMediaData(mediaItemId: string, mediaData: UnifiedMediaItemData): void {
    if (this.mediaItemIds.has(mediaItemId)) {
      // 🌟 使用精确的同步判断
      if (shouldSyncTimelineItem(this.originalTimelineItemData)) {
        updateTimelineItemFromMedia(this.originalTimelineItemData, mediaData)
        console.log(`🔄 [AddTimelineItemCommand] 已更新媒体数据: ${this.id}`)
      } else {
        console.log(`⏭️ [AddTimelineItemCommand] 跳过更新: ${this.id} (无需同步)`)
      }
    }
  }
}
```

### RemoveTrackCommand（多媒体场景）

```typescript
export class RemoveTrackCommand implements SimpleCommand {
  public readonly id: string
  public readonly description: string
  public mediaItemIds: Set<string>
  private affectedTimelineItems: UnifiedTimelineItemData<MediaType>[]
  
  constructor(trackId: string) {
    this.id = generateCommandId()
    this.description = `删除轨道: ${trackId}`
    
    // 获取轨道上的所有时间轴项目
    this.affectedTimelineItems = this.getAffectedTimelineItems(trackId)
    
    // 🌟 为每个时间轴项目设置同步标记
    for (const timelineItem of this.affectedTimelineItems) {
      // 只有 loading 状态的项目才需要标记为需要同步
      if (timelineItem.timelineStatus === 'loading') {
        timelineItem.runtime.needsSync = true
      } else {
        // ready 状态的项目不需要同步
        timelineItem.runtime.needsSync = false
      }
    }
    
    // 收集所有相关的媒体项目ID（自动去重）
    const mediaIds = this.affectedTimelineItems.map(item => item.mediaItemId)
    this.mediaItemIds = new Set(mediaIds)
  }
  
  async execute(): Promise<void> {
    // 执行删除轨道逻辑
    await this.trackModule.removeTrack(this.trackId)
    console.log(`✅ 已删除轨道及其 ${this.affectedTimelineItems.length} 个时间轴项目`)
  }
  
  async undo(): Promise<void> {
    // 重建轨道和时间轴项目
    this.trackModule.addTrack(this.trackData, this.trackIndex)
    
    for (const itemData of this.affectedTimelineItems) {
      // 🌟 重建时重新设置同步标记
      if (itemData.timelineStatus === 'loading') {
        itemData.runtime.needsSync = true
      }
      await this.timelineModule.addTimelineItem(itemData)
    }
    console.log(`↩️ 已撤销删除轨道，恢复了 ${this.affectedTimelineItems.length} 个时间轴项目`)
  }
  
  // 简化的 updateMediaData 方法
  updateMediaData(mediaItemId: string, mediaData: UnifiedMediaItemData): void {
    if (this.mediaItemIds.has(mediaItemId)) {
      let syncedCount = 0
      let skippedCount = 0
      
      // 更新所有相关的时间轴项目
      for (const timelineItem of this.affectedTimelineItems) {
        if (timelineItem.mediaItemId === mediaItemId) {
          // 🌟 使用精确的同步判断
          if (shouldSyncTimelineItem(timelineItem)) {
            updateTimelineItemFromMedia(timelineItem, mediaData)
            syncedCount++
          } else {
            skippedCount++
          }
        }
      }
      
      console.log(`🔄 [RemoveTrackCommand] 媒体数据更新完成: ${mediaItemId} (同步: ${syncedCount}, 跳过: ${skippedCount})`)
    }
  }
}
```

## 迁移策略

### 阶段一：扩展基础架构（1天）

1. **修改 BaseDataSourceProcessor.ts**
   - 扩展 `AcquisitionTask` 接口，添加 `callbacks` 字段
   - 修改 `addTask` 方法，支持传入回调
   - 修改 `executeTaskWithLimit` 方法，在任务完成后执行回调

2. **创建同步函数文件**
   - `src/core/managers/media/sync/mediaSyncUtils.ts`
   - 包含 4 个核心同步函数

### 阶段二：修改 UnifiedMediaModule（1天）

1. **修改 startMediaProcessing 方法**
   - 支持传入 `MediaProcessingCallbacks`
   - 创建包含同步逻辑的增强回调
   - 将回调传递给 `processor.addTask`

2. **移除现有的 watch 监听逻辑**
   - 不再需要在 `startMediaProcessing` 中监听 `mediaStatus` 变化
   - 回调机制直接在任务完成后触发

### 阶段三：扩展数据结构（1天）

1. **扩展时间轴项目运行时数据结构**
   ```typescript
   export interface UnifiedTimelineItemRuntime<T extends MediaType = MediaType> {
     // ... 现有字段
     needsSync?: boolean // 新增字段，向后兼容
   }
   ```

2. **扩展命令接口**
   ```typescript
   export interface SimpleCommand {
     // ... 现有字段
     mediaItemIds?: Set<string> // 可选字段，向后兼容
   }
   ```

### 阶段四：迁移命令（2天）

1. **逐个迁移三个命令**
   - 添加 `mediaItemIds` 字段
   - 实现简化的 `updateMediaData` 方法
   - 设置时间轴项目的 `needsSync` 标记

### 阶段五：清理旧代码（1天）

1. **删除旧的同步类**
   - 删除 `CommandMediaSync.ts`
   - 删除 `ProjectLoadMediaSync.ts`
   - 删除 `MediaSyncFactory.ts`
   - 删除 `MediaSyncManager.ts`

## 核心优势

### 1. 完美集成现有架构
- 基于现有的 `BaseDataSourceProcessor` 和任务队列机制
- 无需重写现有的媒体处理逻辑
- 回调在任务真正完成后触发，时机准确

### 2. 极简设计
- 只需扩展 `AcquisitionTask` 添加 `callbacks` 字段
- 4个简单函数替代复杂的类层次结构
- 数据结构极简：`needsSync` 布尔值 + `mediaItemIds` Set

### 3. 精确的同步控制
- 基于时间轴项目的实际状态进行判断
- `ready` 状态的项目不会被错误同步
- `loading` 状态的项目根据 `needsSync` 标记精确控制

### 4. 零配置自动化
- 媒体处理完成自动触发同步
- 智能过滤更新策略
- 完美支持多媒体场景

### 5. 高性能
- 回调直接在任务完成后执行，无额外的状态监听开销
- `Set.has()` 是 O(1) 操作
- 避免对已经就绪的项目进行不必要的同步
- 无复杂对象创建和管理

## 总结

这个最终版方案完美地集成到现有的 `BaseDataSourceProcessor` 架构中，并解决了原方案中同步判断不准确的问题：

1. **正确的回调时机**：回调在 `await this.executeTask(task)` 之后执行，确保媒体真正处理完成
2. **简洁的数据流**：`startMediaProcessing` → `processor.addTask(callbacks)` → `executeTask` → `onSuccess` → `handleMediaProcessingSuccess`
3. **极简的实现**：只需要扩展现有接口，添加4个函数，使用一个简单的 `needsSync` 布尔字段
4. **精确的同步控制**：基于时间轴项目状态和 `needsSync` 标记进行精确判断
5. **完美的兼容性**：向后兼容现有代码，渐进式迁移

这个方案用最少的代码实现了最大的功能，完全满足你的需求。