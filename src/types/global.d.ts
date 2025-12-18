/**
 * 全局类型声明文件
 * 为全局对象和扩展提供类型定义
 */

import type { TimelineItemDragData, MediaItemDragData } from './index'

// 扩展 Window 接口，添加拖拽数据属性
declare global {
  interface Window {
    __timelineDragData?: TimelineItemDragData | null
    __mediaDragData?: MediaItemDragData | null
  }
}

// 确保这个文件被视为模块
export {}
