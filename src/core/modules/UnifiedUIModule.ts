import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import type { ModuleRegistry } from './ModuleRegistry'
import { MODULE_NAMES } from './ModuleRegistry'
import type { UnifiedDirectoryModule } from './UnifiedDirectoryModule'
import type { CharacterDirectory } from '@/core/directory/types'
import type { FileData } from '@/aipanel/aigenerate/types'

/**
 * 角色编辑器状态接口
 */
export interface CharacterEditorState {
  mode: 'create' | 'edit' | 'none' // 编辑模式：none表示关闭
  characterId: string | null // 正在编辑的角色 ID（仅编辑模式）
  // 创建模式的临时数据
  tempName: string // 临时角色名称
  tempDescription: string // 临时角色描述
  tempRefImages: FileData[] // 临时参考图 FileData 数组
  tempAspectRatio: string // 临时图像比例（必选，初始值为 '1:1'）
}

/**
 * 统一 UI 模块
 * 负责管理应用内的 UI 状态
 */
export function createUnifiedUIModule(registry: ModuleRegistry): {
  // 状态
  isChatPanelVisible: Ref<boolean>
  aiPanelActiveTab: Ref<'ai-generate' | 'agent' | 'character-editor'>
  characterEditorState: Ref<CharacterEditorState>

  // 角色编辑器计算属性
  curCharacterDir: ComputedRef<CharacterDirectory | null>

  // 计算属性
  canShowCharacterEditor: ComputedRef<boolean>

  // AI 面板状态管理方法
  setChatPanelVisible: (visible: boolean) => void

  // 角色编辑器方法
  openCharacterEditor: (mode: 'create' | 'edit', characterId?: string) => void
  closeCharacterEditor: () => void
} {
  // 获取依赖模块
  const directoryModule = registry.get<UnifiedDirectoryModule>(MODULE_NAMES.DIRECTORY)

  // ==================== 状态定义 ====================

  // AI 聊天面板可见性状态（默认显示）
  const isChatPanelVisible = ref(true)

  // AI 面板当前激活的标签页
  const aiPanelActiveTab = ref<'ai-generate' | 'agent' | 'character-editor'>('ai-generate')

  // 角色编辑器状态
  const characterEditorState = ref<CharacterEditorState>({
    mode: 'none',
    characterId: null,
    tempName: '',
    tempDescription: '',
    tempRefImages: [],
    tempAspectRatio: '1:1',
  })

  // 角色文件夹引用（计算属性）
  const curCharacterDir = computed(() => {
    const { mode, characterId } = characterEditorState.value
    if (mode !== 'edit' || !characterId) return null
    return directoryModule.getCharacterDirectory(characterId) || null
  })

  // ==================== 计算属性 ====================

  /**
   * 判断是否可以显示角色编辑器标签页
   * none 模式：不显示
   * create 模式：显示
   * edit 模式：需要角色存在（character 不为 null）
   */
  const canShowCharacterEditor = computed(() => {
    const { mode } = characterEditorState.value

    // none 模式：不显示标签页
    if (mode === 'none') return false

    // create 模式：显示
    if (mode === 'create') {
      return true
    }

    // edit 模式：需要角色存在
    if (mode === 'edit') {
      return curCharacterDir.value !== null
    }

    return false
  })

  // ==================== 监听器 ====================

  // 监听角色编辑器可显示性，自动切换标签页
  watch(canShowCharacterEditor, (shouldShow) => {
    if (shouldShow) {
      aiPanelActiveTab.value = 'character-editor'
    } else {
      // 如果不可以显示角色编辑器，且当前标签页是 character-editor，则切换到 ai-generate
      if (aiPanelActiveTab.value === 'character-editor') {
        aiPanelActiveTab.value = 'ai-generate'
        console.log('🔄 角色编辑器不可用，已切换到 AI 生成标签页')
      }
    }
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
        mode: 'create',
        characterId: null,
        tempName: '',
        tempDescription: '',
        tempRefImages: [],
        tempAspectRatio: '1:1',
      }
    } else {
      // 编辑模式：设置角色ID
      characterEditorState.value = {
        mode: 'edit',
        characterId: characterId || null,
        tempName: '',
        tempDescription: '',
        tempRefImages: [],
        tempAspectRatio: '1:1',
      }
    }
    console.log('✅ 角色编辑器已打开:', mode, characterId)
  }

  /**
   * 关闭角色编辑器
   */
  function closeCharacterEditor(): void {
    characterEditorState.value = {
      mode: 'none',
      characterId: null,
      tempName: '',
      tempDescription: '',
      tempRefImages: [],
      tempAspectRatio: '1:1',
    }
    console.log('✅ 角色编辑器已关闭')
  }

  // ==================== 导出接口 ====================

  return {
    // AI 面板状态
    isChatPanelVisible,
    aiPanelActiveTab,

    // 角色编辑器状态
    characterEditorState,

    // 角色编辑器计算属性
    curCharacterDir,

    // 计算属性
    canShowCharacterEditor,

    // AI 面板状态管理方法
    setChatPanelVisible,

    // 角色编辑器方法
    openCharacterEditor,
    closeCharacterEditor,
  }
}

// 导出类型定义
export type UnifiedUIModule = ReturnType<typeof createUnifiedUIModule>
