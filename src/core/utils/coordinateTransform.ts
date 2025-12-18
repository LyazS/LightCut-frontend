/**
 * 统一坐标系转换工具
 *
 * 项目坐标系：以画布中心为原点 (0,0)，向右为X正方向，向下为Y正方向
 * WebAV坐标系：以画布左上角为原点 (0,0)，向右为X正方向，向下为Y正方向
 */

/**
 * 将WebAV坐标系（左上角原点）转换为项目坐标系（中心原点）
 * @param webavX WebAV坐标系的X坐标
 * @param webavY WebAV坐标系的Y坐标
 * @param spriteWidth 精灵的宽度
 * @param spriteHeight 精灵的高度
 * @param canvasWidth 画布宽度
 * @param canvasHeight 画布高度
 * @returns 项目坐标系的坐标
 */
export function webavToProjectCoords(
  webavX: number,
  webavY: number,
  spriteWidth: number,
  spriteHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  // WebAV坐标系：左上角为原点，webavX/webavY是精灵左上角的位置
  // 项目坐标系：画布中心为原点，需要转换为精灵中心的位置

  // 1. 计算精灵中心在WebAV坐标系中的位置
  const spriteCenterX = webavX + spriteWidth / 2
  const spriteCenterY = webavY + spriteHeight / 2

  // 2. 转换为项目坐标系（以画布中心为原点）
  const projectX = spriteCenterX - canvasWidth / 2
  const projectY = spriteCenterY - canvasHeight / 2

  return { x: projectX, y: projectY }
}

/**
 * 将项目坐标系（中心原点）转换为WebAV坐标系（左上角原点）
 * @param projectX 项目坐标系的X坐标
 * @param projectY 项目坐标系的Y坐标
 * @param spriteWidth 精灵的宽度
 * @param spriteHeight 精灵的高度
 * @param canvasWidth 画布宽度
 * @param canvasHeight 画布高度
 * @returns WebAV坐标系的坐标
 */
export function projectToWebavCoords(
  projectX: number,
  projectY: number,
  spriteWidth: number,
  spriteHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  // 项目坐标系：画布中心为原点，projectX/projectY是精灵中心的位置
  // WebAV坐标系：左上角为原点，需要转换为精灵左上角的位置

  // 1. 计算精灵中心在WebAV坐标系中的位置
  const spriteCenterX = projectX + canvasWidth / 2
  const spriteCenterY = projectY + canvasHeight / 2

  // 2. 计算精灵左上角在WebAV坐标系中的位置
  const webavX = spriteCenterX - spriteWidth / 2
  const webavY = spriteCenterY - spriteHeight / 2

  return { x: webavX, y: webavY }
}

/**
 * 坐标转换验证函数
 * 用于调试，验证双向转换的一致性
 */
export function validateCoordinateTransform(
  originalWebavX: number,
  originalWebavY: number,
  spriteWidth: number,
  spriteHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  tolerance: number = 0.1,
) {
  // WebAV → 项目 → WebAV
  const projectCoords = webavToProjectCoords(
    originalWebavX,
    originalWebavY,
    spriteWidth,
    spriteHeight,
    canvasWidth,
    canvasHeight,
  )

  const backToWebav = projectToWebavCoords(
    projectCoords.x,
    projectCoords.y,
    spriteWidth,
    spriteHeight,
    canvasWidth,
    canvasHeight,
  )

  const xDiff = Math.abs(originalWebavX - backToWebav.x)
  const yDiff = Math.abs(originalWebavY - backToWebav.y)

  const isValid = xDiff <= tolerance && yDiff <= tolerance

  return {
    isValid,
    originalWebav: { x: originalWebavX, y: originalWebavY },
    projectCoords,
    backToWebav,
    differences: { x: xDiff, y: yDiff },
    tolerance,
  }
}

/**
 * 调试输出坐标转换信息
 */
export function debugCoordinateTransform(
  webavX: number,
  webavY: number,
  spriteWidth: number,
  spriteHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  const projectCoords = webavToProjectCoords(
    webavX,
    webavY,
    spriteWidth,
    spriteHeight,
    canvasWidth,
    canvasHeight,
  )

  const backToWebav = projectToWebavCoords(
    projectCoords.x,
    projectCoords.y,
    spriteWidth,
    spriteHeight,
    canvasWidth,
    canvasHeight,
  )

  console.group('🔄 坐标系转换调试')
  console.log('📐 画布尺寸:', { width: canvasWidth, height: canvasHeight })
  console.log('📦 精灵尺寸:', { width: spriteWidth, height: spriteHeight })
  console.log('🎯 WebAV坐标 (左上角原点):', { x: webavX, y: webavY })
  console.log('🎯 项目坐标 (中心原点):', { x: projectCoords.x, y: projectCoords.y })
  console.log('🔄 反向转换验证:', { x: backToWebav.x, y: backToWebav.y })
  console.log('✅ 转换精度:', {
    xDiff: Math.abs(webavX - backToWebav.x),
    yDiff: Math.abs(webavY - backToWebav.y),
  })
  console.groupEnd()

  return { projectCoords, backToWebav }
}

/**
 * 计算中心缩放时的新位置
 * 当精灵尺寸改变时，保持中心点不变，计算新的左上角位置
 * @param centerX 精灵中心的X坐标（项目坐标系）
 * @param centerY 精灵中心的Y坐标（项目坐标系）
 * @param newWidth 新的精灵宽度
 * @param newHeight 新的精灵高度
 * @param canvasWidth 画布宽度
 * @param canvasHeight 画布高度
 * @returns WebAV坐标系的新位置
 */
export function calculateCenterScalePosition(
  centerX: number,
  centerY: number,
  newWidth: number,
  newHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  // 直接使用现有的坐标转换函数
  return projectToWebavCoords(centerX, centerY, newWidth, newHeight, canvasWidth, canvasHeight)
}

/**
 * 调试中心缩放计算
 */
export function debugCenterScaling(
  centerX: number,
  centerY: number,
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  const oldWebavCoords = projectToWebavCoords(
    centerX,
    centerY,
    oldWidth,
    oldHeight,
    canvasWidth,
    canvasHeight,
  )
  const newWebavCoords = projectToWebavCoords(
    centerX,
    centerY,
    newWidth,
    newHeight,
    canvasWidth,
    canvasHeight,
  )

  console.group('🎯 中心缩放调试')
  console.log('📐 画布尺寸:', { width: canvasWidth, height: canvasHeight })
  console.log('🎯 中心位置 (项目坐标):', { x: centerX, y: centerY })
  console.log('📦 旧尺寸:', { width: oldWidth, height: oldHeight })
  console.log('📦 新尺寸:', { width: newWidth, height: newHeight })
  console.log('🔄 旧WebAV位置:', { x: oldWebavCoords.x, y: oldWebavCoords.y })
  console.log('🔄 新WebAV位置:', { x: newWebavCoords.x, y: newWebavCoords.y })
  console.log('📏 位置变化:', {
    deltaX: newWebavCoords.x - oldWebavCoords.x,
    deltaY: newWebavCoords.y - oldWebavCoords.y,
  })
  console.groupEnd()

  return { oldWebavCoords, newWebavCoords }
}
