/**
 * 路径工具函数
 * 用于处理对象路径的读取和设置
 */

/**
 * 根据路径获取对象中的值
 * @param obj - 目标对象
 * @param path - 路径字符串，使用点号分隔（如 'a.b.c'）
 * @returns 路径对应的值，如果路径不存在则返回 undefined
 * 
 * @example
 * const obj = { a: { b: { c: 1 } } }
 * getValueByPath(obj, 'a.b.c') // 返回 1
 * getValueByPath(obj, 'a.b') // 返回 { c: 1 }
 * getValueByPath(obj, 'x.y') // 返回 undefined
 */
export function getValueByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined
  
  return path.split('.').reduce((current, key) => {
    return current?.[key]
  }, obj)
}

/**
 * 根据路径设置对象中的值
 * @param obj - 目标对象
 * @param path - 路径字符串，使用点号分隔（如 'a.b.c'）
 * @param value - 要设置的值
 * 
 * @example
 * const obj = { a: { b: { c: 1 } } }
 * setValueByPath(obj, 'a.b.c', 2)
 * // obj 变为 { a: { b: { c: 2 } } }
 * 
 * setValueByPath(obj, 'x.y.z', 3)
 * // obj 变为 { a: { b: { c: 2 } }, x: { y: { z: 3 } } }
 */
export function setValueByPath(obj: any, path: string, value: any): void {
  if (!obj || !path) return
  
  const keys = path.split('.')
  const lastKey = keys.pop()!
  
  // 逐级创建不存在的对象
  const target = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {}
    }
    return current[key]
  }, obj)
  
  // 设置最终值
  target[lastKey] = value
}

/**
 * 检查路径是否存在于对象中
 * @param obj - 目标对象
 * @param path - 路径字符串
 * @returns 路径是否存在
 * 
 * @example
 * const obj = { a: { b: { c: 1 } } }
 * hasPath(obj, 'a.b.c') // 返回 true
 * hasPath(obj, 'a.b.d') // 返回 false
 */
export function hasPath(obj: any, path: string): boolean {
  if (!obj || !path) return false
  
  const keys = path.split('.')
  let current = obj
  
  for (const key of keys) {
    if (!current || !(key in current)) {
      return false
    }
    current = current[key]
  }
  
  return true
}