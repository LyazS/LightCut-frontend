import { markRaw, type Raw } from 'vue'
import { MP4Clip, ImgClip, AudioClip } from '@webav/av-cliper'

/**
 * 创建MP4Clip
 * @param file 视频文件
 */
export async function createMP4Clip(file: File): Promise<Raw<MP4Clip>> {
  try {
    console.log(`Creating MP4Clip for: ${file.name}`)

    // 创建MP4Clip
    const mp4Clip = markRaw(new MP4Clip(file.stream()))

    // 等待MP4Clip准备完成
    await mp4Clip.ready

    console.log(`MP4Clip created successfully for: ${file.name}`)
    return mp4Clip
  } catch (err) {
    const errorMessage = `创建MP4Clip失败: ${(err as Error).message}`
    console.error('MP4Clip creation error:', err)
    throw new Error(errorMessage)
  }
}

/**
 * 创建ImgClip
 * @param file 图片文件
 */
export async function createImgClip(file: File): Promise<Raw<ImgClip>> {
  try {
    console.log(`Creating ImgClip for: ${file.name}`)

    // 创建ImgClip
    const imgClip = markRaw(new ImgClip(file.stream()))

    // 等待ImgClip准备完成
    await imgClip.ready

    console.log(`ImgClip created successfully for: ${file.name}`)
    return imgClip
  } catch (err) {
    const errorMessage = `创建ImgClip失败: ${(err as Error).message}`
    console.error('ImgClip creation error:', err)
    throw new Error(errorMessage)
  }
}

/**
 * 创建AudioClip
 * @param file 音频文件
 */
export async function createAudioClip(file: File): Promise<Raw<AudioClip>> {
  try {
    console.log(`Creating AudioClip for: ${file.name}`)

    // 创建AudioClip
    const audioClip = markRaw(new AudioClip(file.stream()))

    // 等待AudioClip准备完成
    await audioClip.ready

    console.log(`AudioClip created successfully for: ${file.name}`)
    return audioClip
  } catch (err) {
    const errorMessage = `创建AudioClip失败: ${(err as Error).message}`
    console.error('AudioClip creation error:', err)
    throw new Error(errorMessage)
  }
}

/**
 * 克隆MP4Clip实例
 * @param originalClip 原始MP4Clip
 */
export async function cloneMP4Clip(originalClip: Raw<MP4Clip>): Promise<Raw<MP4Clip>> {
  try {
    console.log('Cloning MP4Clip...')

    // 使用WebAV内置的clone方法
    const clonedClip = await originalClip.clone()

    console.log('MP4Clip cloned successfully')
    return markRaw(clonedClip)
  } catch (err) {
    const errorMessage = `克隆MP4Clip失败: ${(err as Error).message}`
    console.error('MP4Clip clone error:', err)
    throw new Error(errorMessage)
  }
}

/**
 * 克隆ImgClip实例
 * @param originalClip 原始ImgClip
 */
export async function cloneImgClip(originalClip: Raw<ImgClip>): Promise<Raw<ImgClip>> {
  try {
    console.log('Cloning ImgClip...')

    // 使用WebAV内置的clone方法
    const clonedClip = await originalClip.clone()

    console.log('ImgClip cloned successfully')
    return markRaw(clonedClip)
  } catch (err) {
    const errorMessage = `克隆ImgClip失败: ${(err as Error).message}`
    console.error('ImgClip clone error:', err)
    throw new Error(errorMessage)
  }
}

/**
 * 克隆AudioClip实例
 * @param originalClip 原始AudioClip
 */
export async function cloneAudioClip(originalClip: Raw<AudioClip>): Promise<Raw<AudioClip>> {
  try {
    console.log('Cloning AudioClip...')

    // 使用WebAV内置的clone方法
    const clonedClip = await originalClip.clone()

    console.log('AudioClip cloned successfully')
    return markRaw(clonedClip)
  } catch (err) {
    const errorMessage = `克隆AudioClip失败: ${(err as Error).message}`
    console.error('AudioClip clone error:', err)
    throw new Error(errorMessage)
  }
}
