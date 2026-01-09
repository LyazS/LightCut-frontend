# AI生成进度流重连机制设计方案

## 概述

为 `AIGenerationProcessor.ts` 的 `startProgressStream` 方法设计一个重连机制，确保在网络不稳定的情况下能够持续监听任务进度，直到任务达到终态（FINAL/NOT_FOUND）。

## 设计原则

1. **简洁性**：不过度设计，保持代码清晰易懂
2. **可靠性**：确保在终态时正确退出，避免无限重连
3. **渐进式重连**：使用递增等待时间，最大1分钟
4. **无限重连**：直到达到终态才停止重连
5. **无状态显示**：不向用户显示重连状态

## 核心实现方案

### 1. 递增等待时间算法

```typescript
/**
 * 计算重连等待时间
 * 递增策略：2^n 秒，最大 60 秒
 * @param retryCount 重连次数（从 0 开始）
 * @returns 等待时间（毫秒）
 */
function calculateRetryDelay(retryCount: number): number {
  const baseDelay = Math.pow(2, retryCount) * 1000; // 2^n 秒转换为毫秒
  const maxDelay = 60 * 1000; // 最大 60 秒
  return Math.min(baseDelay, maxDelay);
}

/**
 * 等待指定时间
 * @param ms 等待时间（毫秒）
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**等待时间序列：**
- 第1次重连：2秒
- 第2次重连：4秒
- 第3次重连：8秒
- 第4次重连：16秒
- 第5次重连：32秒
- 第6次及以后：60秒（最大值）

### 2. 最简化的重连机制实现

将重连逻辑完全放在 `return new Promise` 内部，确保所有逻辑都在 Promise 作用域内：

```typescript
/**
 * 进度流处理（使用fetchClient的stream方法，带重连机制）
 * @param aiTaskId 任务ID
 * @param mediaItem 媒体项目
 * @returns 生成的文件对象
 */
private async startProgressStream(
  aiTaskId: string,
  mediaItem: UnifiedMediaItemData,
): Promise<File> {
  const source = mediaItem.source as AIGenerationSourceData;

  return new Promise(async (resolve, reject) => {
    let retryCount = 0;
    let shouldStopReconnecting = false;

    // 重连循环 - 完全在 Promise 内部
    while (!shouldStopReconnecting) {
      try {
        console.log(`🔄 [AIGenerationProcessor] 尝试连接进度流 (第${retryCount + 1}次): ${aiTaskId}`);
        
        // 创建新的 AbortController
        const abortController = new AbortController();
        this.abortControllers.set(aiTaskId, abortController);

        // 使用fetchClient的stream方法处理NDJSON流
        await fetchClient
          .stream(
            'GET',
            `/api/media/tasks/${aiTaskId}/status`,
            (streamEvent: TaskStreamEvent) => {
              try {
                // 处理进度更新
                if (streamEvent.type === TaskStreamEventType.PROGRESS_UPDATE) {
                  console.log(`🎬 [AIGenerationProcessor] 任务进度更新:`, streamEvent);
                  const shouldTransition = this.handleProgressUpdate(source, streamEvent);

                  if (shouldTransition) {
                    console.log(
                      `🔄 [AIGenerationProcessor] 任务状态从 PENDING 转换到 PROCESSING，设置媒体状态为 asyncprocessing`,
                    );
                    this.transitionMediaStatus(mediaItem, 'asyncprocessing');
                  }
                }
                // 处理生成完成
                else if (streamEvent.type === TaskStreamEventType.FINAL) {
                  console.log(`📋 [AIGenerationProcessor] FINAL 事件状态: ${streamEvent.status}`);

                  // 如果是失败或取消状态，设置状态并拒绝
                  if (streamEvent.status === TaskStatus.FAILED) {
                    source.taskStatus = TaskStatus.FAILED;
                    console.error(`❌ [AIGenerationProcessor] 任务失败，状态: FAILED`);
                    shouldStopReconnecting = true;
                    reject(new Error(streamEvent.message));
                    return;
                  } else if (streamEvent.status === TaskStatus.CANCELLED) {
                    source.taskStatus = TaskStatus.CANCELLED;
                    console.warn(`⚠️ [AIGenerationProcessor] 任务已取消，状态: CANCELLED`);
                    shouldStopReconnecting = true;
                    reject(new Error(streamEvent.message));
                    return;
                  }

                  // 检查 result_path
                  if (!streamEvent.result_path) {
                    console.error(`❌ [AIGenerationProcessor] FINAL 事件中缺少 result_path`);
                    shouldStopReconnecting = true;
                    reject(new Error('FINAL 事件中缺少 result_path'));
                    return;
                  }

                  console.log(
                    `✅ [AIGenerationProcessor] 从 FINAL 事件获取到 result_path: ${streamEvent.result_path}`,
                  );
                  
                  // 标记为已解决，避免重复处理
                  shouldStopReconnecting = true;
                  this.handleFinalResult(aiTaskId, streamEvent.result_path, source)
                    .then(resolve)
                    .catch(reject);
                } else if (streamEvent.type === TaskStreamEventType.HEARTBEAT) {
                  // 心跳事件，保持连接活跃，无需处理
                } else if (streamEvent.type === TaskStreamEventType.NOT_FOUND) {
                  console.error(`❌ [AIGenerationProcessor] 进度流错误: ${streamEvent.message}`);
                  shouldStopReconnecting = true;
                  reject(new Error(streamEvent.message));
                }
                // 处理错误
                else if (streamEvent.type === TaskStreamEventType.ERROR) {
                  console.error(`❌ [AIGenerationProcessor] 进度流错误: ${streamEvent.message}`);
                  // ERROR 事件表示进度流系统错误，需要重连
                  shouldStopReconnecting = true;
                  reject(new Error(streamEvent.message));
                }
              } catch (error) {
                console.error(`❌ [AIGenerationProcessor] 处理流事件时发生错误:`, error);
                if (!shouldStopReconnecting) {
                  shouldStopReconnecting = true;
                  reject(error);
                }
              }
            },
            undefined,
            { signal: abortController.signal },
          );

        // 如果正常完成流处理（没有抛出异常），退出循环
        if (!shouldStopReconnecting) {
          console.log(`⚠️ [AIGenerationProcessor] 流意外结束，准备重连`);
        }

      } catch (error) {
        // 检查是否是终态错误（不需要重连）
        if (this.isTerminalError(error)) {
          console.log(`🛑 [AIGenerationProcessor] 检测到终态错误，停止重连: ${error.message}`);
          shouldStopReconnecting = true;
          reject(error);
          break;
        }
        
        // 检查是否是用户取消
        if (error.name === 'AbortError') {
          console.log(`⚠️ [AIGenerationProcessor] 用户取消，停止重连: ${aiTaskId}`);
          shouldStopReconnecting = true;
          reject(new Error('任务已取消'));
          break;
        }
        
        // 计算等待时间并重连
        const delay = calculateRetryDelay(retryCount);
        console.log(`⏳ [AIGenerationProcessor] 连接失败，${delay}ms 后重连: ${error.message}`);
        
        await sleep(delay);
        retryCount++;
      } finally {
        // 清理 AbortController
        this.abortControllers.delete(aiTaskId);
      }
    }
  });
}
```

### 3. 终态错误判断

```typescript
/**
 * 判断是否是终态错误（不需要重连）
 * @param error 错误对象
 * @returns 是否是终态错误
 */
private isTerminalError(error: any): boolean {
  if (!error) return false;
  
  const message = error.message || '';
  
  // 检查是否包含终态相关的错误信息
  return message.includes('任务已失败') ||
         message.includes('任务已取消') ||
         message.includes('任务不存在') ||
         message.includes('NOT_FOUND') ||
         message.includes('FINAL 事件中缺少 result_path');
}
```

## 实现细节

### AbortController 管理

1. **每次重连创建新控制器**：确保每次连接都有独立的中断能力
2. **及时清理旧控制器**：避免内存泄漏
3. **检查中断状态**：在重连循环中检查是否被用户取消

### 错误处理策略

1. **网络错误**：重连
2. **解析错误**：重连
3. **终态事件**：不重连，直接返回结果或抛出错误
4. **用户取消**：立即停止重连循环

### 重连时机

- `fetchClient.stream()` 抛出异常
- 流读取过程中发生网络错误
- JSON 解析失败
- 服务器返回非预期格式

### 不重连的情况

- 收到 `TaskStreamEventType.FINAL` 事件
- 收到 `TaskStreamEventType.NOT_FOUND` 事件
- 用户主动取消（AbortError）
- 检测到终态错误信息

## 优势

1. **简单可靠**：逻辑清晰，易于理解和维护
2. **渐进式退避**：避免频繁重连对服务器造成压力
3. **资源友好**：及时清理资源，避免内存泄漏
4. **用户体验**：无感知重连，不影响正常使用

## 注意事项

1. 确保重连不会导致重复处理同一个事件
2. 避免在重连过程中丢失重要的进度信息
3. 正确处理并发重连的情况
4. 确保在组件卸载时能够正确中断重连循环

## 测试建议

1. **网络中断测试**：模拟网络中断，验证重连机制
2. **服务器异常测试**：模拟服务器返回错误，验证错误处理
3. **终态测试**：验证在收到 FINAL/NOT_FOUND 事件时正确退出
4. **取消测试**：验证用户取消时能够正确中断重连
5. **长时间运行测试**：验证长时间重连不会导致内存泄漏