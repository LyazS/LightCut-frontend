import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { LayoutConstants } from '@/constants/LayoutConstants'
import { createUnifiedMediaModule } from '@/core/modules/UnifiedMediaModule'
import { createUnifiedTrackModule } from '@/core/modules/UnifiedTrackModule'
import { createUnifiedTimelineModule } from '@/core/modules/UnifiedTimelineModule'
import { createUnifiedProjectModule } from '@/core/modules/UnifiedProjectModule'
import { createUnifiedViewportModule } from '@/core/modules/UnifiedViewportModule'
import { createUnifiedSelectionModule } from '@/core/modules/UnifiedSelectionModule'
import { createUnifiedConfigModule } from '@/core/modules/UnifiedConfigModule'
import { createUnifiedPlaybackModule } from '@/core/modules/UnifiedPlaybackModule'
import { createUnifiedWebavModule } from '@/core/modules/UnifiedWebavModule'
import { createUnifiedUseNaiveUIModule } from '@/core/modules/UnifiedUseNaiveUIModule'
import { createUnifiedHistoryModule } from '@/core/modules/UnifiedHistoryModule'
import { createUnifiedAutoSaveModule } from '@/core/modules/UnifiedAutoSaveModule'
import { createUnifiedVideoThumbnailModule } from '@/core/modules/UnifiedVideoThumbnailModule'
import { createUnifiedSnapModule } from '@/core/modules/UnifiedSnapModule'
import { createUnifiedUserModule } from '@/core/modules/UnifiedUserModule'
import { createUnifiedDirectoryModule } from '@/core/modules/UnifiedDirectoryModule'
import { createUnifiedMediaBunnyModule } from '@/core/modules/UnifiedMediaBunnyModule'
import { ModuleRegistry, MODULE_NAMES } from '@/core/modules/ModuleRegistry'
import { useHistoryOperations } from '@/core/composables/useHistoryOperations'
import { useUnifiedDrag } from '@/core/composables/useUnifiedDrag'
import { calculateTotalDurationFrames } from '@/core/utils/durationUtils'
import { useEditSDK } from '@/aipanel'
import type { AgentMediaInfo, AgentTimelineItemInfo } from '@/aipanel/composables/useEditSDK'
import type { MediaTypeOrUnknown } from '@/core'
import type { UnifiedTimelineItemData } from '@/core/timelineitem'
import type { UnifiedViewportModule } from '@/core/modules/UnifiedViewportModule'
import type { UnifiedPlaybackModule } from '@/core/modules/UnifiedPlaybackModule'
import { frameToPixel, pixelToFrame } from '@/core/utils/coordinateUtils'
import {
  expandTimelineIfNeededFrames,
  smartExpandTimelineIfNeeded,
  batchExpandTimelineIfNeeded,
  predictiveExpandTimeline,
  getTimelineExpansionSuggestion,
} from '@/core/utils/timeUtils'
import {
  getTimelineItemAtFrames,
  getTimelineItemsByTrack,
  findTimelineItemBySprite,
  getTimelineItemsAtFrames,
  getTimelineItemAtTrackAndFrames,
  isPlayheadInTimelineItem,
  getTimelineItemsByMediaType,
  getTimelineItemsByStatus,
  getTimelineItemDuration,
  sortTimelineItemsByTime,
  findOverlappingTimelineItems,
  findOverlappingTimelineItemsOnTrack,
  findOrphanedTimelineItems,
} from '@/core/utils/timelineSearchUtils'
import {
  cloneTimelineItem,
  duplicateTimelineItem,
} from '@/core/timelineitem/TimelineItemFactory'

/**
 * 统一视频编辑器存储
 * 基于新的统一类型系统重构的主要状态管理
 *
 * 架构特点：
 * 1. 使用模块注册中心模式管理所有模块依赖
 * 2. 采用"先创建后注册"模式解决循环依赖问题
 * 3. 各模块通过注册中心动态获取依赖
 * 4. 保持模块化设计，各模块职责清晰
 * 5. 提供完整的视频编辑功能支持
 */
export const useUnifiedStore = defineStore('unified', () => {
  // ==================== 模块注册中心初始化 ====================

  // 创建模块注册中心
  const registry = new ModuleRegistry()

  // ==================== 分阶段模块创建和注册 ====================

  // 阶段1: 创建基础模块（无依赖或只有配置依赖）
  const unifiedConfigModule = createUnifiedConfigModule()
  registry.register(MODULE_NAMES.CONFIG, unifiedConfigModule)

  const unifiedPlaybackModule = createUnifiedPlaybackModule(registry)
  registry.register(MODULE_NAMES.PLAYBACK, unifiedPlaybackModule)

  const unifiedWebavModule = createUnifiedWebavModule(registry)
  registry.register(MODULE_NAMES.WEBAV, unifiedWebavModule)

  const unifiedMediaModule = createUnifiedMediaModule(registry)
  registry.register(MODULE_NAMES.MEDIA, unifiedMediaModule)

  const unifiedTrackModule = createUnifiedTrackModule()
  registry.register(MODULE_NAMES.TRACK, unifiedTrackModule)

  const unifiedUseNaiveUIModule = createUnifiedUseNaiveUIModule()
  registry.register(MODULE_NAMES.USENAIVEUI, unifiedUseNaiveUIModule)

  const unifiedDirectoryModule = createUnifiedDirectoryModule(registry)
  registry.register(MODULE_NAMES.DIRECTORY, unifiedDirectoryModule)

  // 阶段2: 创建需要依赖的模块
  const unifiedTimelineModule = createUnifiedTimelineModule(registry)
  registry.register(MODULE_NAMES.TIMELINE, unifiedTimelineModule)

  const unifiedProjectModule = createUnifiedProjectModule(registry)
  registry.register(MODULE_NAMES.PROJECT, unifiedProjectModule)

  // 计算总时长（需要在timeline模块之后）
  const totalDurationFrames = computed(() => {
    return calculateTotalDurationFrames(
      unifiedTimelineModule.timelineItems.value,
      unifiedConfigModule.timelineDurationFrames.value,
    )
  })

  // 时间轴容器宽度（用于可见范围计算）
  const containerWidth = ref(800) // 默认容器宽度

  // 设置容器宽度的方法
  function setContainerWidth(width: number) {
    containerWidth.value = width
  }

  // 时间轴内容区域宽度（轨道内容区域的宽度，不包含轨道控制区域）
  // 计算属性：containerWidth - TRACK_CONTROL_WIDTH
  const timelineWidth = computed(() => {
    return containerWidth.value - LayoutConstants.TRACK_CONTROL_WIDTH
  })

  const unifiedViewportModule = createUnifiedViewportModule(registry)
  registry.register(MODULE_NAMES.VIEWPORT, unifiedViewportModule)

  const unifiedHistoryModule = createUnifiedHistoryModule(registry)
  registry.register(MODULE_NAMES.HISTORY, unifiedHistoryModule)

  const unifiedSelectionModule = createUnifiedSelectionModule(registry)
  registry.register(MODULE_NAMES.SELECTION, unifiedSelectionModule)

  const unifiedAutoSaveModule = createUnifiedAutoSaveModule(registry, {
    enabled: true,
    debounceTime: 2000,
    throttleTime: 30000,
    maxRetries: 3,
  })
  registry.register(MODULE_NAMES.AUTOSAVE, unifiedAutoSaveModule)

  const unifiedVideoThumbnailModule = createUnifiedVideoThumbnailModule(registry)
  registry.register(MODULE_NAMES.VIDEOTHUMBNAIL, unifiedVideoThumbnailModule)

  const unifiedSnapModule = createUnifiedSnapModule(registry)
  registry.register(MODULE_NAMES.SNAP, unifiedSnapModule)

  const unifiedUserModule = createUnifiedUserModule(registry)
  registry.register(MODULE_NAMES.USER, unifiedUserModule)

  const unifiedMediaBunnyModule = createUnifiedMediaBunnyModule(registry)
  registry.register(MODULE_NAMES.MEDIABUNNY, unifiedMediaBunnyModule)

  // 创建历史记录操作模块
  const historyOperations = useHistoryOperations(
    unifiedHistoryModule,
    unifiedTimelineModule,
    unifiedWebavModule,
    unifiedMediaModule,
    unifiedConfigModule,
    unifiedTrackModule,
    unifiedSelectionModule,
  )

  // 创建视频编辑执行系统
  const { executeUserScript, list_medias, list_timelineitems } = useEditSDK(
    unifiedHistoryModule,
    unifiedTimelineModule,
    unifiedWebavModule,
    unifiedMediaModule,
    unifiedConfigModule,
    unifiedTrackModule,
    unifiedSelectionModule,
    unifiedViewportModule,
    unifiedPlaybackModule,
  )

  // 创建统一拖拽管理器（已自动注册所有处理器）
  const dragManager = useUnifiedDrag(
    unifiedDirectoryModule,
    unifiedMediaModule,
    unifiedTimelineModule,
    unifiedSelectionModule,
    unifiedTrackModule,
  )

  // ==================== 导出接口 ====================

  return {
    // ==================== 历史记录包装方法导出 ====================

    // 时间轴项目历史记录方法
    addTimelineItemWithHistory: historyOperations.addTimelineItemWithHistory,
    removeTimelineItemWithHistory: historyOperations.removeTimelineItemWithHistory,
    moveTimelineItemWithHistory: historyOperations.moveTimelineItemWithHistory,
    updateTimelineItemTransformWithHistory:
      historyOperations.updateTimelineItemTransformWithHistory,
    splitTimelineItemAtTimeWithHistory: historyOperations.splitTimelineItemAtTimeWithHistory,
    duplicateTimelineItemWithHistory: historyOperations.duplicateTimelineItemWithHistory,
    resizeTimelineItemWithHistory: historyOperations.resizeTimelineItemWithHistory,
    // 轨道历史记录方法
    addTrackWithHistory: historyOperations.addTrackWithHistory,
    removeTrackWithHistory: historyOperations.removeTrackWithHistory,
    renameTrackWithHistory: historyOperations.renameTrackWithHistory,
    autoArrangeTrackWithHistory: historyOperations.autoArrangeTrackWithHistory,
    toggleTrackVisibilityWithHistory: historyOperations.toggleTrackVisibilityWithHistory,
    toggleTrackMuteWithHistory: historyOperations.toggleTrackMuteWithHistory,
    updateTextContentWithHistory: historyOperations.updateTextContentWithHistory,
    updateTextStyleWithHistory: historyOperations.updateTextStyleWithHistory,
    selectTimelineItemsWithHistory: historyOperations.selectTimelineItemsWithHistory,
    // 关键帧历史记录方法
    createKeyframeWithHistory: historyOperations.createKeyframeWithHistory,
    deleteKeyframeWithHistory: historyOperations.deleteKeyframeWithHistory,
    updatePropertyWithHistory: historyOperations.updatePropertyWithHistory,
    clearAllKeyframesWithHistory: historyOperations.clearAllKeyframesWithHistory,
    toggleKeyframeWithHistory: historyOperations.toggleKeyframeWithHistory,

    // ==================== 统一媒体模块状态和方法 ====================

    // 媒体项目状态
    mediaItems: unifiedMediaModule.mediaItems,

    // 媒体项目管理方法
    addMediaItem: unifiedMediaModule.addMediaItem,
    removeMediaItem: unifiedMediaModule.removeMediaItem,
    getMediaItem: unifiedMediaModule.getMediaItem,
    getMediaItemBySourceId: unifiedMediaModule.getMediaItemBySourceId,
    updateMediaItemName: unifiedMediaModule.updateMediaItemName,
    updateMediaItem: unifiedMediaModule.updateMediaItem,
    getAllMediaItems: unifiedMediaModule.getAllMediaItems,

    // 分辨率管理方法
    getVideoOriginalResolution: unifiedMediaModule.getVideoOriginalResolution,
    getImageOriginalResolution: unifiedMediaModule.getImageOriginalResolution,

    // 异步等待方法
    waitForMediaItemReady: unifiedMediaModule.waitForMediaItemReady,

    // 数据源处理方法
    startMediaProcessing: unifiedMediaModule.startMediaProcessing,
    cancelMediaProcessing: unifiedMediaModule.cancelMediaProcessing,

    // 便捷查询方法
    getReadyMediaItems: unifiedMediaModule.getReadyMediaItems,
    getProcessingMediaItems: unifiedMediaModule.getProcessingMediaItems,
    getErrorMediaItems: unifiedMediaModule.getErrorMediaItems,
    getMediaItemsBySourceType: unifiedMediaModule.getMediaItemsBySourceType,
    getMediaItemsStats: unifiedMediaModule.getMediaItemsStats,

    // 工厂函数和查询函数
    createUnifiedMediaItemData: unifiedMediaModule.createUnifiedMediaItemData,
    UnifiedMediaItemQueries: unifiedMediaModule.UnifiedMediaItemQueries,
    UnifiedMediaItemActions: unifiedMediaModule.UnifiedMediaItemActions,

    // ==================== 统一轨道模块状态和方法 ====================

    // 轨道状态
    tracks: unifiedTrackModule.tracks,

    // 轨道管理方法
    addTrack: unifiedTrackModule.addTrack,
    removeTrack: unifiedTrackModule.removeTrack,
    renameTrack: unifiedTrackModule.renameTrack,
    getTrack: unifiedTrackModule.getTrack,
    setTrackHeight: unifiedTrackModule.setTrackHeight,
    toggleTrackVisibility: unifiedTrackModule.toggleTrackVisibility,
    toggleTrackMute: unifiedTrackModule.toggleTrackMute,
    getTracksSummary: unifiedTrackModule.getTracksSummary,
    resetTracksToDefaults: unifiedTrackModule.resetTracksToDefaults,

    // 轨道恢复方法
    restoreTracks: unifiedTrackModule.restoreTracks,

    // ==================== 统一时间轴模块状态和方法 ====================

    // 时间轴项目状态
    timelineItems: unifiedTimelineModule.timelineItems,

    // 时间轴项目管理方法
    addTimelineItem: unifiedTimelineModule.addTimelineItem,
    removeTimelineItem: unifiedTimelineModule.removeTimelineItem,
    getTimelineItem: unifiedTimelineModule.getTimelineItem,
    getReadyTimelineItem: unifiedTimelineModule.getReadyTimelineItem,
    setupBidirectionalSync: unifiedTimelineModule.setupBidirectionalSync,
    updateTimelineItemPosition: unifiedTimelineModule.updateTimelineItemPosition,
    updateTimelineItemTransform: unifiedTimelineModule.updateTimelineItemTransform,
    setupTimelineItemSprite: unifiedTimelineModule.setupTimelineItemSprite,

    // 时间轴项目工厂函数
    cloneTimelineItemData: cloneTimelineItem,
    duplicateTimelineItem,

    // ==================== 统一项目模块状态和方法 ====================

    // 项目状态
    projectStatus: unifiedProjectModule.projectStatus,
    isProjectSaving: unifiedProjectModule.isSaving,
    isProjectLoading: unifiedProjectModule.isLoading,

    // 项目加载进度状态
    projectLoadingProgress: unifiedProjectModule.loadingProgress,
    projectLoadingStage: unifiedProjectModule.loadingStage,
    projectLoadingDetails: unifiedProjectModule.loadingDetails,
    showProjectLoadingProgress: unifiedProjectModule.showLoadingProgress,
    isProjectSettingsReady: unifiedProjectModule.isProjectSettingsReady,
    isProjectTimelineReady: unifiedProjectModule.isProjectTimelineReady,

    // 项目管理方法
    saveCurrentProject: unifiedProjectModule.saveCurrentProject,
    preloadProjectSettings: unifiedProjectModule.preloadProjectSettings,
    loadProjectContent: unifiedProjectModule.loadProjectContent,
    clearCurrentProject: unifiedProjectModule.clearCurrentProject,
    getProjectSummary: unifiedProjectModule.getProjectSummary,

    // 项目加载进度控制
    updateLoadingProgress: unifiedProjectModule.updateLoadingProgress,
    resetLoadingState: unifiedProjectModule.resetLoadingState,

    // ==================== 播放控制模块状态和方法 ====================

    // 播放控制状态
    currentFrame: unifiedPlaybackModule.currentFrame,
    currentWebAVFrame: unifiedPlaybackModule.currentWebAVFrame,
    isPlaying: unifiedPlaybackModule.isPlaying,
    playbackRate: unifiedPlaybackModule.playbackRate,

    // 计算属性
    formattedCurrentTime: unifiedPlaybackModule.formattedCurrentTime,
    playbackRateText: unifiedPlaybackModule.playbackRateText,

    // 帧数控制方法
    setCurrentFrame: unifiedPlaybackModule.setCurrentFrame,
    seekToFrame: unifiedPlaybackModule.seekToFrame,

    // 播放控制方法
    setPlaying: unifiedPlaybackModule.setPlaying,
    play: unifiedPlaybackModule.play,
    pause: unifiedPlaybackModule.pause,
    togglePlayPause: unifiedPlaybackModule.togglePlayPause,
    stop: unifiedPlaybackModule.stop,
    setPlaybackRate: unifiedPlaybackModule.setPlaybackRate,
    resetPlaybackRate: unifiedPlaybackModule.resetPlaybackRate,
    getPlaybackSummary: unifiedPlaybackModule.getPlaybackSummary,
    resetPlaybackToDefaults: unifiedPlaybackModule.resetToDefaults,

    // ==================== 配置模块状态和方法 ====================

    // 配置
    projectId: unifiedConfigModule.projectId,
    projectName: unifiedConfigModule.projectName,
    projectDescription: unifiedConfigModule.projectDescription,
    projectCreatedAt: unifiedConfigModule.projectCreatedAt,
    projectUpdatedAt: unifiedConfigModule.projectUpdatedAt,
    projectVersion: unifiedConfigModule.projectVersion,
    projectThumbnail: unifiedConfigModule.projectThumbnail,

    // 配置状态
    videoResolution: unifiedConfigModule.videoResolution,
    frameRate: unifiedConfigModule.frameRate,
    timelineDurationFrames: unifiedConfigModule.timelineDurationFrames,

    // 配置管理方法
    setVideoResolution: unifiedConfigModule.setVideoResolution,
    setFrameRate: unifiedConfigModule.setFrameRate,
    getConfigSummary: unifiedConfigModule.getConfigSummary,
    resetConfigToDefaults: unifiedConfigModule.resetToDefaults,
    restoreFromProjectSettings: unifiedConfigModule.restoreFromProjectSettings,

    // ==================== WebAV模块状态和方法 ====================

    // WebAV状态
    isWebAVReady: unifiedWebavModule.isWebAVReady,
    webAVError: unifiedWebavModule.webAVError,

    // WebAV管理方法
    addSpriteToCanvas: unifiedWebavModule.addSprite,
    removeSpriteFromCanvas: unifiedWebavModule.removeSprite,

    // WebAV画布容器管理
    createCanvasContainer: unifiedWebavModule.createCanvasContainer,
    initializeCanvas: unifiedWebavModule.initializeCanvas,
    getAVCanvas: unifiedWebavModule.getAVCanvas,
    getCanvasContainer: unifiedWebavModule.getCanvasContainer,

    // WebAV实例管理
    isWebAVReadyGlobal: unifiedWebavModule.isWebAVReadyGlobal,
    waitForWebAVReady: unifiedWebavModule.waitForWebAVReady,

    // WebAV画布销毁和重建
    destroyCanvas: unifiedWebavModule.destroyCanvas,
    recreateCanvas: unifiedWebavModule.recreateCanvas,

    // ==================== MediaBunny模块状态和方法 ====================

    // MediaBunny状态
    mediaBunnyPlaybackState: unifiedMediaBunnyModule.playbackState,
    isMediaBunnyReady: unifiedMediaBunnyModule.isMediaBunnyReady,
    mediaBunnyError: unifiedMediaBunnyModule.mediaBunnyError,

    // MediaBunny画布管理
    setMediaBunnyCanvas: unifiedMediaBunnyModule.setCanvas,
    destroyMediaBunny: unifiedMediaBunnyModule.destroy,

    // MediaBunny播放控制
    mediaBunnyPlay: unifiedMediaBunnyModule.play,
    mediaBunnyPause: unifiedMediaBunnyModule.pause,
    mediaBunnySeekTo: unifiedMediaBunnyModule.seekTo,
    updateMediaBunnyTimelineDuration: unifiedMediaBunnyModule.updateTimelineDuration,

    // MediaBunny工具方法
    isMediaBunnyAvailable: unifiedMediaBunnyModule.isMediaBunnyAvailable,
    getMediaBunnySummary: unifiedMediaBunnyModule.getMediaBunnySummary,
    resetMediaBunnyToDefaults: unifiedMediaBunnyModule.resetToDefaults,

    // ==================== 计算属性 ====================

    totalDurationFrames,

    // ==================== 统一视口模块状态和方法 ====================

    // 视口状态
    zoomLevel: unifiedViewportModule.zoomLevel,
    scrollOffset: unifiedViewportModule.scrollOffset,

    // 视口计算属性
    minZoomLevel: unifiedViewportModule.minZoomLevel,
    visibleDurationFrames: unifiedViewportModule.visibleDurationFrames,
    maxVisibleDurationFrames: unifiedViewportModule.maxVisibleDurationFrames,
    contentEndTimeFrames: unifiedViewportModule.contentEndTimeFrames,

    // 视口管理方法
    getMaxZoomLevelForTimeline: unifiedViewportModule.getMaxZoomLevelForTimeline,
    getMaxScrollOffsetForTimeline: unifiedViewportModule.getMaxScrollOffsetForTimeline,
    setZoomLevel: unifiedViewportModule.setZoomLevel,
    setScrollOffset: unifiedViewportModule.setScrollOffset,
    zoomIn: unifiedViewportModule.zoomIn,
    zoomOut: unifiedViewportModule.zoomOut,
    scrollLeft: unifiedViewportModule.scrollLeft,
    scrollRight: unifiedViewportModule.scrollRight,
    scrollToFrame: unifiedViewportModule.scrollToFrame,
    resetViewport: unifiedViewportModule.resetViewport,
    getViewportSummary: unifiedViewportModule.getViewportSummary,

    // ==================== 通知模块状态和方法 ====================

    // 便捷通知方法
    messageSuccess: unifiedUseNaiveUIModule.messageSuccess,
    messageError: unifiedUseNaiveUIModule.messageError,
    messageWarning: unifiedUseNaiveUIModule.messageWarning,
    messageInfo: unifiedUseNaiveUIModule.messageInfo,

    // 便捷对话框方法
    dialogSuccess: unifiedUseNaiveUIModule.dialogSuccess,
    dialogError: unifiedUseNaiveUIModule.dialogError,
    dialogWarning: unifiedUseNaiveUIModule.dialogWarning,
    dialogInfo: unifiedUseNaiveUIModule.dialogInfo,

    initApi: unifiedUseNaiveUIModule.initApi,

    // ==================== 历史模块状态和方法 ====================

    // 历史状态
    canUndo: unifiedHistoryModule.canUndo,
    canRedo: unifiedHistoryModule.canRedo,

    // 历史操作方法
    undo: unifiedHistoryModule.undo,
    redo: unifiedHistoryModule.redo,
    clearHistory: unifiedHistoryModule.clear,
    getHistorySummary: unifiedHistoryModule.getHistorySummary,
    getCommand: unifiedHistoryModule.getCommand,
    startBatch: unifiedHistoryModule.startBatch,
    executeBatchCommand: unifiedHistoryModule.executeBatchCommand,

    // ==================== 统一选择模块状态和方法 ====================
    selectedMediaItemIds: unifiedSelectionModule.selectedMediaItemIds,
    hasMediaSelection: unifiedSelectionModule.hasMediaSelection,
    isMediaMultiSelectMode: unifiedSelectionModule.isMediaMultiSelectMode,
    selectMediaItems: unifiedSelectionModule.selectMediaItems,
    isMediaItemSelected: unifiedSelectionModule.isMediaItemSelected,
    clearMediaSelection: unifiedSelectionModule.clearMediaSelection,

    // 选择状态
    selectedTimelineItemId: unifiedSelectionModule.selectedTimelineItemId,
    selectedTimelineItemIds: unifiedSelectionModule.selectedTimelineItemIds,
    isMultiSelectMode: unifiedSelectionModule.isMultiSelectMode,
    hasSelection: unifiedSelectionModule.hasSelection,

    // 统一选择API
    selectTimelineItems: unifiedSelectionModule.selectTimelineItems,

    // 兼容性选择方法
    selectTimelineItem: unifiedSelectionModule.selectTimelineItem,
    clearAllSelections: unifiedSelectionModule.clearAllSelections,
    toggleTimelineItemSelection: unifiedSelectionModule.toggleTimelineItemSelection,
    isTimelineItemSelected: unifiedSelectionModule.isTimelineItemSelected,
    getSelectedTimelineItem: unifiedSelectionModule.getSelectedTimelineItem,
    getSelectionSummary: unifiedSelectionModule.getSelectionSummary,
    resetSelectionToDefaults: unifiedSelectionModule.resetToDefaults,

    // 多选兼容性方法
    addToMultiSelection: unifiedSelectionModule.addToMultiSelection,
    removeFromMultiSelection: unifiedSelectionModule.removeFromMultiSelection,
    toggleMultiSelection: unifiedSelectionModule.toggleMultiSelection,
    clearMultiSelection: unifiedSelectionModule.clearMultiSelection,
    isInMultiSelection: unifiedSelectionModule.isInMultiSelection,

    // ==================== 系统状态方法 ====================

    // ==================== 坐标转换方法 ====================
    frameToPixel: (frames: number, timelineWidth: number) =>
      frameToPixel(
        frames,
        timelineWidth,
        totalDurationFrames.value,
        unifiedViewportModule.zoomLevel.value,
        unifiedViewportModule.scrollOffset.value,
      ),
    pixelToFrame: (pixel: number, timelineWidth: number) =>
      pixelToFrame(
        pixel,
        timelineWidth,
        totalDurationFrames.value,
        unifiedViewportModule.zoomLevel.value,
        unifiedViewportModule.scrollOffset.value,
      ),

    // ==================== 时间轴扩展功能 ====================
    expandTimelineIfNeededFrames: (targetFrames: number) =>
      expandTimelineIfNeededFrames(targetFrames, unifiedConfigModule.timelineDurationFrames),
    smartExpandTimelineIfNeeded: (targetFrames: number, minRatio?: number, maxRatio?: number) =>
      smartExpandTimelineIfNeeded(
        targetFrames,
        unifiedConfigModule.timelineDurationFrames,
        minRatio,
        maxRatio,
      ),
    batchExpandTimelineIfNeeded: (targetFramesList: number[], expansionRatio?: number) =>
      batchExpandTimelineIfNeeded(
        targetFramesList,
        unifiedConfigModule.timelineDurationFrames,
        expansionRatio,
      ),
    predictiveExpandTimeline: (
      currentUsedFrames: number,
      usageThreshold?: number,
      expansionRatio?: number,
    ) =>
      predictiveExpandTimeline(
        currentUsedFrames,
        unifiedConfigModule.timelineDurationFrames,
        usageThreshold,
        expansionRatio,
      ),
    getTimelineExpansionSuggestion: (
      currentDuration: number,
      targetFrames: number,
      currentUsedFrames: number,
    ) => getTimelineExpansionSuggestion(currentDuration, targetFrames, currentUsedFrames),

    // ==================== 时间轴搜索工具函数 ====================
    getTimelineItemAtFrames: (frames: number) =>
      getTimelineItemAtFrames(frames, unifiedTimelineModule.timelineItems.value),
    getTimelineItemsByTrack: (trackId: string) =>
      getTimelineItemsByTrack(trackId, unifiedTimelineModule.timelineItems.value),
    findTimelineItemBySprite: (sprite: any) =>
      findTimelineItemBySprite(sprite, unifiedTimelineModule.timelineItems.value),
    getTimelineItemsAtFrames: (frames: number) =>
      getTimelineItemsAtFrames(frames, unifiedTimelineModule.timelineItems.value),
    getTimelineItemAtTrackAndFrames: (trackId: string, frames: number) =>
      getTimelineItemAtTrackAndFrames(trackId, frames, unifiedTimelineModule.timelineItems.value),
    isPlayheadInTimelineItem: (item: UnifiedTimelineItemData, currentFrame: number) =>
      isPlayheadInTimelineItem(item, currentFrame),
    getTimelineItemsByMediaType: (mediaType: MediaTypeOrUnknown) =>
      getTimelineItemsByMediaType(mediaType, unifiedTimelineModule.timelineItems.value),
    getTimelineItemsByStatus: (status: 'ready' | 'loading' | 'error') =>
      getTimelineItemsByStatus(status, unifiedTimelineModule.timelineItems.value),
    findOverlappingTimelineItems: (startTime: number, endTime: number, excludeItemId?: string) =>
      findOverlappingTimelineItems(
        startTime,
        endTime,
        unifiedTimelineModule.timelineItems.value,
        excludeItemId,
      ),
    findOverlappingTimelineItemsOnTrack: (
      trackId: string,
      startTime: number,
      endTime: number,
      excludeItemId?: string,
    ) =>
      findOverlappingTimelineItemsOnTrack(
        trackId,
        startTime,
        endTime,
        unifiedTimelineModule.timelineItems.value,
        excludeItemId,
      ),
    findOrphanedTimelineItems: () =>
      findOrphanedTimelineItems(
        unifiedTimelineModule.timelineItems.value,
        unifiedMediaModule.mediaItems.value,
      ),

    // ==================== 统一自动保存模块状态和方法 ====================

    // 自动保存状态
    autoSaveState: unifiedAutoSaveModule.autoSaveState,
    autoSaveConfig: unifiedAutoSaveModule.config,

    // 自动保存方法
    enableAutoSave: unifiedAutoSaveModule.enableAutoSave,
    disableAutoSave: unifiedAutoSaveModule.disableAutoSave,
    manualSave: unifiedAutoSaveModule.manualSave,
    triggerAutoSave: unifiedAutoSaveModule.triggerAutoSave,
    resetAutoSaveState: unifiedAutoSaveModule.resetAutoSaveState,

    // ==================== 视频缩略图方法 ====================
    requestThumbnails: unifiedVideoThumbnailModule.requestThumbnails,
    cancelThumbnailTasks: unifiedVideoThumbnailModule.cancelTasks,
    cleanupThumbnailScheduler: unifiedVideoThumbnailModule.cleanup,

    // ==================== 统一用户模块状态和方法 ====================

    // 用户认证状态
    currentUser: unifiedUserModule.currentUser,
    isLoggedIn: unifiedUserModule.isLoggedIn,
    username: unifiedUserModule.username,
    isLoggingIn: unifiedUserModule.isLoggingIn,
    isRegistering: unifiedUserModule.isRegistering,
    isUsingActivationCode: unifiedUserModule.isUsingActivationCode,

    // 用户认证方法
    login: unifiedUserModule.login,
    register: unifiedUserModule.register,
    logout: unifiedUserModule.logout,

    // 用户信息获取
    getCurrentUser: unifiedUserModule.getCurrentUser,
    getAccessToken: unifiedUserModule.getAccessToken,
    checkLoginStatus: unifiedUserModule.checkLoginStatus,

    // 激活码功能
    useActivationCode: unifiedUserModule.useActivationCode,

    // ==================== 工具函数导出 ====================
    getThumbnailUrl: unifiedVideoThumbnailModule.getThumbnailUrl,

    // ==================== 统一吸附模块状态和方法 ====================

    // 吸附功能状态
    snapConfig: unifiedSnapModule.snapConfig,
    isSnapCalculating: unifiedSnapModule.isCalculating,
    isSnapCacheUpdating: unifiedSnapModule.isCacheUpdating,

    // 吸附功能方法
    updateSnapConfig: unifiedSnapModule.updateSnapConfig,
    calculateSnapPosition: unifiedSnapModule.calculateSnapPosition,
    collectSnapTargets: unifiedSnapModule.collectSnapTargets,
    clearSnapCache: unifiedSnapModule.clearCache,
    isSnapCacheValid: unifiedSnapModule.isCacheValid,
    getSnapSummary: unifiedSnapModule.getSnapSummary,

    // 拖拽集成方法
    startSnapDrag: unifiedSnapModule.startDrag,
    endSnapDrag: unifiedSnapModule.endDrag,

    // ==================== 统一目录模块状态和方法 ====================

    // 目录状态
    directories: unifiedDirectoryModule.directories,
    openTabs: unifiedDirectoryModule.openTabs,
    activeTabId: unifiedDirectoryModule.activeTabId,

    // 目录计算属性
    activeTab: unifiedDirectoryModule.activeTab,
    currentDir: unifiedDirectoryModule.currentDir,

    // 目录管理方法
    createDirectory: unifiedDirectoryModule.createDirectory,
    renameDirectory: unifiedDirectoryModule.renameDirectory,
    deleteDirectory: unifiedDirectoryModule.deleteDirectory, // 🆕 新增删除文件夹方法
    deleteMediaItem: unifiedDirectoryModule.deleteMediaItem, // 🆕 新增删除媒体项方法
    getDirectory: unifiedDirectoryModule.getDirectory,
    addMediaToDirectory: unifiedDirectoryModule.addMediaToDirectory,
    removeMediaFromDirectory: unifiedDirectoryModule.removeMediaFromDirectory,
    getDirectoryContent: unifiedDirectoryModule.getDirectoryContent,
    getBreadcrumb: unifiedDirectoryModule.getBreadcrumb,
    openTab: unifiedDirectoryModule.openTab,
    closeTab: unifiedDirectoryModule.closeTab,
    navigateToDir: unifiedDirectoryModule.navigateToDir,
    switchTab: unifiedDirectoryModule.switchTab,

    // 目录初始化和管理方法
    initializeRootDirectory: unifiedDirectoryModule.initializeRootDirectory,
    getAllDirectories: unifiedDirectoryModule.getAllDirectories,
    resetDirectories: unifiedDirectoryModule.resetDirectories,
    getDirectorySummary: unifiedDirectoryModule.getDirectorySummary,

    // 剪贴板状态
    clipboardState: unifiedDirectoryModule.clipboardState,

    // 剪贴板操作
    cut: unifiedDirectoryModule.cut,
    copy: unifiedDirectoryModule.copy,
    paste: unifiedDirectoryModule.paste,
    canPaste: unifiedDirectoryModule.canPaste,
    clearClipboard: unifiedDirectoryModule.clearClipboard,

    // 拖拽专用方法
    canDragToFolder: unifiedDirectoryModule.canDragToFolder,
    dragMoveMediaItems: unifiedDirectoryModule.dragMoveMediaItems,
    dragMoveFolder: unifiedDirectoryModule.dragMoveFolder,

    // 视图和排序状态
    viewMode: unifiedDirectoryModule.viewMode,
    sortBy: unifiedDirectoryModule.sortBy,
    sortOrder: unifiedDirectoryModule.sortOrder,

    // 视图和排序方法
    setViewMode: unifiedDirectoryModule.setViewMode,
    setSortBy: unifiedDirectoryModule.setSortBy,
    setSortOrder: unifiedDirectoryModule.setSortOrder,

    // ==================== 统一拖拽管理器方法 ====================

    // 拖拽核心方法
    startDrag: dragManager.startDrag,
    handleDragOver: dragManager.handleDragOver,
    handleDrop: dragManager.handleDrop,
    endDrag: dragManager.endDrag,
    getCurrentDragData: dragManager.getCurrentDragData,

    // 拖拽查询方法
    getSourceHandler: dragManager.getSourceHandler,
    getTargetHandler: dragManager.getTargetHandler,

    // ==================== 执行系统集成 ====================
    executeUserScript,
    list_medias,
    list_timelineitems,

    // 时间轴容器宽度（用于可见范围计算）
    containerWidth,
    setContainerWidth,

    // 时间轴内容区域宽度（计算属性）
    timelineWidth,
  }
})
