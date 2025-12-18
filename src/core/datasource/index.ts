/**
 * 数据源模块统一导出入口
 */

// 核心层
export * from './core'

// 提供者层
export * from './providers'

// 服务层
export * from './services'

// 注册中心
export { DataSourceRegistry, getDataSourceRegistry } from './registry'
