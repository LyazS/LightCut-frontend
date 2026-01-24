import { ref, type Ref } from 'vue'
import type { ModuleRegistry } from './ModuleRegistry'
import { MODULE_NAMES } from './ModuleRegistry'
import type { UnifiedDirectoryModule } from './UnifiedDirectoryModule'
import type { UnifiedMediaModule } from './UnifiedMediaModule'
import type { CharacterDirectory } from '@/core/directory/types'
import {
  AIGenerationSourceFactory,
  TaskStatus,
  ContentType,
  AITaskType,
} from '@/core/datasource/providers/ai-generation/AIGenerationSource'
import { SourceOrigin } from '@/core/datasource/core/BaseDataSource'
import { generateMediaId } from '@/core/utils/idGenerator'
import { fetchClient } from '@/utils/fetchClient'
import { buildTaskErrorMessage } from '@/utils/errorMessageBuilder'
import type { TaskSubmitResponse } from '@/types/taskApi'

/**
 * 角色编辑器状态接口
 */
export interface CharacterEditorState {
  isOpen: boolean // 是否打开角色编辑器
  mode: 'create' | 'edit' // 编辑模式
  characterId: string | null // 正在编辑的角色 ID（仅编辑模式）
  // 创建模式的临时数据
  tempName: string // 临时角色名称
  tempDescription: string // 临时角色描述
}

/**
 * 统一 UI 模块
 * 负责管理应用内的 UI 状态
 */
export function createUnifiedUIModule(
  registry: ModuleRegistry,
): {
  // 状态
  isChatPanelVisible: Ref<boolean>
  characterEditorState: Ref<CharacterEditorState>

  // AI 面板状态管理方法
  setChatPanelVisible: (visible: boolean) => void

  // 角色编辑器方法
  openCharacterEditor: (mode: 'create' | 'edit', characterId?: string) => void
  closeCharacterEditor: () => void
  updateCharacterEditorTempData: (name: string, description: string) => void
  generateCharacterPortrait: (
    characterId: string | null,
    currentDirId: string | null,
    t: any,
  ) => Promise<void>
} {
  // 获取依赖模块
  const directoryModule = registry.get<UnifiedDirectoryModule>(MODULE_NAMES.DIRECTORY)
  const mediaModule = registry.get<UnifiedMediaModule>(MODULE_NAMES.MEDIA)

  // ==================== 状态定义 ====================

  // AI 聊天面板可见性状态（默认显示）
  const isChatPanelVisible = ref(true)

  // 角色编辑器状态
  const characterEditorState = ref<CharacterEditorState>({
    isOpen: false,
    mode: 'edit',
    characterId: null,
    tempName: '',
    tempDescription: '',
  })

  // ==================== 状态管理方法 ====================

  /**
   * 设置 AI 聊天面板可见性
   */
  function setChatPanelVisible(visible: boolean): void {
    isChatPanelVisible.value = visible
  }

  /**
   * 打开角色编辑器
   */
  function openCharacterEditor(mode: 'create' | 'edit', characterId?: string): void {
    if (mode === 'create') {
      // 创建模式：清空临时数据
      characterEditorState.value = {
        isOpen: true,
        mode: 'create',
        characterId: null,
        tempName: '',
        tempDescription: '',
      }
    } else {
      // 编辑模式：设置角色ID
      characterEditorState.value = {
        isOpen: true,
        mode: 'edit',
        characterId: characterId || null,
        tempName: '',
        tempDescription: '',
      }
    }
    console.log('✅ 角色编辑器已打开:', mode, characterId)
  }

  /**
   * 关闭角色编辑器
   */
  function closeCharacterEditor(): void {
    characterEditorState.value = {
      isOpen: false,
      mode: 'edit',
      characterId: null,
      tempName: '',
      tempDescription: '',
    }
    console.log('✅ 角色编辑器已关闭')
  }

  /**
   * 更新角色编辑器临时数据
   */
  function updateCharacterEditorTempData(name: string, description: string): void {
    characterEditorState.value.tempName = name
    characterEditorState.value.tempDescription = description
  }

  /**
   * 提交 AI 生成任务到后端
   */
  async function submitAIGenerationTask(requestParams: any): Promise<TaskSubmitResponse> {
    try {
      const response = await fetchClient.post<TaskSubmitResponse>(
        '/api/media/generate',
        requestParams,
      )
      if (response.status !== 200) {
        throw new Error(`提交任务失败: ${response.statusText}`)
      }
      return response.data
    } catch (error) {
      return {
        success: false,
        error_code: 'UNKNOWN_ERROR' as any,
        error_details: {
          error: error instanceof Error ? error.message : '网络请求失败',
        },
      }
    }
  }

  /**
   * 生成角色肖像
   * 复用 CreateCharacterModal 的逻辑
   * @param characterId 角色ID（编辑模式）或 null（创建模式）
   * @param currentDirId 当前目录ID（创建模式需要）
   */
  async function generateCharacterPortrait(
    characterId: string | null,
    currentDirId: string | null,
    t: any,
  ): Promise<void> {
    let characterDir: any
    let characterName: string
    let characterDescription: string

    if (characterEditorState.value.mode === 'create') {
      // 创建模式：使用临时数据
      characterName = characterEditorState.value.tempName.trim()
      characterDescription = characterEditorState.value.tempDescription.trim()

      // 验证
      if (!characterName || characterName.length < 1) {
        throw new Error(t('media.character.nameRequired'))
      }
      if (!characterDescription || characterDescription.length < 10) {
        throw new Error(t('media.character.descriptionTooShort'))
      }

      if (!currentDirId) {
        throw new Error(t('media.selectDirectoryFirst'))
      }
    } else {
      // 编辑模式：从角色文件夹获取数据
      if (!characterId) {
        throw new Error('角色文件夹不存在')
      }

      characterDir = directoryModule.getCharacterDirectory(characterId)
      if (!characterDir) {
        throw new Error('角色文件夹不存在')
      }

      characterName = characterDir.name.trim()
      characterDescription = characterDir.character.description.trim()

      // 验证
      if (!characterName || characterName.length < 1) {
        throw new Error(t('media.character.nameRequired'))
      }
      if (!characterDescription || characterDescription.length < 10) {
        throw new Error(t('media.character.descriptionTooShort'))
      }
    }

    try {
      // 1. 准备 banana-image 请求参数
      const taskConfig = {
        id: 'rh-nano-banana-2',
        prompt: characterDescription,
        resolution: '1K',
        aspectRatio: '1:1',
      }

      // 2. 创建 AI 生成数据源
      const aiSource = AIGenerationSourceFactory.createAIGenerationSource(
        {
          type: 'ai-generation',
          aiTaskId: '',
          requestParams: {
            ai_task_type: AITaskType.RUNNINGHUB_GENERATE_MEDIA,
            content_type: ContentType.IMAGE,
            task_config: taskConfig,
            sub_ai_task_type: 'standard_api',
          },
          taskStatus: TaskStatus.PENDING,
        },
        SourceOrigin.USER_CREATE,
      )

      // 3. 生成媒体ID
      const mediaId = generateMediaId('png')

      // 4. 创建媒体项
      const mediaItem = mediaModule.createUnifiedMediaItemData(
        mediaId,
        `${characterName}_portrait`,
        aiSource,
      )

      // 5. 提交任务到后端
      const submitResult = await submitAIGenerationTask(aiSource.requestParams)

      if (!submitResult.success) {
        // 任务提交失败，更新媒体状态
        mediaItem.mediaStatus = 'error'
        aiSource.errorMessage = buildTaskErrorMessage(
          submitResult.error_code,
          submitResult.error_details,
          t,
        )
        throw new Error(aiSource.errorMessage)
      }

      // 6. 更新任务ID并开始处理
      aiSource.aiTaskId = submitResult.task_id || ''
      aiSource.taskStatus = TaskStatus.PENDING

      // 7. 启动媒体处理流程
      mediaModule.startMediaProcessing(mediaItem)

      // 8. 添加到媒体库
      mediaModule.addMediaItem(mediaItem)

      // 9. 创建或更新角色文件夹
      if (characterEditorState.value.mode === 'create') {
        // 创建模式：创建新的角色文件夹
        characterDir = directoryModule.createCharacterDirectory(
          characterName,
          characterDescription,
          currentDirId!,
        )
        // 添加媒体到角色文件夹
        directoryModule.addMediaToDirectory(mediaId, characterDir.id)
        // 更新角色文件夹的图片引用
        characterDir.character.imageMediaId = mediaId
        // 切换到编辑模式
        characterEditorState.value.mode = 'edit'
        characterEditorState.value.characterId = characterDir.id
        characterEditorState.value.tempName = ''
        characterEditorState.value.tempDescription = ''
      } else {
        // 编辑模式：添加到现有角色文件夹
        directoryModule.addMediaToDirectory(mediaId, characterDir.id)
        // 更新角色文件夹的图片引用
        characterDir.character.imageMediaId = mediaId
      }

      console.log('✅ 角色肖像生成任务已提交:', mediaId)
    } catch (error) {
      console.error('生成角色肖像失败:', error)
      throw error
    }
  }

  // ==================== 导出接口 ====================

  return {
    // AI 面板状态
    isChatPanelVisible,

    // 角色编辑器状态
    characterEditorState,

    // AI 面板状态管理方法
    setChatPanelVisible,

    // 角色编辑器方法
    openCharacterEditor,
    closeCharacterEditor,
    updateCharacterEditorTempData,
    generateCharacterPortrait,
  }
}

// 导出类型定义
export type UnifiedUIModule = ReturnType<typeof createUnifiedUIModule>
