import { VisibleSprite } from '@webav/av-cliper'
import { EventTool } from '@webav/internal-utils'
import type { ExtendedSpriteEvents } from '@/core/visiblesprite/types'

/**
 * 基础的VisibleSprite类，继承自WebAV的VisibleSprite
 * 提供了扩展的事件监听功能，包括透明度变化事件
 * 作为ImageVisibleSprite和VideoVisibleSprite的公共父类
 */
export abstract class BaseVisibleSprite extends VisibleSprite {
  /**
   * 存储opacity值的私有字段
   */
  #opacityValue: number = 1

  // ==================== 覆写的事件工具 ====================

  /**
   * 覆写父类的事件工具，支持透明度变化事件
   */
  #evtTool = new EventTool<ExtendedSpriteEvents>()

  /**
   * 覆写父类的 on 方法，支持扩展的事件类型
   */
  on = this.#evtTool.on

  // ==================== 覆写的属性 ====================

  /**
   * 存储 zIndex 值的私有字段
   */
  #zIndexValue: number = 0

  /**
   * 覆写 zIndex 属性，使其使用新的事件工具
   */
  get zIndex(): number {
    return this.#zIndexValue
  }

  set zIndex(v: number) {
    const changed = this.#zIndexValue !== v
    this.#zIndexValue = v
    if (changed) {
      this.#evtTool.emit('propsChange', { zIndex: v })
    }
  }

  /**
   * 构造函数
   * @param clip Clip实例
   */
  constructor(clip: any) {
    // 调用父类构造函数
    super(clip)

    // 初始化属性值（从父类获取）
    this.#zIndexValue = super.zIndex
    // 注意：不能通过 super.opacity 访问，先使用默认值
    this.#opacityValue = (this as any).opacity || 1

    // 覆写 opacity 属性为访问器
    this.#setupOpacityAccessor()

    // 重新设置 rect 事件监听（因为我们覆写了 evtTool）
    this.#setupRectEventListener()
  }

  // ==================== 受保护的方法 ====================

  /**
   * 获取事件工具实例，供子类使用
   */
  protected getEventTool(): EventTool<ExtendedSpriteEvents> {
    return this.#evtTool
  }

  /**
   * 获取当前opacity值，供子类使用
   */
  protected getOpacityValue(): number {
    return this.#opacityValue
  }

  /**
   * 设置opacity值，供子类使用
   */
  protected setOpacityValue(value: number): void {
    this.#opacityValue = value
  }

  // ==================== 私有方法 ====================

  /**
   * 设置 opacity 属性访问器
   * 使用属性描述符覆写父类的 opacity 属性
   * 注意：由于父类的 opacity 是数据属性，不能直接用 getter/setter 覆写，
   * 所以必须使用 Object.defineProperty 方式
   */
  #setupOpacityAccessor(): void {
    Object.defineProperty(this, 'opacity', {
      get: (): number => {
        return this.#opacityValue
      },
      set: (value: number): void => {
        const changed = this.#opacityValue !== value
        this.#opacityValue = value
        if (changed) {
          this.#evtTool.emit('propsChange', { opacity: value })
        }
      },
      enumerable: true,
      configurable: true,
    })
  }

  /**
   * 重新设置 rect 事件监听
   * 因为我们覆写了 evtTool，需要重新绑定 rect 的 propsChange 事件
   */
  #setupRectEventListener(): void {
    this.rect.on('propsChange', (props) => {
      this.#evtTool.emit('propsChange', { rect: props })
    })
  }
}
