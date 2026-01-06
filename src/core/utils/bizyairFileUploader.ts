/**
 * 文件上传工具
 * 封装BizyAir文件上传的完整流程
 */

import OSS from 'ali-oss'
import { exportMediaItem, exportTimelineItem } from './projectExporter'
import { fetchClient } from '@/utils/fetchClient'
import type { FileData } from '@/core/datasource/providers/ai-generation/types'
import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import type { UnifiedTimelineItemData } from '@/core/timelineitem'
import type { MediaType } from '@/core/mediaitem'
import { cloneDeep } from 'lodash'

// 上传凭证接口
interface UploadCredentials {
  object_key: string
  access_key_id: string
  access_key_secret: string
  security_token: string
  endpoint: string
  bucket: string
  region: string
}

// 获取上传凭证响应数据
interface UploadTokenResponseData {
  file: {
    object_key: string
    access_key_id: string
    access_key_secret: string
    security_token: string
  }
  storage: {
    endpoint: string
    bucket: string
    region: string
  }
}

// 提交资源响应数据
interface CommitResourceResponseData {
  url: string
}

// API响应包装器
interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
}

// 上传结果接口
interface UploadResult {
  success: boolean
  url?: string
  object_key?: string
  error?: string
}

export class BizyairFileUploader {
  /**
   * 从FileData导出Blob
   */
  private static async exportFileDataToBlob(
    fileData: FileData,
    getMediaItem: (id: string) => UnifiedMediaItemData | undefined,
    getTimelineItem: (id: string) => UnifiedTimelineItemData<MediaType> | undefined,
  ): Promise<Blob> {
    if (fileData.source === 'media-item') {
      const mediaItem = getMediaItem(fileData.mediaItemId!)
      if (!mediaItem) {
        throw new Error(`找不到媒体项: ${fileData.mediaItemId}`)
      }
      return await exportMediaItem({ mediaItem })
    } else {
      // timeline-item
      const timelineItem = getTimelineItem(fileData.timelineItemId!)
      if (!timelineItem) {
        throw new Error(`找不到时间轴项: ${fileData.timelineItemId}`)
      }
      return await exportTimelineItem({
        timelineItem,
        getMediaItem,
      })
    }
  }

  /**
   * 获取上传凭证
   */
  private static async getUploadToken(fileName: string): Promise<UploadCredentials> {
    // 构建查询参数
    const queryParams = new URLSearchParams({
      file_name: fileName,
      file_type: 'inputs',
    })

    const response = await fetchClient.get<ApiResponse<UploadTokenResponseData>>(
      `/api/bizyairupload/token?${queryParams.toString()}`,
    )

    if (!response.data.success) {
      throw new Error(response.data.error || '获取上传凭证失败')
    }

    const { file, storage } = response.data.data
    return {
      object_key: file.object_key,
      access_key_id: file.access_key_id,
      access_key_secret: file.access_key_secret,
      security_token: file.security_token,
      endpoint: storage.endpoint,
      bucket: storage.bucket,
      region: storage.region,
    }
  }

  /**
   * 上传文件到OSS
   */
  private static async uploadToOSS(
    blob: Blob,
    credentials: UploadCredentials,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    // 规范化region(移除oss-前缀)
    const normalizedRegion = credentials.region.startsWith('oss-')
      ? credentials.region.slice(4)
      : credentials.region

    const client = new OSS({
      region: normalizedRegion,
      endpoint: credentials.endpoint,
      accessKeyId: credentials.access_key_id,
      accessKeySecret: credentials.access_key_secret,
      stsToken: credentials.security_token,
      bucket: credentials.bucket,
    })

    await client.put(credentials.object_key, blob)

    // OSS SDK 不支持 progress 回调，使用模拟进度
    if (onProgress) {
      onProgress(100)
    }
  }

  /**
   * 提交输入资源
   */
  private static async commitResource(fileName: string, objectKey: string): Promise<string> {
    const response = await fetchClient.post<ApiResponse<CommitResourceResponseData>>(
      '/api/bizyairupload/commit',
      {
        name: fileName,
        object_key: objectKey,
      },
    )

    if (!response.data.success) {
      throw new Error(response.data.error || '提交资源失败')
    }

    return response.data.data.url
  }

  /**
   * 完整的上传流程
   */
  static async uploadFile(
    fileData: FileData,
    getMediaItem: (id: string) => UnifiedMediaItemData | undefined,
    getTimelineItem: (id: string) => UnifiedTimelineItemData<MediaType> | undefined,
    onProgress?: (stage: string, progress: number) => void,
  ): Promise<UploadResult> {
    try {
      // 1. 导出文件
      onProgress?.('导出文件', 0)
      const blob = await this.exportFileDataToBlob(fileData, getMediaItem, getTimelineItem)

      // 2. 获取上传凭证
      onProgress?.('获取凭证', 20)
      const credentials = await this.getUploadToken(fileData.name)

      // 3. 上传到OSS
      onProgress?.('上传中', 30)
      await this.uploadToOSS(blob, credentials, (p) => {
        onProgress?.('上传中', 30 + Math.round(p * 0.5))
      })

      // 4. 提交资源
      onProgress?.('提交资源', 80)
      const url = await this.commitResource(fileData.name, credentials.object_key)

      onProgress?.('完成', 100)

      return {
        success: true,
        url,
        object_key: credentials.object_key,
      }
    } catch (error) {
      console.error('文件上传失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '上传失败',
      }
    }
  }

  /**
   * 批量上传文件（带重试）
   */
  static async uploadFiles(
    files: FileData[],
    getMediaItem: (id: string) => UnifiedMediaItemData | undefined,
    getTimelineItem: (id: string) => UnifiedTimelineItemData<MediaType> | undefined,
    onProgress?: (fileIndex: number, stage: string, progress: number) => void,
  ): Promise<Map<number, UploadResult>> {
    const results = new Map<number, UploadResult>()

    for (let i = 0; i < files.length; i++) {
      const result = await this.uploadFileWithRetry(
        files[i],
        getMediaItem,
        getTimelineItem,
        3, // 最多重试3次
        (stage, progress) => onProgress?.(i, stage, progress),
      )
      results.set(i, result)
    }

    return results
  }

  /**
   * 带重试的上传方法
   */
  static async uploadFileWithRetry(
    fileData: FileData,
    getMediaItem: (id: string) => UnifiedMediaItemData | undefined,
    getTimelineItem: (id: string) => UnifiedTimelineItemData<MediaType> | undefined,
    maxRetries: number = 3,
    onProgress?: (stage: string, progress: number) => void,
  ): Promise<UploadResult> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.uploadFile(fileData, getMediaItem, getTimelineItem, onProgress)
      } catch (error) {
        lastError = error as Error
        console.warn(`上传失败(尝试 ${attempt}/${maxRetries}):`, error)

        if (attempt < maxRetries) {
          // 等待后重试(指数退避)
          await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)))
        }
      }
    }

    return {
      success: false,
      error: `上传失败(已重试${maxRetries}次): ${lastError?.message}`,
    }
  }

  /**
   * 管道函数：处理配置中的文件上传
   * 整合检测、上传和更新配置的完整流程
   *
   * @param config AI配置对象
   * @param getMediaItem 获取媒体项的函数
   * @param getTimelineItem 获取时间轴项的函数
   * @param onProgress 进度回调
   * @returns 包含新配置和上传结果的对象
   */
  static async processConfigUploads(
    config: Record<string, any>,
    getMediaItem: (id: string) => UnifiedMediaItemData | undefined,
    getTimelineItem: (id: string) => UnifiedTimelineItemData<MediaType> | undefined,
    onProgress?: (fileIndex: number, stage: string, progress: number) => void,
  ): Promise<{
    newConfig: Record<string, any>
    uploadResults: Map<number, UploadResult>
  }> {
    // 1. 深度克隆配置，避免修改原对象
    const newConfig = cloneDeep(config)

    // 2. 检测需要上传的文件
    const filesToUpload: FileData[] = []

    for (const [key, value] of Object.entries(newConfig)) {
      if (Array.isArray(value) && value.length > 0) {
        // 使用 __type__ 字段检测 FileData
        if (value[0] && typeof value[0] === 'object' && value[0].__type__ === 'FileData') {
          filesToUpload.push(...value)
        }
      }
    }

    if (filesToUpload.length === 0) {
      return {
        newConfig,
        uploadResults: new Map(),
      }
    }

    // 3. 批量上传文件
    const uploadResults = await this.uploadFiles(
      filesToUpload,
      getMediaItem,
      getTimelineItem,
      onProgress,
    )

    // 4. 更新新配置中的URL
    let fileIndex = 0
    for (const [key, value] of Object.entries(newConfig)) {
      if (Array.isArray(value) && value.length > 0) {
        if (value[0] && typeof value[0] === 'object' && value[0].__type__ === 'FileData') {
          // 这是FileData数组,替换为URL数组
          newConfig[key] = value.map((_, index) => {
            const result = uploadResults.get(fileIndex + index)
            return result?.url || ''
          })
          fileIndex += value.length
        }
      }
    }

    return {
      newConfig,
      uploadResults,
    }
  }
}
