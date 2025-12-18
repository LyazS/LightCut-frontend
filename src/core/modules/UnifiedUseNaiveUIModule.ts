import { useDialog, useMessage, useNotification } from 'naive-ui'
import type { DialogOptions } from 'naive-ui'
/**
 * 统一通知管理模块
 * 负责管理应用内的通知显示和管理
 */
export function createUnifiedUseNaiveUIModule() {
  // ==================== 状态定义 ====================

  let naiveUIDialog: ReturnType<typeof useDialog> | null = null
  let naiveUIMessage: ReturnType<typeof useMessage> | null = null
  let naiveUINotification: ReturnType<typeof useNotification> | null = null

  // ==================== 公共方法 ====================

  /**
   * 显示成功通知
   */
  function messageSuccess(message: string): void {
    if (!naiveUIMessage) {
      console.warn('naiveUIMessage 未初始化')
      return
    }

    naiveUIMessage.success(message)
  }

  /**
   * 显示错误通知
   */
  function messageError(message: string): void {
    if (!naiveUIMessage) {
      console.warn('naiveUIMessage 未初始化')
      return
    }

    naiveUIMessage.error(message)
  }

  /**
   * 显示警告通知
   */
  function messageWarning(message: string): void {
    if (!naiveUIMessage) {
      console.warn('naiveUIMessage 未初始化')
      return
    }

    naiveUIMessage.warning(message)
  }

  /**
   * 显示信息通知
   */
  function messageInfo(message: string): void {
    if (!naiveUIMessage) {
      console.warn('naiveUIMessage 未初始化')
      return
    }

    naiveUIMessage.info(message)
  }

  /**
   * 显示成功对话框
   */
  function dialogSuccess(options: DialogOptions): void {
    if (!naiveUIDialog) {
      console.warn('naiveUIDialog 未初始化')
      return
    }

    naiveUIDialog.success(options)
  }

  /**
   * 显示错误对话框
   */
  function dialogError(options: DialogOptions): void {
    if (!naiveUIDialog) {
      console.warn('naiveUIDialog 未初始化')
      return
    }

    naiveUIDialog.error(options)
  }

  /**
   * 显示警告对话框
   */
  function dialogWarning(options: DialogOptions): void {
    if (!naiveUIDialog) {
      console.warn('naiveUIDialog 未初始化')
      return
    }

    naiveUIDialog.warning(options)
  }

  /**
   * 显示信息对话框
   */
  function dialogInfo(options: DialogOptions): void {
    if (!naiveUIDialog) {
      console.warn('naiveUIDialog 未初始化')
      return
    }

    naiveUIDialog.info(options)
  }

  function initApi(api: {
    dialog: ReturnType<typeof useDialog>
    message: ReturnType<typeof useMessage>
    notification: ReturnType<typeof useNotification>
  }) {
    naiveUIDialog = api.dialog
    naiveUIMessage = api.message
    naiveUINotification = api.notification
  }
  // ==================== 导出接口 ====================

  return {
    initApi,
    // 便捷通知方法
    messageSuccess,
    messageError,
    messageWarning,
    messageInfo,
    // 便捷对话框方法
    dialogSuccess,
    dialogError,
    dialogWarning,
    dialogInfo,
  }
}

// 导出类型定义
export type UnifiedUseNaiveUIModule = ReturnType<typeof createUnifiedUseNaiveUIModule>
