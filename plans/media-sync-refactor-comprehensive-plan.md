# MediaSync 架构重构综合方案

## 目录
1. [问题分析](#问题分析)
2. [重构方案](#重构方案)
3. [性能优化](#性能优化)
4. [TimelineItemFactory.rebuildForCmd 修正](#timelineitemfactoryrebuildforcmd-修正)
5. [isInitialized 标记方案](#isinitialize-标记方案)
6. [实施计划](#实施计划)
7. [代码示例](#代码示例)

---

## 问题分析

### 1. 当前架构的问题

#### 代码重复
`CommandMediaSync` 和 `ProjectLoadMediaSync` 有大量重复逻辑，维护两个类增加了代码复杂度。

#### 场景区分不合理
按"命令场景"和"项目加载场景"区分，但实际需求是：
- 是否需要更新命令数据
- 是否需要更新时间轴项目数据

#### 性能问题
在 `RemoveTrackCommand` 等批量操作场景中，如果轨道上有 100 个 loading 状态的时间轴项目：
- 会创建 100 个 MediaSync 实例
- 如果这些项目引用同一个媒体，会对同一个 `mediaItem.mediaStatus` 创建 **100 个 watcher**
- 造成严重的内存和 CPU 开销

### 2. 核心差异分析

通过深入分析代码，发现真正的差异是两个独立的控制维度：

| 差异点 | CommandMediaSync | ProjectLoadMediaSync |
|--------|------------------|---------------------|
| **是否更新命令数据** | ✅ 需要调用 `command.updateMediaData()` | ❌ 不需要 |
| **是否更新时间轴项目数据** | ✅ 需要更新尺寸、时长等属性 | ❌ 不需要（保留工程文件中的值） |
| **时间轴项目状态转换** | ✅ 需要（loading → ready） | ✅ 需要（loading → ready） |
| **syncId 生成** | 使用 commandId | 使用 timelineItemId |
| **清理方式** | 按 commandId 清理 | 按 timelineItemId 清理 |

#### 关键发现：两个独立的控制维度

在 [`TimelineItemTransitioner.transitionMediaTimelineItem()`](LightCut-frontend/src/core/managers/media/sync/TimelineItemTransitioner.ts:109-124) 中：

```typescript
// 如果是工程加载的，时间轴项目已经同步了素材属性或者用户修改了的，因此不需要更新
// 如果是命令加入的，由于时间轴项目还是初始化状态，因此需要使用素材属性来更新项目属性
if (options.scenario === 'command') {
  this.updateTimelineItem(timelineItem)  // 只有命令场景才更新
}
```

这里的 `scenario` 实际上控制的是"**是否更新时间轴项目数据**"：
- **需要更新**：时间轴项目是新创建的，需要从媒体项目同步尺寸、时长等属性
- **不需要更新**：时间轴项目来自保存的工程文件，已经有正确的属性，不应该被覆盖

而"**是否更新命令数据**"是另一个独立的维度，与时间轴项目数据更新无关。

---

## 重构方案

### 1. 统一的 MediaSync 类

```typescript
/**
 * 统一的媒体同步类
 * 通过配置选项控制行为，支持一个媒体项目关联多个时间轴项目（性能优化）
 */
export class MediaSync implements IMediaSync {
  private syncId: string
  private unwatch?: () => void
  private isSetup = false

  constructor(
    private mediaItemId: string,
    private options: MediaSyncOptions
  ) {
    this.syncId = options.syncId
  }

  /**
   * 设置媒体同步
   */
  async setup(): Promise<void> {
    if (this.isSetup) {
      console.warn(`[MediaSync] 媒体同步已设置: ${this.syncId}`)
      return
    }

    try {
      console.log(`[MediaSync] 开始设置媒体同步: ${this.syncId}`)

      // 1. 获取媒体项目
      const store = useUnifiedStore()
      const mediaItem = store.getMediaItem(this.mediaItemId)
      if (!mediaItem) {
        throw new Error(`找不到媒体项目: ${this.mediaItemId}`)
      }

      // 2. 检查是否需要同步
      if (UnifiedMediaItemQueries.isReady(mediaItem)) {
        console.log(`[MediaSync] 媒体已就绪，直接处理: ${this.syncId}`)
        await this.handleReadyMedia(mediaItem)
        return
      }

      // 3. 设置状态监听
      this.unwatch = this.setupWatcher(mediaItem)

      this.isSetup = true
      console.log(`✅ [MediaSync] 媒体同步设置成功: ${this.syncId}`)
    } catch (error) {
      console.error(`❌ [MediaSync] 媒体同步设置失败: ${this.syncId}`, error)
      throw error
    }
  }

  /**
   * 清理媒体同步
   */
  cleanup(): void {
    if (this.unwatch) {
      this.unwatch()
      this.unwatch = undefined
    }
    this.isSetup = false
    console.log(`🧹 [MediaSync] 媒体同步已清理: ${this.syncId}`)
  }

  // ... 其他方法见下文
}
```

### 2. 配置选项接口

```typescript
/**
 * 媒体同步配置选项
 */
export interface MediaSyncOptions {
  /**
   * 同步标识符（用于管理器注册和清理）
   * - 命令场景：使用 commandId
   * - 项目加载场景：使用 timelineItemId
   */
  syncId: string
  
  /**
   * 时间轴项目ID列表
   * 保存在配置中，因为在某些场景（如删除命令）中，
   * 时间轴项目可能已经被删除，无法从 store 中获取
   */
  timelineItemIds: string[]
  
  /**
   * 是否需要更新命令数据
   * - true: 媒体就绪时调用 command.updateMediaData()
   * - false: 不更新命令
   */
  shouldUpdateCommand: boolean
  
  /**
   * 是否需要更新时间轴项目数据
   * - true: 从媒体项目同步尺寸、时长等属性（新创建的时间轴项目）
   * - false: 保留时间轴项目现有属性（从工程文件加载的项目）
   *
   * 注意：即使设置为 true，如果时间轴项目已被删除（如在删除命令中），
   * 也无法更新，但不会报错
   */
  shouldUpdateTimelineItem: boolean
  
  /**
   * 命令ID（当 shouldUpdateCommand 为 true 时必需）
   */
  commandId?: string
  
  /**
   * 场景描述（用于日志和调试）
   */
  description?: string
}
```

### 3. 使用场景对照表

| 场景 | shouldUpdateCommand | shouldUpdateTimelineItem | 说明 |
|------|---------------------|-------------------------|------|
| **命令添加新项目** | ✅ true | ✅ true | 新创建的项目，需要同步所有数据 |
| **项目加载** | ❌ false | ❌ false | 从工程文件加载，保留原有数据 |
| **删除轨道/项目** | ✅ true | ❌ false | 项目已删除，只需更新命令数据（撤销用） |
| **未来扩展：仅更新命令** | ✅ true | ❌ false | 只更新命令元数据，不改变时间轴项目 |
| **未来扩展：仅更新项目** | ❌ false | ✅ true | 只更新时间轴项目，无命令关联 |

### 4. 命令重复执行的处理

在命令的execute和undo方法中，如果命令被多次执行（如：execute → undo → execute → undo），需要确保不会创建重复的MediaSync实例。

**问题场景：**
```typescript
// 第1次 execute
execute() → 创建 MediaSync(syncId: commandId)

// 第1次 undo
undo() → 创建 MediaSync(syncId: commandId)  // ⚠️ 可能与第1次的冲突!

// 第2次 execute
execute() → 创建 MediaSync(syncId: commandId)  // ⚠️ 又可能冲突!
```

**解决方案：命令持有MediaSync引用并在创建新实例前清理旧实例**

```typescript
export class SomeCommand implements SimpleCommand {
  private mediaSync?: MediaSync  // 持有MediaSync引用
  
  async execute(): Promise<void> {
    // ... 其他逻辑 ...
    
    if (TimelineItemQueries.isLoading(newTimelineItem)) {
      // 先清理旧的MediaSync实例（如果存在）
      if (this.mediaSync) {
        this.mediaSync.cleanup()
        this.mediaSync = undefined
      }
      
      // 创建新的MediaSync实例
      this.mediaSync = new MediaSync(newTimelineItem.mediaItemId, {
        syncId: this.id,
        timelineItemIds: [newTimelineItem.id],
        shouldUpdateCommand: true,
        shouldUpdateTimelineItem: true,
        commandId: this.id,
      })
      await this.mediaSync.setup()
    }
  }
  
  dispose(): void {
    // 命令被清理时，清理MediaSync
    if (this.mediaSync) {
      this.mediaSync.cleanup()
      this.mediaSync = undefined
    }
  }
}
```

**关键点：**
1. 命令类添加`private mediaSync?: MediaSync`字段持有引用
2. 创建新MediaSync前，先清理旧实例：`this.mediaSync?.cleanup()`
3. 命令的`dispose()`方法中清理MediaSync
4. MediaSync自己也会在媒体就绪后自动清理（通过`autoCleanup()`）

**注意：** MediaSync不再需要MediaSyncManager，完全由命令自己管理生命周期。

---

### 5. 删除场景的特殊处理

在删除轨道或时间轴项目的命令中（如 `RemoveTrackCommand`），存在一个特殊情况：

**问题**：时间轴项目已经被删除，但媒体可能还在加载中
- 删除操作会立即从 store 中移除时间轴项目
- 但媒体加载是异步的，可能在删除后才完成
- 命令需要保存媒体数据用于撤销操作

**解决方案**：
1. 在 `MediaSyncOptions` 中保存 `timelineItemIds` 列表
2. 更新命令数据时，使用保存的 ID 列表，而不是从 store 查询
3. 转换时间轴项目状态时，先检查项目是否还存在
   - 如果存在：正常转换状态
   - 如果不存在：跳过转换，不报错

```typescript
// 在 MediaSync.transitionTimelineItem() 中
private async transitionTimelineItem(
  mediaItem: UnifiedMediaItemData,
  timelineItemId: string
): Promise<void> {
  // 检查时间轴项目是否还存在（可能已被删除）
  const store = useUnifiedStore()
  const timelineItem = store.getTimelineItem(timelineItemId)
  
  if (!timelineItem) {
    console.log(`⏭️ [MediaSync] 时间轴项目不存在，跳过转换: ${timelineItemId}`)
    return  // 优雅地跳过，不报错
  }

  // 项目存在，正常转换
  const transitioner = new TimelineItemTransitioner(timelineItemId, mediaItem)
  await transitioner.transitionToReady({
    shouldUpdateTimelineItem: this.options.shouldUpdateTimelineItem,
    commandId: this.options.commandId,
  })
}
```

**为什么这样设计**：
- **命令数据更新**：即使项目被删除，命令仍需要媒体数据用于撤销
- **不更新时间轴项目**：项目已被删除，无需也无法更新其数据
- **状态转换跳过**：项目不存在时无需转换状态，这是删除场景的正常情况
- **ID 列表保存**：确保在任何情况下都能访问到原始的项目 ID

### 5. 核心逻辑实现

```typescript
export class MediaSync implements IMediaSync {
  // ... 构造函数和 setup/cleanup 方法见上文

  /**
   * 处理媒体就绪
   */
  private async handleReadyMedia(mediaItem: UnifiedMediaItemData): Promise<void> {
    console.log(`⏭️ [MediaSync] 媒体已就绪: ${mediaItem.name}`)

    // 1. 根据配置决定是否更新命令数据
    if (this.options.shouldUpdateCommand && this.options.commandId) {
      const store = useUnifiedStore()
      const command = store.getCommand(this.options.commandId)
      if (command && !command.isDisposed) {
        // 为每个时间轴项目调用 updateMediaData
        for (const timelineItemId of this.options.timelineItemIds) {
          command.updateMediaData?.(mediaItem, timelineItemId)
        }
        console.log(`🔄 [MediaSync] 已更新命令媒体数据: ${this.options.commandId}`)
      }
    }

    // 2. 转换所有相关的时间轴项目状态
    for (const timelineItemId of this.options.timelineItemIds) {
      await this.transitionTimelineItem(mediaItem, timelineItemId)
    }
  }

  /**
   * 转换时间轴项目状态
   */
  private async transitionTimelineItem(
    mediaItem: UnifiedMediaItemData,
    timelineItemId: string
  ): Promise<void> {
    // 检查时间轴项目是否还存在（可能已被删除）
    const store = useUnifiedStore()
    const timelineItem = store.getTimelineItem(timelineItemId)
    
    if (!timelineItem) {
      console.log(`⏭️ [MediaSync] 时间轴项目不存在，跳过转换: ${timelineItemId}`)
      return
    }

    const transitioner = new TimelineItemTransitioner(timelineItemId, mediaItem)

    // 传递标记位给 transitioner，控制是否更新时间轴项目数据
    await transitioner.transitionToReady({
      shouldUpdateTimelineItem: this.options.shouldUpdateTimelineItem,
      commandId: this.options.commandId,
    })
  }

  /**
   * 设置状态监听器
   */
  private setupWatcher(mediaItem: UnifiedMediaItemData): () => void {
    return watch(
      () => mediaItem.mediaStatus,
      async (newStatus, oldStatus) => {
        console.log(`🔄 [MediaSync] 媒体状态变化: ${oldStatus} → ${newStatus}`, {
          syncId: this.syncId,
          mediaItemId: this.mediaItemId,
          mediaName: mediaItem.name,
        })

        if (newStatus === 'ready') {
          await this.handleReadyMedia(mediaItem)
          // 媒体就绪后自动清理watcher
          this.cleanup()
        } else if (this.isErrorStatus(newStatus)) {
          await this.handleMediaError(mediaItem, newStatus)
          // 错误后也清理watcher
          this.cleanup()
        }
      },
      { immediate: true }
    )
  }

  /**
   * 处理媒体错误
   */
  private async handleMediaError(mediaItem: UnifiedMediaItemData, status: string): Promise<void> {
    const store = useUnifiedStore()
    for (const timelineItemId of this.options.timelineItemIds) {
      const timelineItem = store.getTimelineItem(timelineItemId)
      if (timelineItem) {
        timelineItem.timelineStatus = 'error'
        console.log(`❌ [MediaSync] 时间轴项目状态已设置为错误: ${timelineItemId}`)
      }
    }
  }

  /**
   * 判断是否为错误状态
   */
  private isErrorStatus(status: string): boolean {
    return ['error', 'cancelled', 'missing'].includes(status)
  }
}
```

---

## 性能优化

### 问题：重复 Watcher

在批量操作场景（如 `RemoveTrackCommand`）中，如果轨道上有 100 个 loading 状态的时间轴项目，且它们引用同一个媒体：
- **优化前**：创建 100 个 MediaSync 实例，对同一个 `mediaItem.mediaStatus` 创建 100 个 watcher
- **优化后**：创建 1 个 MediaSync 实例，只有 1 个 watcher

### 解决方案：按媒体项目去重

#### 实现方式

```typescript
// RemoveTrackCommand.execute()

// 1. 按 mediaItemId 分组 loading 状态的时间轴项目
const loadingItemsByMedia = new Map<string, string[]>()

for (const item of this.affectedTimelineItems) {
  if (TimelineItemQueries.isLoading(item)) {
    const timelineIds = loadingItemsByMedia.get(item.mediaItemId) || []
    timelineIds.push(item.id)
    loadingItemsByMedia.set(item.mediaItemId, timelineIds)
  }
}

// 2. 为每个唯一的媒体项目创建一个 MediaSync
for (const [mediaItemId, timelineItemIds] of loadingItemsByMedia) {
  const mediaItem = this.mediaModule.getMediaItem(mediaItemId)
  if (mediaItem) {
    const mediaSync = new MediaSync(mediaItemId, {
      syncId: this.id,
      timelineItemIds: timelineItemIds,
      shouldUpdateCommand: true,
      shouldUpdateTimelineItem: true,
      commandId: this.id,
      description: `Command: ${this.id}`,
    })
    await mediaSync.setup()
  }
}

// 3. 删除轨道
await this.trackModule.removeTrack(this.trackId)
```

### 性能提升

| 场景 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 100 个项目，1 个媒体 | 100 个 watcher | 1 个 watcher | **99% 减少** |
| 100 个项目，10 个媒体 | 100 个 watcher | 10 个 watcher | **90% 减少** |
| 100 个项目，100 个媒体 | 100 个 watcher | 100 个 watcher | 无变化（罕见） |

---

## TimelineItemFactory.rebuildForCmd 修正

### 问题描述

当前 [`TimelineItemFactory.rebuildForCmd()`](LightCut-frontend/src/core/timelineitem/factory.ts:219-272) 的实现存在一个逻辑问题：**只根据 mediaItem 状态决定返回的 TimelineItem 状态**，没有考虑 `originalTimelineItemData.runtime.isInitialized` 的值。

这导致以下问题：

1. **场景1：originalData未初始化 + media已ready**
   - 当前行为：直接返回 ready 状态
   - 问题：虽然媒体已就绪，但原始数据标记为未初始化，说明需要从 mediaItem 同步数据
   - 正确行为：应该返回 loading 状态，等待 MediaSync 同步数据

2. **场景2：originalData已初始化 + media未ready**
   - 当前行为：返回 loading 状态
   - 问题：虽然原始数据已初始化，但媒体未就绪，无法完成渲染
   - 正确行为：应该返回 loading 状态，等待媒体就绪后再转换

### 修正方案

`rebuildForCmd` 应该**同时考虑两个维度**来决定返回状态：
1. **originalTimelineItemData.runtime.isInitialized**：原始数据是否已初始化
2. **mediaItem.mediaStatus**：媒体是否已就绪

#### 决策矩阵

| originalData.isInitialized | mediaItem状态 | 返回状态 | isInitialized | 说明 |
|---------------------------|--------------|---------|---------------|------|
| `false` | ready | **loading** | **false** | 需要同步数据，即使媒体已就绪 |
| `false` | loading | loading | false | 需要等待并同步 |
| `true` | ready | ready | true | 已初始化且媒体就绪，直接完成 |
| `true` | loading | **loading** | **true** | 已初始化，只需等待媒体就绪，不需要重新同步数据 |

#### 核心原则

**只有当两个条件同时满足时，才能返回 ready 状态：**
1. `originalTimelineItemData.runtime.isInitialized === true`（原始数据已初始化）
2. `mediaItem.mediaStatus === 'ready'`（媒体已就绪）

**其他情况返回 loading 状态，isInitialized 的设置规则：**
- `originalData.isInitialized = false` → `newItem.isInitialized = false`（需要同步数据）
- `originalData.isInitialized = true` → `newItem.isInitialized = true`（保持已初始化状态，只等待媒体就绪）

#### 决策逻辑

```typescript
/**
 * 为命令场景重建时间轴项目（智能决定初始状态）
 *
 * 状态决策逻辑：
 * 1. 文本项目 → 直接返回 ready 状态（不依赖外部媒体）
 * 2. originalData.isInitialized === true && mediaItem.ready → 返回 ready 状态
 * 3. 其他所有情况 → 返回 loading 状态（需要 MediaSync）
 */
```

#### 修正后的实现

```typescript
/**
 * 为命令场景重建时间轴项目（智能决定初始状态）
 * 用于命令执行和项目加载场景，根据原始数据初始化状态和媒体状态智能决定 TimelineItem 的初始状态
 *
 * @param options 重建选项
 * @returns 重建结果，TimelineItem 状态根据两个维度智能决定
 */
export async function rebuildTimelineItemForCmd(
  options: RebuildKnownTimelineItemOptions,
): Promise<RebuildKnownTimelineItemResult> {
  const { originalTimelineItemData, getMediaItem, logIdentifier } = options

  try {
    if (!originalTimelineItemData) {
      throw new Error('时间轴项目数据不存在')
    }

    console.log(`🔄 [${logIdentifier}] 开始重建时间轴项目（智能状态决策）...`)

    // 1. 文本项目特殊处理：直接返回 ready 状态
    if (TimelineItemQueries.isTextTimelineItem(originalTimelineItemData)) {
      console.log(`✅ [${logIdentifier}] 文本项目直接创建为 ready 状态`)
      
      const newTimelineItem = cloneTimelineItem(originalTimelineItemData, {
        timelineStatus: 'ready',
      })
      
      // 🔧 关键：为文本项目设置 textBitmap
      // 文本类型不需要 mediaItem 参数
      await setupTimelineItemBunny(newTimelineItem)
      
      // ✅ 文本项目已完成初始化
      newTimelineItem.runtime.isInitialized = true
      
      return {
        timelineItem: newTimelineItem,
        success: true,
      }
    }

    // 2. 非文本项目：检查媒体状态
    const mediaItem = getMediaItem(originalTimelineItemData.mediaItemId)
    
    if (!mediaItem) {
      throw new Error(`找不到媒体项目: ${originalTimelineItemData.mediaItemId}`)
    }

    // 3. 🔧 关键修正：同时考虑原始数据的初始化状态和媒体状态
    const isOriginalInitialized = originalTimelineItemData.runtime.isInitialized
    const isMediaReady = UnifiedMediaItemQueries.isReady(mediaItem)
    
    // 只有当原始数据已初始化 AND 媒体已就绪时，才返回 ready 状态
    if (isOriginalInitialized && isMediaReady) {
      // ✅ 场景：originalData已初始化 + media已ready → 直接返回 ready
      console.log(`✅ [${logIdentifier}] 原始数据已初始化且媒体已就绪，直接创建 ready 状态`)
      
      const newTimelineItem = cloneTimelineItem(originalTimelineItemData, {
        timelineStatus: 'ready',
      }) as UnifiedTimelineItemData<MediaType>
      
      // 🔧 关键：为 ready 状态的 TimelineItem 设置 bunny 对象
      // 这一步不能省略，否则 TimelineItem 无法渲染
      await setupTimelineItemBunny(newTimelineItem, mediaItem)
      
      // ✅ 媒体已就绪，TimelineItem 已完成初始化
      newTimelineItem.runtime.isInitialized = true
      
      return {
        timelineItem: newTimelineItem,
        success: true,
      }
    } else {
      // ⚠️ 其他所有情况：返回 loading 状态，等待 MediaSync 处理
      // - originalData未初始化 + media已ready → loading（需要同步数据）
      // - originalData未初始化 + media未ready → loading（需要等待并同步）
      // - originalData已初始化 + media未ready → loading（只需等待媒体就绪，不需要同步）
      
      let reason = ''
      if (!isOriginalInitialized && isMediaReady) {
        reason = '原始数据未初始化，需要从媒体同步数据'
      } else if (!isOriginalInitialized && !isMediaReady) {
        reason = '原始数据未初始化且媒体未就绪，需要等待并同步'
      } else if (isOriginalInitialized && !isMediaReady) {
        reason = '原始数据已初始化但媒体未就绪，只需等待媒体加载（不需要同步数据）'
      }
      
      console.log(`🔄 [${logIdentifier}] 创建 loading 状态: ${reason}`, {
        isOriginalInitialized,
        mediaStatus: mediaItem.mediaStatus,
      })
      
      const newTimelineItem = cloneTimelineItem(originalTimelineItemData, {
        timelineStatus: 'loading',
      }) as UnifiedTimelineItemData<MediaType>
      
      // ⚠️ 关键：保持原始数据的 isInitialized 状态
      // - 如果原始数据未初始化 → isInitialized = false（需要同步）
      // - 如果原始数据已初始化 → isInitialized = true（只需等待，不需要同步）
      newTimelineItem.runtime.isInitialized = isOriginalInitialized
      
      console.log(`🔄 [${logIdentifier}] loading 状态时间轴项目创建完成:`, {
        id: newTimelineItem.id,
        mediaType: originalTimelineItemData.mediaType,
        timelineStatus: newTimelineItem.timelineStatus,
        isInitialized: newTimelineItem.runtime.isInitialized,
        mediaStatus: mediaItem.mediaStatus,
      })
      
      return {
        timelineItem: newTimelineItem,
        success: true,
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

### 与 MediaSync 重构方案的配合

修正后的逻辑与 MediaSync 重构方案完美配合：

#### 场景 1：媒体已 ready

```typescript
// rebuildForCmd 返回 ready 状态
const rebuildResult = await TimelineItemFactory.rebuildForCmd({...})
const newTimelineItem = rebuildResult.timelineItem  // timelineStatus: 'ready'

await this.timelineModule.addTimelineItem(newTimelineItem)

// 检测到 ready 状态，不创建 MediaSync
if (TimelineItemQueries.isLoading(newTimelineItem)) {
  // 不会执行
}
// ✅ 直接完成，无异步等待
```

#### 场景 2：媒体未 ready

```typescript
// rebuildForCmd 返回 loading 状态
const rebuildResult = await TimelineItemFactory.rebuildForCmd({...})
const newTimelineItem = rebuildResult.timelineItem  // timelineStatus: 'loading'

await this.timelineModule.addTimelineItem(newTimelineItem)

// 检测到 loading 状态，创建 MediaSync
if (TimelineItemQueries.isLoading(newTimelineItem)) {
  this.mediaSync = new MediaSync(newTimelineItem.mediaItemId, {
    syncId: this.id,
    timelineItemIds: [newTimelineItem.id],
    shouldUpdateCommand: true,
    shouldUpdateTimelineItem: true,
    commandId: this.id,
  })
  await this.mediaSync.setup()
}
// ⏳ MediaSync 监听媒体状态变化并转换
```

#### 场景 3：文本项目

```typescript
// rebuildForCmd 返回 ready 状态
const rebuildResult = await TimelineItemFactory.rebuildForCmd({...})
const newTimelineItem = rebuildResult.timelineItem  // timelineStatus: 'ready'

await this.timelineModule.addTimelineItem(newTimelineItem)

// 检测到 ready 状态，不创建 MediaSync
if (TimelineItemQueries.isLoading(newTimelineItem)) {
  // 不会执行
}
// ✅ 文本项目直接完成
```

### 性能优势对比

| 场景 | 修正前 | 修正后 | 优势 |
|------|--------|--------|------|
| **媒体已 ready** | 创建 loading → MediaSync → 转换为 ready | 直接创建 ready | ✅ **消除不必要的异步操作** |
| **文本项目** | 创建 loading → 转换为 ready | 直接创建 ready | ✅ **消除不必要的状态转换** |
| **媒体未 ready** | 创建 loading → MediaSync → 等待 → ready | 创建 loading → MediaSync → 等待 → ready | 无变化（正常流程） |

### 命令代码的统一模式

所有命令的 `execute()` 和 `undo()` 方法都遵循相同的模式：

```typescript
async execute(): Promise<void> {
  // 1. 重建时间轴项目（智能状态决策）
  // rebuildForCmd 会根据 originalData.isInitialized 和 mediaItem.status 智能决定返回状态和 isInitialized
  const rebuildResult = await TimelineItemFactory.rebuildForCmd({
    originalTimelineItemData: this.originalTimelineItemData,
    getMediaItem: this.mediaModule.getMediaItem,
    logIdentifier: 'CommandName execute',
  })

  if (!rebuildResult.success) {
    throw new Error(`重建时间轴项目失败: ${rebuildResult.error}`)
  }

  const newTimelineItem = rebuildResult.timelineItem

  // 2. ⚠️ 注意：rebuildForCmd 已经智能设置了 isInitialized
  // - ready 状态：isInitialized = true（已完成初始化）
  // - loading 状态：isInitialized = 保持原值（originalData.isInitialized）
  //   - 如果原始数据未初始化 → false（需要同步数据）
  //   - 如果原始数据已初始化 → true（只需等待媒体，不需要同步）
  // 调用方通常不需要再修改 isInitialized

  // 3. 添加到时间轴
  await this.timelineModule.addTimelineItem(newTimelineItem)

  // 4. 只有 loading 状态才需要 MediaSync
  if (TimelineItemQueries.isLoading(newTimelineItem)) {
    // 先清理旧的 MediaSync（防止重复执行）
    if (this.mediaSync) {
      this.mediaSync.cleanup()
      this.mediaSync = undefined
    }
    
    this.mediaSync = new MediaSync(newTimelineItem.mediaItemId, {
      syncId: this.id,
      timelineItemIds: [newTimelineItem.id],
      shouldUpdateCommand: true,
      shouldUpdateTimelineItem: !newTimelineItem.runtime.isInitialized, // 根据 isInitialized 决定是否同步数据
      commandId: this.id,
    })
    await this.mediaSync.setup()
  }
  // 如果是 ready 状态，直接完成，无需 MediaSync
}
```

### 关键优势

1. **性能提升**：
   - 媒体已 ready 时，避免创建 MediaSync 和状态转换
   - 文本项目直接完成，无异步等待
   - 减少不必要的 watcher 和内存开销

2. **逻辑清晰**：
   - 状态决策集中在 `rebuildForCmd` 中
   - 命令代码统一简洁
   - 易于理解和维护

3. **正确性保证**：
   - 只在真正需要时创建 MediaSync
   - 避免对已 ready 的媒体进行不必要的同步
   - 文本项目不会进入异步等待流程

---

## isInitialized 标记方案

### 问题背景

在实施 MediaSync 重构方案时，发现了一个关键问题：**如何判断时间轴项目是否需要从 mediaItem 同步数据？**

#### 问题场景

假设以下操作序列：
1. **加载项目** → 所有时间轴项目都是 `loading` 状态
2. **删除一个项目** → 项目被删除
3. **Undo 删除** → 项目被重新添加（仍然是 `loading` 状态）
4. **MediaSync 被创建** → 开始 watch `mediaItem.mediaStatus`
5. **MediaItem ready** → MediaSync 触发 `shouldUpdateTimelineItem: true`
6. **❌ 问题发生** → 时间轴项目数据被覆盖（本不应该被覆盖）

#### 问题根源

当前的判断逻辑混淆了两个概念：
1. **时间轴项目是否处于 loading 状态**（`timelineStatus === 'loading'`）
2. **时间轴项目是否已经初始化过**（是否已经从 mediaItem 同步过数据）

在上述场景中：
- 项目加载时，时间轴项目是 `loading` 状态，但**已经初始化过**（从工程文件加载的数据）
- Undo 后重新创建的项目也是 `loading` 状态，但**也已经初始化过**（从命令保存的数据恢复）
- 但 MediaSync 会认为"只要是 loading 状态就需要更新"，导致覆盖

### 解决方案：添加 `runtime.isInitialized` 字段

在 `UnifiedTimelineItemRuntime` 中添加 `isInitialized` 字段来明确标识时间轴项目是否已经初始化过。

#### 类型定义

```typescript
// LightCut-frontend/src/core/timelineitem/type.ts

export interface UnifiedTimelineItemRuntime<T extends MediaType = MediaType> {
  bunnyClip?: Raw<BunnyClip>
  textBitmap?: ImageBitmap
  renderConfig?: GetConfigs<T>
  
  /**
   * 标识时间轴项目是否已经从 mediaItem 初始化过（必选字段）
   * - true: 已经初始化，不应该再从 mediaItem 同步数据
   * - false: 未初始化，需要等待 mediaItem ready 后同步数据
   *
   * 设置时机：
   * 1. rebuildForCmd 返回 ready 状态时：自动设置为 true（已完成初始化）
   * 2. rebuildForCmd 返回 loading 状态时：由调用方根据场景设置
   * 3. TimelineItemTransitioner 完成转换后：设置为 true（标记初始化完成）
   *
   * 使用场景：
   * 1. 项目加载：从工程文件加载的项目，isInitialized = true（已有用户调整的数据）
   * 2. 命令添加：新创建的项目，isInitialized = false（需要从 mediaItem 同步）
   * 3. Undo/Redo：从命令恢复的项目，保持原有的 isInitialized 值
   */
  isInitialized: boolean
}
```

### 各场景的 `isInitialized` 设置规则

#### 规则总结表

此表格考虑了两个关键维度：
1. **场景类型**：添加、删除、项目加载等
2. **MediaItem 状态**：ready 或 loading

| 场景 | MediaItem 状态 | rebuildForCmd 返回状态 | isInitialized 设置 | shouldUpdateTimelineItem | 是否创建 MediaSync | 说明 |
|------|---------------|----------------------|-------------------|-------------------------|------------------|------|
| **添加命令 execute** | ready | ready | `true` | N/A | ❌ 否 | 媒体已就绪，直接完成初始化 |
| **添加命令 execute** | loading | loading | `false` | `true` | ✅ 是 | 新创建的项目，需要从 mediaItem 同步 |
| **添加命令 undo** | - | N/A（删除） | N/A | N/A | ❌ 否 | 直接删除项目 |
| **删除命令 execute** | - | N/A（删除） | N/A | `false` | ✅ 是（仅更新命令） | 项目已删除，只更新命令数据 |
| **删除命令 undo** | ready | ready | `true` | N/A | ❌ 否 | 恢复时媒体已就绪，直接完成 |
| **删除命令 undo** | loading | loading | **保持原值** | `!原值` | ✅ 是 | 恢复原有状态，保持原初始化标记 |
| **删除轨道 execute** | - | N/A（删除） | N/A | `false` | ✅ 是（仅更新命令） | 项目已删除，只更新命令数据 |
| **删除轨道 undo** | ready | ready | `true` | N/A | ❌ 否 | 恢复时媒体已就绪，直接完成 |
| **删除轨道 undo** | loading | loading | **保持原值** | `!原值` | ✅ 是 | 恢复原有状态，保持原初始化标记 |
| **项目加载** | ready | ready | `true` | N/A | ❌ 否 | 从工程文件加载，媒体已就绪 |
| **项目加载** | loading | loading | `true` | `false` | ✅ 是 | 从工程文件加载，已有用户数据，不覆盖 |

#### 关键原则

1. **MediaItem ready 时**：
   - `rebuildForCmd` 直接返回 ready 状态的 TimelineItem
   - `isInitialized` 自动设置为 `true`（已完成初始化）
   - 不需要创建 MediaSync（无需等待）
   - `shouldUpdateTimelineItem` 不适用（已经在 rebuildForCmd 中完成）

2. **MediaItem loading 时**：
   - `rebuildForCmd` 返回 loading 状态的 TimelineItem
   - `isInitialized` 由调用方根据场景设置
   - 需要创建 MediaSync 等待媒体就绪
   - `shouldUpdateTimelineItem` 根据 `isInitialized` 决定

3. **场景规则**：
   - **添加命令**：新创建 → `isInitialized = false`（需要同步）
   - **项目加载**：从文件恢复 → `isInitialized = true`（已有用户数据）
   - **删除命令的 undo**：恢复原状态 → **保持原有的 `isInitialized` 值**
   - **删除轨道的 undo**：恢复原状态 → **保持原有的 `isInitialized` 值**

4. **设置时机**：
   - `rebuildForCmd` 返回 ready 状态：在函数内部设置 `isInitialized = true`
   - `rebuildForCmd` 返回 loading 状态：由调用方在添加到 timeline 前设置
   - `TimelineItemTransitioner` 完成转换：设置 `isInitialized = true`

### 实现细节

#### 1. 在 `rebuildForCmd` 中的 `isInitialized` 设置规则

`rebuildForCmd` 的 `isInitialized` 设置遵循以下规则：

- **返回 ready 状态时**：在函数内部设置 `isInitialized = true`（已完成初始化）
- **返回 loading 状态时**：不设置，由调用方根据场景设置

```typescript
// TimelineItemFactory.rebuildForCmd() 的 isInitialized 设置规则：
// 1. ready 状态：函数内部设置 isInitialized = true
// 2. loading 状态：由调用方根据场景设置
```

#### 2. 在命令中根据场景设置 `isInitialized`

**AddTimelineItemCommand.execute()** - 新创建的项目
```typescript
const newTimelineItem = rebuildResult.timelineItem

// ✅ 添加命令：新创建的项目，未初始化
newTimelineItem.runtime.isInitialized = false

await this.timelineModule.addTimelineItem(newTimelineItem)

if (TimelineItemQueries.isLoading(newTimelineItem)) {
  this.mediaSync = new MediaSync(newTimelineItem.mediaItemId, {
    syncId: this.id,
    timelineItemIds: [newTimelineItem.id],
    shouldUpdateCommand: true,
    shouldUpdateTimelineItem: !newTimelineItem.runtime.isInitialized, // = true
    commandId: this.id,
  })
  await this.mediaSync.setup()
}
```

**RemoveTimelineItemCommand.undo()** - 恢复原有状态
```typescript
const newTimelineItem = rebuildResult.timelineItem

// ✅ 删除命令的 undo：恢复原有的 isInitialized 标记（保持原封不动）
newTimelineItem.runtime.isInitialized = this.originalTimelineItemData.runtime.isInitialized ?? true

await this.timelineModule.addTimelineItem(newTimelineItem)

if (TimelineItemQueries.isLoading(newTimelineItem)) {
  this.mediaSync = new MediaSync(newTimelineItem.mediaItemId, {
    syncId: this.id,
    timelineItemIds: [newTimelineItem.id],
    shouldUpdateCommand: true,
    shouldUpdateTimelineItem: !newTimelineItem.runtime.isInitialized, // 使用恢复的标记
    commandId: this.id,
  })
  await this.mediaSync.setup()
}
```

**RemoveTrackCommand.undo()** - 批量恢复原有状态
```typescript
for (const itemData of this.affectedTimelineItems) {
  const rebuildResult = await TimelineItemFactory.rebuildForCmd({...})
  const newTimelineItem = rebuildResult.timelineItem
  
  // ✅ 删除轨道命令的 undo：恢复原有的 isInitialized 标记（保持原封不动）
  newTimelineItem.runtime.isInitialized = itemData.runtime.isInitialized ?? true
  
  await this.timelineModule.addTimelineItem(newTimelineItem)
  newTimelineItems.push(newTimelineItem)
}

// 按媒体分组创建 MediaSync
for (const [mediaItemId, timelineItemIds] of loadingItemsByMedia) {
  // 获取第一个项目的 isInitialized 状态（同一批次的项目状态应该一致）
  const firstItem = newTimelineItems.find(item => item.id === timelineItemIds[0])
  
  const mediaSync = new MediaSync(mediaItemId, {
    syncId: this.id,
    timelineItemIds: timelineItemIds,
    shouldUpdateCommand: true,
    shouldUpdateTimelineItem: !firstItem?.runtime.isInitialized, // 使用恢复的标记
    commandId: this.id,
  })
  await mediaSync.setup()
  this.mediaSyncs.push(mediaSync)
}
```

**UnifiedProjectModule.restoreTimelineItems()** - 项目加载
```typescript
const newTimelineItem = rebuildResult.timelineItem

// ✅ 项目加载：从工程文件加载，已初始化
newTimelineItem.runtime.isInitialized = true

await timelineModule.addTimelineItem(newTimelineItem)

if (newTimelineItem.timelineStatus === 'loading') {
  const mediaSync = new MediaSync(newTimelineItem.mediaItemId, {
    syncId: newTimelineItem.id,
    timelineItemIds: [newTimelineItem.id],
    shouldUpdateCommand: false,
    shouldUpdateTimelineItem: !newTimelineItem.runtime.isInitialized, // = false
    description: `ProjectLoad: ${newTimelineItem.id}`,
  })
  await mediaSync.setup()
}
```

#### 3. 在 `TimelineItemTransitioner` 中标记初始化完成

```typescript
private async transitionMediaTimelineItem(
  timelineItem: UnifiedTimelineItemData<Exclude<MediaType, 'text'>>,
  options: TransitionOptions,
): Promise<void> {
  if (!this.mediaItem) {
    throw new Error('媒体类型的时间轴项目必须提供 mediaItem')
  }

  // 使用 shouldUpdateTimelineItem 而不是 scenario
  if (options.shouldUpdateTimelineItem) {
    this.updateTimelineItem(timelineItem)
  }

  await setupTimelineItemBunny(timelineItem, this.mediaItem)
  
  // ✅ 完成初始化后，标记为已初始化
  timelineItem.runtime.isInitialized = true
}
```

### 与 `shouldUpdateTimelineItem` 的关系

```typescript
// 在创建 MediaSync 时
shouldUpdateTimelineItem: !timelineItem.runtime.isInitialized
```

这个关系确保：
- 未初始化的项目（`isInitialized = false`）→ `shouldUpdateTimelineItem = true` → 会被更新
- 已初始化的项目（`isInitialized = true`）→ `shouldUpdateTimelineItem = false` → 不会被更新

### 所有创建 TimelineItem 的地方及 `isInitialized` 设置规则

#### 1. [`useTimelineItemOperations.createTimelineItemFromMediaItem()`](LightCut-frontend/src/core/composables/useTimelineItemOperations.ts:28)
**场景**：用户从素材库拖拽素材到时间轴

**当前代码**：
```typescript
const timelineItemData: UnifiedTimelineItemData = {
  // ... 其他字段
  timelineStatus: 'loading',
  runtime: {
    // ❌ 缺少 isInitialized 字段
  },
}
```

**需要修改为**：
```typescript
const timelineItemData: UnifiedTimelineItemData = {
  // ... 其他字段
  timelineStatus: 'loading',
  runtime: {
    isInitialized: false, // ✅ 新创建的项目，需要从 mediaItem 同步
  },
}
```

**说明**：这是用户直接拖拽素材创建的新项目，应该设置 `isInitialized = false`，让 MediaSync 从 mediaItem 同步数据。

---

#### 2. [`useBatchCommandBuilder.createAddTimelineItemCommand()`](LightCut-frontend/src/aipanel/composables/useBatchCommandBuilder.ts:90)
**场景**：AI 面板批量添加素材到时间轴

**当前代码**：
```typescript
const timelineItemData = {
  // ... 其他字段
  timelineStatus: timelineStatus, // 'ready' 或 'loading'
  runtime: {
    // ❌ 缺少 isInitialized 字段
  },
}
```

**需要修改为**：
```typescript
const timelineItemData = {
  // ... 其他字段
  timelineStatus: timelineStatus,
  runtime: {
    isInitialized: timelineStatus === 'ready' ? true : false,
    // ✅ ready 状态：已完成初始化
    // ✅ loading 状态：需要从 mediaItem 同步
  },
}
```

**说明**：
- 如果 mediaItem 已经 ready，直接创建 ready 状态，`isInitialized = true`
- 如果 mediaItem 还在 loading，创建 loading 状态，`isInitialized = false`

---

#### 3. [`TimelineItemFactory.cloneTimelineItem()`](LightCut-frontend/src/core/timelineitem/factory.ts:34)
**场景**：克隆现有的 TimelineItem（用于命令的 undo/redo）

**当前代码**：
```typescript
const cloned = cloneDeep({
  ...original,
  runtime: {}, // ❌ 清空了所有 runtime 字段（包括 bunnyClip、textBitmap、isInitialized 等）
})
```

**需要修改为**：
```typescript
const cloned = cloneDeep({
  ...original,
  runtime: {
    // ✅ 只保留 isInitialized，其他 runtime 字段（bunnyClip、textBitmap 等）会在后续重建
    isInitialized: original.runtime.isInitialized,
  },
})
```

**说明**：
- 克隆时需要保留原有的 `isInitialized` 状态，因为克隆的项目继承了原项目的初始化状态
- 其他 runtime 字段（如 bunnyClip、textBitmap）会在后续的 `setupTimelineItemBunny` 中重新创建

---

#### 4. [`TimelineItemFactory.duplicateTimelineItem()`](LightCut-frontend/src/core/timelineitem/factory.ts:87)
**场景**：复制 TimelineItem 到新轨道（用户复制粘贴）

**当前实现**：调用 `cloneTimelineItem()`，会继承上面的修改

**说明**：复制的项目应该保留原项目的 `isInitialized` 状态。

---

#### 5. [`TimelineItemFactory.rebuildForCmd()`](LightCut-frontend/src/core/timelineitem/factory.ts:219)
**场景**：命令执行时重建 TimelineItem

**当前代码**：
```typescript
const newTimelineItem = cloneTimelineItem(originalTimelineItemData, {
  timelineStatus: 'loading',
})
// ❌ loading 状态时没有设置 isInitialized
```

**需要修改为**：
```typescript
// ⚠️ 注意：rebuildForCmd 的 isInitialized 设置规则
// - ready 状态：函数内部设置 isInitialized = true
// - loading 状态：由调用方根据场景设置（见计划文档中的规则）
```

**说明**：
- `rebuildForCmd` 返回 ready 状态时，会在函数内部设置 `isInitialized = true`
- `rebuildForCmd` 返回 loading 状态时，由调用方根据场景设置

---

#### 6. [`createTextTimelineItem()`](LightCut-frontend/src/core/utils/textTimelineUtils.ts)
**场景**：创建文本类型的 TimelineItem

**需要检查并修改**：
```typescript
const textItem = {
  // ... 其他字段
  runtime: {
    isInitialized: true, // ✅ 文本项目不依赖外部媒体，直接完成初始化
  },
}
```

**说明**：文本项目不依赖外部媒体加载，创建时就已经完成初始化。

---

### 修改优先级和影响范围

| 位置 | 优先级 | 影响范围 | 修改难度 |
|------|--------|---------|---------|
| `createTimelineItemFromMediaItem` | 🔴 高 | 用户拖拽素材 | 简单 |
| `createAddTimelineItemCommand` (AI面板) | 🔴 高 | AI 批量操作 | 简单 |
| `cloneTimelineItem` | 🔴 高 | 所有命令的 undo/redo | 中等 |
| `duplicateTimelineItem` | 🟡 中 | 用户复制粘贴 | 简单（依赖 clone） |
| `rebuildForCmd` | 🟢 低 | 已在计划中明确 | 无需修改 |
| `createTextTimelineItem` | 🟡 中 | 创建文本项目 | 简单 |

---

### 方案优势

1. **解决核心问题**：完美解决 Undo 后数据被覆盖的问题
2. **语义清晰**：`isInitialized` 直接表达"是否已初始化"，无需推断
3. **职责分离**：将"状态"和"是否初始化"两个维度分开
4. **易于维护**：代码逻辑更清晰，减少理解成本
5. **扩展性好**：为未来的运行时状态管理提供基础
6. **类型安全**：必选字段避免了 `undefined` 的歧义
7. **智能优化**：考虑 mediaItem ready 状态，避免不必要的 MediaSync 创建

### 关键修正点总结

#### 修正前的问题
1. **`isInitialized` 是可选字段**（`isInitialized?: boolean`），存在 `undefined` 歧义
2. **规则总结表不完整**：没有考虑 mediaItem 是否 ready 的情况
3. **`rebuildForCmd` 行为不明确**：返回 ready 状态时，`isInitialized` 设置不清晰

#### 修正后的改进

1. **`isInitialized` 改为必选字段**（`isInitialized: boolean`）
   - ✅ 消除 `undefined` 歧义
   - ✅ 每个 TimelineItem 都有明确的初始化状态
   - ✅ 类型系统强制要求设置此字段
   
2. **规则总结表增加 mediaItem ready 维度**
   - ✅ 清晰区分 ready 和 loading 两种情况
   - ✅ 明确何时创建 MediaSync，何时直接完成
   - ✅ 涵盖所有可能的场景组合
   
3. **`rebuildForCmd` 智能设置 `isInitialized`**
   - ✅ 返回 ready 状态：自动设置 `isInitialized = true`
   - ✅ 返回 loading 状态：由调用方根据场景设置
   - ✅ 职责清晰：函数内部处理 ready 情况，调用方处理 loading 情况
   
4. **所有代码示例统一更新**
   - ✅ 添加 ready/loading 状态判断
   - ✅ 正确设置 `isInitialized`
   - ✅ 确保 `shouldUpdateTimelineItem` 与 `isInitialized` 一致

#### 实际影响

**场景 1：添加命令 + 媒体已 ready**
```typescript
// 修正前：创建 loading → MediaSync → 转换为 ready
// 修正后：直接创建 ready，isInitialized = true（rebuildForCmd 自动设置）
// 优势：消除不必要的异步操作
```

**场景 2：添加命令 + 媒体 loading**
```typescript
// 修正前：创建 loading，isInitialized 可能是 undefined
// 修正后：创建 loading，调用方明确设置 isInitialized = false
// 优势：类型安全，语义明确
```

**场景 3：项目加载 + 媒体 ready**
```typescript
// 修正前：创建 loading → MediaSync → 转换为 ready
// 修正后：直接创建 ready，isInitialized = true（rebuildForCmd 自动设置）
// 优势：加载速度更快
```

**场景 4：项目加载 + 媒体 loading**
```typescript
// 修正前：创建 loading，isInitialized 可能是 undefined，可能被错误覆盖
// 修正后：创建 loading，调用方明确设置 isInitialized = true
// 优势：保护用户数据不被覆盖
```

**场景 5：Undo 删除 + 媒体 ready**
```typescript
// 修正前：创建 loading → MediaSync → 可能覆盖原有数据
// 修正后：直接创建 ready，isInitialized = true（rebuildForCmd 自动设置）
// 优势：恢复速度快，数据安全
```

**场景 6：Undo 删除 + 媒体 loading**
```typescript
// 修正前：创建 loading，isInitialized 不明确，可能被错误覆盖
// 修正后：创建 loading，保持原有的 isInitialized 值
// 优势：完美保护原有状态
```

---

## 实施计划

### 阶段 0：添加 `isInitialized` 字段到所有创建 TimelineItem 的地方（优先级最高）

#### 0.1 修改类型定义
- [ ] 修改 [`UnifiedTimelineItemRuntime`](LightCut-frontend/src/core/timelineitem/type.ts) 类型定义
  - [ ] 将 `isInitialized?: boolean` 改为 `isInitialized: boolean`（必选字段）

#### 0.2 修改创建 TimelineItem 的函数
- [ ] 修改 [`createTimelineItemFromMediaItem()`](LightCut-frontend/src/core/composables/useTimelineItemOperations.ts:28)
  - [ ] 在 `runtime` 中添加 `isInitialized: false`
  - [ ] 添加注释说明：新创建的项目，需要从 mediaItem 同步

- [ ] 修改 [`createAddTimelineItemCommand()`](LightCut-frontend/src/aipanel/composables/useBatchCommandBuilder.ts:90)
  - [ ] 在 `runtime` 中添加 `isInitialized: timelineStatus === 'ready' ? true : false`
  - [ ] 添加注释说明：根据 mediaItem 状态决定

- [ ] 修改 [`cloneTimelineItem()`](LightCut-frontend/src/core/timelineitem/factory.ts:34)
  - [ ] 在 `runtime` 中保留 `isInitialized: original.runtime.isInitialized`
  - [ ] 添加注释说明：保留原有的初始化状态

- [ ] 检查并修改 [`createTextTimelineItem()`](LightCut-frontend/src/core/utils/textTimelineUtils.ts)
  - [ ] 在 `runtime` 中添加 `isInitialized: true`
  - [ ] 添加注释说明：文本项目不依赖外部媒体，直接完成初始化

#### 0.3 修改 `rebuildForCmd` 实现
- [ ] 修改 [`rebuildForCmd`](LightCut-frontend/src/core/timelineitem/factory.ts:219) 实现，添加智能状态决策逻辑
- [ ] 添加对 `UnifiedMediaItemQueries.isReady()` 的调用
- [ ] 更新文本项目处理逻辑，直接返回 ready 状态并设置 `isInitialized = true`
- [ ] 更新媒体项目处理逻辑：
  - [ ] 媒体已 ready：返回 ready 状态，设置 `isInitialized = true`
  - [ ] 媒体未 ready：返回 loading 状态，不设置 `isInitialized`（由调用方设置）

#### 0.4 测试修正后的行为
- [ ] 测试用户拖拽素材到时间轴
- [ ] 测试 AI 面板批量添加素材
- [ ] 测试命令的 undo/redo
- [ ] 测试用户复制粘贴
- [ ] 测试创建文本项目
- [ ] 测试 `rebuildForCmd` 的智能状态决策：
  - [ ] 媒体已 ready 时返回 ready 状态
  - [ ] 媒体未 ready 时返回 loading 状态
  - [ ] 文本项目返回 ready 状态

### 阶段 1：创建新的统一类（不破坏现有代码）
- [ ] 创建 `MediaSyncOptions` 接口
- [ ] 创建新的 `MediaSync` 类，支持多个时间轴项目
- [ ] 保留旧的 `CommandMediaSync` 和 `ProjectLoadMediaSync`

### 阶段 2：更新调用方
- [ ] 更新 `AddTimelineItemCommand`：传递单元素数组
- [ ] 更新 `RemoveTrackCommand`：按媒体分组，传递数组
- [ ] 更新 `SplitTimelineItemCommand`：传递单元素数组
- [ ] 更新 `UnifiedProjectModule`：保持单个时间轴项目
- [ ] 确保所有命令都遵循统一的 MediaSync 创建模式（只在 loading 状态时创建）

### 阶段 3：清理旧代码
- [ ] 删除 `BaseMediaSync` 类
- [ ] 删除 `CommandMediaSync` 类
- [ ] 删除 `ProjectLoadMediaSync` 类
- [ ] 删除 `MediaSyncManager` 类（不再需要）
- [ ] 删除 `cleanupCommandMediaSync` 等辅助函数
- [ ] 更新相关文档

### 阶段 4：测试和验证
- [ ] 测试单个时间轴项目场景
- [ ] 测试批量时间轴项目场景
- [ ] 测试性能提升（100 个项目场景）
- [ ] 测试文本类型特殊处理
- [ ] 测试错误处理
- [ ] 测试媒体已 ready 时的快速路径（无 MediaSync）
- [ ] 测试媒体未 ready 时的正常路径（有 MediaSync）

---

## 代码示例

### 示例 1：AddTimelineItemCommand - 添加时间轴项目

#### execute() 方法

```typescript
/**
 * 执行命令：添加时间轴项目
 */
async execute(): Promise<void> {
  if (!this.originalTimelineItemData) {
    throw new Error('没有有效的时间轴项目数据')
  }
  try {
    console.log(`🔄 执行添加操作：从源头重建时间轴项目...`)

    // 从原始素材重新创建TimelineItem和sprite
    const rebuildResult = await TimelineItemFactory.rebuildForCmd({
      originalTimelineItemData: this.originalTimelineItemData,
      getMediaItem: this.mediaModule.getMediaItem,
      logIdentifier: 'AddTimelineItemCommand execute',
    })

    if (!rebuildResult.success) {
      throw new Error(`重建时间轴项目失败: ${rebuildResult.error}`)
    }

    const newTimelineItem = rebuildResult.timelineItem

    // ✅ 根据 TimelineItem 状态设置 isInitialized
    if (newTimelineItem.timelineStatus === 'ready') {
      // 媒体已就绪，rebuildForCmd 已设置 isInitialized = true
      // 无需额外操作
    } else {
      // 媒体未就绪，loading 状态
      // 添加命令：新创建的项目，未初始化
      newTimelineItem.runtime.isInitialized = false
    }

    // 1. 添加到时间轴
    await this.timelineModule.addTimelineItem(newTimelineItem)

    // 2. 针对loading状态的项目设置状态同步（确保时间轴项目已添加到store）
    if (TimelineItemQueries.isLoading(newTimelineItem)) {
      // 先清理旧的MediaSync实例（防止重复执行时创建多个同步）
      if (this.mediaSync) {
        this.mediaSync.cleanup()
        this.mediaSync = undefined
      }
      
      this.mediaSync = new MediaSync(newTimelineItem.mediaItemId, {
        syncId: this.id,                          // 使用命令ID作为syncId
        timelineItemIds: [newTimelineItem.id],    // 单个时间轴项目
        shouldUpdateCommand: true,                 // 需要更新命令数据
        shouldUpdateTimelineItem: !newTimelineItem.runtime.isInitialized, // = true
        commandId: this.id,
        description: `AddTimelineItemCommand: ${this.id}`,
      })
      await this.mediaSync.setup()
    }
    console.log(`✅ 已添加时间轴项目: ${this.originalTimelineItemData.id}`)
  } catch (error) {
    console.error(`❌ 添加时间轴项目失败: ${this.originalTimelineItemData.id}`, error)
    throw error
  }
}
```

#### undo() 方法

```typescript
/**
 * 撤销命令：移除时间轴项目
 */
async undo(): Promise<void> {
  if (!this.originalTimelineItemData) {
    console.warn('⚠️ 没有有效的时间轴项目数据，无法撤销')
    return
  }
  try {
    const existingItem = this.timelineModule.getTimelineItem(this.originalTimelineItemData.id)
    if (!existingItem) {
      console.warn(`⚠️ 时间轴项目不存在，无法撤销: ${this.originalTimelineItemData.id}`)
      return
    }

    // 移除时间轴项目（这会自动处理sprite的清理）
    // 注意：undo时不需要设置MediaSync，因为是删除操作
    await this.timelineModule.removeTimelineItem(this.originalTimelineItemData.id)
    console.log(`↩️ 已撤销添加时间轴项目: ${this.originalTimelineItemData.id}`)
  } catch (error) {
    console.error(`❌ 撤销添加时间轴项目失败: ${this.originalTimelineItemData.id}`, error)
    throw error
  }
}
```

---

### 示例 2：RemoveTimelineItemCommand - 删除时间轴项目

#### execute() 方法

```typescript
/**
 * 执行命令：删除时间轴项目
 */
async execute(): Promise<void> {
  try {
    // 检查项目是否存在
    const existingItem = this.timelineModule.getTimelineItem(this.timelineItemId)
    if (!existingItem) {
      console.warn(`⚠️ 时间轴项目不存在，无法删除: ${this.timelineItemId}`)
      return
    }

    if (!this.originalTimelineItemData) {
      // 保存重建所需的完整元数据
      this.originalTimelineItemData = TimelineItemFactory.clone(existingItem)
    }

    // 设置媒体同步（只针对loading状态的项目）
    // 注意：即使项目即将被删除，仍需要同步以更新命令数据（用于撤销）
    if (TimelineItemQueries.isLoading(existingItem)) {
      // 先清理旧的MediaSync实例（防止重复执行时创建多个同步）
      if (this.mediaSync) {
        this.mediaSync.cleanup()
        this.mediaSync = undefined
      }
      
      this.mediaSync = new MediaSync(existingItem.mediaItemId, {
        syncId: this.id,                          // 使用命令ID作为syncId
        timelineItemIds: [existingItem.id],       // 保存时间轴项目ID
        shouldUpdateCommand: true,                 // 需要更新命令数据（撤销用）
        shouldUpdateTimelineItem: false,           // 不需要更新（项目已被删除）
        commandId: this.id,
        description: `RemoveTimelineItemCommand: ${this.id}`,
      })
      await this.mediaSync.setup()
    }

    // 删除时间轴项目（这会自动处理sprite的清理和WebAV画布移除）
    await this.timelineModule.removeTimelineItem(this.timelineItemId)
    console.log(`↩️ 已删除时间轴项目: ${this.timelineItemId}`)
  } catch (error) {
    console.error(`❌ 删除时间轴项目失败: ${this.timelineItemId}`, error)
    throw error
  }
}
```

#### undo() 方法

```typescript
/**
 * 撤销命令：重新创建时间轴项目
 */
async undo(): Promise<void> {
  if (!this.originalTimelineItemData) {
    throw new Error('没有有效的时间轴项目数据')
  }
  try {
    console.log(`🔄 执行撤销删除操作：从源头重建时间轴项目...`)

    // 从原始素材重新创建TimelineItem和sprite
    const rebuildResult = await TimelineItemFactory.rebuildForCmd({
      originalTimelineItemData: this.originalTimelineItemData,
      getMediaItem: this.mediaModule.getMediaItem,
      logIdentifier: 'RemoveTimelineItemCommand undo',
    })

    if (!rebuildResult.success) {
      throw new Error(`重建时间轴项目失败: ${rebuildResult.error}`)
    }

    const newTimelineItem = rebuildResult.timelineItem

    // ✅ 根据 TimelineItem 状态设置 isInitialized
    if (newTimelineItem.timelineStatus === 'ready') {
      // 媒体已就绪，rebuildForCmd 已设置 isInitialized = true
      // 无需额外操作
    } else {
      // 媒体未就绪，loading 状态
      // 删除命令的 undo：恢复原有的 isInitialized 标记
      // 注意：isInitialized 是必选字段，originalTimelineItemData 中一定有值
      newTimelineItem.runtime.isInitialized = this.originalTimelineItemData.runtime.isInitialized
    }

    // 1. 添加到时间轴
    await this.timelineModule.addTimelineItem(newTimelineItem)

    // 2. 针对loading状态的项目设置状态同步
    if (TimelineItemQueries.isLoading(newTimelineItem)) {
      // 先清理旧的MediaSync实例（防止重复执行时创建多个同步）
      if (this.mediaSync) {
        this.mediaSync.cleanup()
        this.mediaSync = undefined
      }
      
      this.mediaSync = new MediaSync(newTimelineItem.mediaItemId, {
        syncId: this.id,
        timelineItemIds: [newTimelineItem.id],
        shouldUpdateCommand: true,
        shouldUpdateTimelineItem: !newTimelineItem.runtime.isInitialized, // 使用恢复的标记
        commandId: this.id,
        description: `RemoveTimelineItemCommand undo: ${this.id}`,
      })
      await this.mediaSync.setup()
    }
    console.log(`✅ 已撤销删除时间轴项目: ${this.originalTimelineItemData.id}`)
  } catch (error) {
    console.error(`❌ 撤销删除时间轴项目失败: ${this.originalTimelineItemData.id}`, error)
    throw error
  }
}
```

---

### 示例 3：RemoveTrackCommand - 删除轨道（批量优化）

#### execute() 方法 - 性能优化版

```typescript
/**
 * 执行命令：删除轨道及其上的所有时间轴项目
 */
async execute(): Promise<void> {
  try {
    console.log(`🔄 执行删除轨道操作: ${this.trackData.name}...`)

    // 检查是否为最后一个轨道
    if (this.trackModule.tracks.value.length <= 1) {
      throw new Error('不能删除最后一个轨道')
    }

    // 检查轨道是否存在
    const track = this.trackModule.getTrack(this.trackId)
    if (!track) {
      console.warn(`⚠️ 轨道不存在，无法删除: ${this.trackId}`)
      return
    }

    // 🌟 性能优化：按媒体项目分组loading状态的时间轴项目
    const loadingItemsByMedia = new Map<string, string[]>()
    
    for (const item of this.affectedTimelineItems) {
      if (TimelineItemQueries.isLoading(item)) {
        const timelineIds = loadingItemsByMedia.get(item.mediaItemId) || []
        timelineIds.push(item.id)
        loadingItemsByMedia.set(item.mediaItemId, timelineIds)
      }
    }

    // 🌟 为每个唯一的媒体项目创建一个MediaSync（避免重复watcher）
    // 先清理旧的MediaSync实例（防止重复执行时创建多个同步）
    this.mediaSyncs.forEach(sync => sync.cleanup())
    this.mediaSyncs = []
    
    for (const [mediaItemId, timelineItemIds] of loadingItemsByMedia) {
      const mediaSync = new MediaSync(mediaItemId, {
        syncId: this.id,                          // 使用命令ID作为syncId
        timelineItemIds: timelineItemIds,         // 传递所有相关的时间轴项目ID数组
        shouldUpdateCommand: true,                 // 需要更新命令数据（撤销用）
        shouldUpdateTimelineItem: false,           // 不需要更新（项目已被删除）
        commandId: this.id,
        description: `RemoveTrackCommand: ${this.id}`,
      })
      await mediaSync.setup()
      this.mediaSyncs.push(mediaSync)  // 保存引用
    }

    // 删除轨道（这会自动删除轨道上的所有时间轴项目）
    await this.trackModule.removeTrack(this.trackId)

    console.log(
      `✅ 已删除轨道: ${this.trackData.name}, 删除了 ${this.affectedTimelineItems.length} 个时间轴项目`,
    )
  } catch (error) {
    console.error(`❌ 删除轨道失败: ${this.trackData.name}`, error)
    throw error
  }
}
```

**性能对比：**
- **优化前**：100个loading项目引用同一媒体 → 创建100个MediaSync → 100个watcher
- **优化后**：100个loading项目引用同一媒体 → 创建1个MediaSync → 1个watcher
- **性能提升**：99%减少内存和CPU开销

#### undo() 方法

```typescript
/**
 * 撤销命令：重建轨道和所有受影响的时间轴项目
 */
async undo(): Promise<void> {
  try {
    console.log(`🔄 撤销删除轨道操作：重建轨道 ${this.trackData.name}...`)

    // 1. 重建轨道，使用保存的原始索引位置
    this.trackModule.addTrack({ ...this.trackData }, this.trackIndex)

    // 2. 重建所有受影响的时间轴项目
    const newTimelineItems: UnifiedTimelineItemData<MediaType>[] = []
    
    for (const itemData of this.affectedTimelineItems) {
      console.log(`🔄 执行撤销删除轨道操作：从源头重建时间轴项目...`)

      // 从原始素材重新创建TimelineItem和sprite
      const rebuildResult = await TimelineItemFactory.rebuildForCmd({
        originalTimelineItemData: itemData,
        getMediaItem: this.mediaModule.getMediaItem,
        logIdentifier: 'RemoveTrackCommand undo',
      })

      if (!rebuildResult.success) {
        throw new Error(`轨道删除撤销重建时间轴项目失败: ${rebuildResult.error}`)
      }

      const newTimelineItem = rebuildResult.timelineItem

      // ✅ 根据 TimelineItem 状态设置 isInitialized
      if (newTimelineItem.timelineStatus === 'ready') {
        // 媒体已就绪，rebuildForCmd 已设置 isInitialized = true
        // 无需额外操作
      } else {
        // 媒体未就绪，loading 状态
        // 删除轨道命令的 undo：恢复原有的 isInitialized 标记
        // 注意：isInitialized 是必选字段，itemData 中一定有值
        newTimelineItem.runtime.isInitialized = itemData.runtime.isInitialized
      }

      // 添加到时间轴
      await this.timelineModule.addTimelineItem(newTimelineItem)
      
      // 收集新创建的时间轴项目
      newTimelineItems.push(newTimelineItem)
      
      console.log(`✅ 轨道删除撤销已恢复时间轴项目: ${itemData.id}`)
    }

    // 3. 🌟 性能优化：按媒体项目分组loading状态的时间轴项目
    const loadingItemsByMedia = new Map<string, string[]>()
    
    for (const item of newTimelineItems) {
      if (TimelineItemQueries.isLoading(item)) {
        const timelineIds = loadingItemsByMedia.get(item.mediaItemId) || []
        timelineIds.push(item.id)
        loadingItemsByMedia.set(item.mediaItemId, timelineIds)
      }
    }

    // 4. 🌟 为每个唯一的媒体项目创建一个MediaSync（避免重复watcher）
    // 先清理旧的MediaSync实例（防止重复执行时创建多个同步）
    this.mediaSyncs.forEach(sync => sync.cleanup())
    this.mediaSyncs = []
    
    for (const [mediaItemId, timelineItemIds] of loadingItemsByMedia) {
      // 获取第一个项目的 isInitialized 状态（同一批次的项目状态应该一致）
      const firstItem = newTimelineItems.find(item => item.id === timelineItemIds[0])
      
      const mediaSync = new MediaSync(mediaItemId, {
        syncId: this.id,
        timelineItemIds: timelineItemIds,         // 传递所有相关的时间轴项目ID数组
        shouldUpdateCommand: true,
        shouldUpdateTimelineItem: !firstItem?.runtime.isInitialized, // 使用恢复的标记
        commandId: this.id,
        description: `RemoveTrackCommand undo: ${this.id}`,
      })
      await mediaSync.setup()
      this.mediaSyncs.push(mediaSync)  // 保存引用
    }

    console.log(
      `↩️ 已撤销删除轨道: ${this.trackData.name}, 恢复了 ${this.affectedTimelineItems.length} 个时间轴项目`,
    )
  } catch (error) {
    console.error(`❌ 撤销删除轨道失败: ${this.trackData.name}`, error)
    throw error
  }
}
```

---

### 示例 4：UnifiedProjectModule - 项目加载场景

```typescript
/**
 * 恢复时间轴项目状态（用于项目加载）
 */
async function restoreTimelineItems(
  savedTimelineItems: UnifiedTimelineItemData[],
): Promise<void> {
  try {
    console.log('🎬 开始恢复时间轴项目状态...')

    // ... 前置验证代码 ...

    // 恢复时间轴项目数据
    if (savedTimelineItems && savedTimelineItems.length > 0) {
      for (const itemData of savedTimelineItems) {
        try {
          // ... 验证代码 ...

          console.log(`🔄 恢复时间轴项目：从源头重建 ${itemData.id}...`)

          // 从原始素材重新创建TimelineItem和sprite
          const rebuildResult = await TimelineItemFactory.rebuildForCmd({
            originalTimelineItemData: itemData,
            getMediaItem: mediaModule.getMediaItem,
            logIdentifier: 'restoreTimelineItems',
          })

          if (!rebuildResult.success) {
            console.error(`❌ 重建时间轴项目失败: ${itemData.id} - ${rebuildResult.error}`)
            continue
          }

          const newTimelineItem = rebuildResult.timelineItem

          // ✅ 根据 TimelineItem 状态设置 isInitialized
          if (newTimelineItem.timelineStatus === 'ready') {
            // 媒体已就绪，rebuildForCmd 已设置 isInitialized = true
            // 无需额外操作
          } else {
            // 媒体未就绪，loading 状态
            // 项目加载：从工程文件加载，已初始化（已有用户调整的数据）
            newTimelineItem.runtime.isInitialized = true
          }

          // 1. 添加到时间轴
          await timelineModule.addTimelineItem(newTimelineItem)

          // 2. 针对loading状态的项目设置状态同步
          if (newTimelineItem.timelineStatus === 'loading') {
            const mediaSync = new MediaSync(newTimelineItem.mediaItemId, {
              syncId: newTimelineItem.id,           // 使用时间轴项目ID作为syncId
              timelineItemIds: [newTimelineItem.id],
              shouldUpdateCommand: false,            // 项目加载场景不需要更新命令
              shouldUpdateTimelineItem: !newTimelineItem.runtime.isInitialized, // = false
              description: `ProjectLoad: ${newTimelineItem.id}`,
            })
            await mediaSync.setup()
          }

          console.log(`✅ 已恢复时间轴项目: ${itemData.id} (${itemData.mediaType})`)
        } catch (error) {
          console.error(`❌ 恢复时间轴项目失败: ${itemData.id}`, error)
          // 即使单个时间轴项目恢复失败，也要继续处理其他项目
        }
      }
    }

    console.log(`✅ 时间轴项目恢复完成: ${timelineModule.timelineItems.value.length}个项目`)
  } catch (error) {
    console.error('❌ 恢复时间轴项目失败:', error)
    throw error
  }
}
```

**项目加载场景的关键特点：**
- `syncId` 使用时间轴项目ID（而非命令ID）
- `shouldUpdateCommand: false` - 无命令对象需要更新
- `shouldUpdateTimelineItem: false` - 保留工程文件中用户调整过的属性
- 每个时间轴项目独立创建MediaSync（项目加载不需要批量优化）

---

## 关键设计决策

### 为什么使用标记位而不是 scenario 枚举？

**问题：** 原有的 `scenario: 'command' | 'projectLoad'` 方式存在以下问题：
1. 语义不够清晰，需要查看代码才能理解具体行为
2. 耦合了两个独立的控制维度（更新命令 + 更新项目）
3. 难以扩展新的组合场景

**解决方案：** 使用两个独立的布尔标记位

### `shouldUpdateCommand` 标记位

控制是否更新命令对象中的媒体数据：

- **true**: 命令场景，需要调用 `command.updateMediaData()`
  - 命令对象持有时间轴项目的元数据
  - 媒体加载完成后，更新命令中的元数据（用于撤销/重做）
  
- **false**: 项目加载场景，无命令对象
  - 不需要更新任何命令数据

### `shouldUpdateTimelineItem` 标记位

控制是否从媒体项目同步数据到时间轴项目：

- **true**: 新创建的时间轴项目
  - 时间轴项目是初始状态
  - 需要从媒体项目同步属性（尺寸、时长等）
  - `TimelineItemTransitioner` 会调用 `updateTimelineItem()`
  
- **false**: 从工程文件加载的时间轴项目
  - 已经包含用户调整过的属性（可能与原始媒体不同）
  - `TimelineItemTransitioner` 跳过 `updateTimelineItem()`，保留工程文件中的值

### 为什么统一使用数组？

统一使用 `timelineItemIds: string[]` 的好处：

1. **简化接口**：不需要支持 `string | string[]` 的重载
2. **性能优化**：自然支持批量场景，按媒体去重
3. **代码一致性**：所有调用方使用相同的接口
4. **易于理解**：明确表达"可以关联多个时间轴项目"

---

## 风险评估

### 低风险
- 外部调用代码需要修改为直接使用 `new MediaSync`，但配置选项清晰明确

### 需要注意
- 命令必须正确实现`dispose()`方法来清理MediaSync
- 文本类型的特殊处理需要保持一致
- 批量场景需要充分测试
- 需要同步更新 `TimelineItemTransitioner` 的接口，将 `scenario` 改为 `shouldUpdateTimelineItem`

---

## 总结

这个重构方案：
1. ✅ 消除了代码重复
2. ✅ 职责更加清晰（使用独立的标记位而非耦合的场景枚举）
3. ✅ 解决了批量场景的性能问题（最高 99% 提升）
4. ✅ 配置选项清晰明确，易于理解和使用
5. ✅ 更容易扩展和维护（标记位可以自由组合）
6. ✅ 更符合单一职责原则
7. ✅ 语义更清晰，配置即文档