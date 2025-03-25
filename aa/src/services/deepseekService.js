/**
 * DeepSeek API 服务
 * 处理与DeepSeek API的通信
 * 文档: https://api-docs.deepseek.com/
 */

// DeepSeek API配置
const DEEPSEEK_API_KEY = 'sk-afcb0b06bdf446838dcc874e25eb764c';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

/**
 * 使用DeepSeek API分析域名
 * @param {string} domain 要分析的域名
 * @param {Function} onStream 流式数据回调函数
 * @returns {Promise<string>} 分析结果
 */
export async function analyzeDomain(domain, onStream = null) {
  try {
    // 构建请求体
    const requestBody = {
      model: "deepseek-reasoner",
      messages: [
        {
          role: "system",
          content: `你是一位专业的域名分析师和域名估价专家。你将根据用户提供的域名进行详细分析，包括：
1. 域名的基本构成和类型（通用、行业特定等）
2. 域名的品牌价值、记忆性和市场潜力
3. 域名在当前环境下的大致估价范围
4. 推荐的使用场景和行业

请确保分析客观、专业，并提供具体的理由支持你的观点。`
        },
        {
          role: "user",
          content: `请帮我分析以下域名的价值、适用场景和推荐行业：${domain}`
        }
      ],
      stream: true,
      max_tokens: 4000
    };
    
    // 用于流数据处理的数据累积变量
    let reasoningContent = '';
    let finalContent = '';
    
    // 额外的状态跟踪变量
    let isReasoningPhase = true; // 初始假设处于思考阶段
    let hasProcessedReasoning = false; // 跟踪是否已处理过思考结束信号
    let reasoningDone = false; // 跟踪思考阶段是否已结束
    
    // 流式更新缓冲区管理器 - 这是新增的代码
    const streamBuffer = {
      reasoningChunks: [],
      finalChunks: [],
      lastUpdateTime: 0,
      updateInterval: 50, // 50毫秒更新一次UI，增加流畅感

      // 添加思考内容
      addReasoning(content) {
        this.reasoningChunks.push(content);
        this.flushIfNeeded();
      },

      // 添加答复内容
      addFinal(content) {
        this.finalChunks.push(content);
        this.flushIfNeeded();
      },

      // 检查并执行更新
      flushIfNeeded() {
        const now = Date.now();
        if (now - this.lastUpdateTime >= this.updateInterval) {
          this.flush();
        }
      },

      // 强制更新UI
      flush() {
        if (this.reasoningChunks.length > 0 || this.finalChunks.length > 0) {
          if (this.reasoningChunks.length > 0) {
            reasoningContent += this.reasoningChunks.join('');
            this.reasoningChunks = [];
          }
          
          if (this.finalChunks.length > 0) {
            finalContent += this.finalChunks.join('');
            this.finalChunks = [];
          }
          
          // 调用回调更新UI
          if (onStream) {
            onStream({
              reasoningContent,
              finalContent,
              isReasoningPhase
            });
          }
          
          this.lastUpdateTime = Date.now();
        }
      }
    };
    
    // 定期刷新缓冲区，确保没有内容被延迟
    const flushInterval = setInterval(() => {
      streamBuffer.flush();
    }, streamBuffer.updateInterval);
    
    // 如果提供了回调函数，使用流式处理
    if (onStream) {
      // 发送请求到DeepSeek API并获取流式响应
      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify(requestBody)
      });

      // 检查响应状态
      if (!response.ok) {
        clearInterval(flushInterval);
        const errorData = await response.json().catch(() => ({}));
        console.error('DeepSeek API错误:', errorData);
        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
      }

      // 获取reader以读取流数据
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        
        if (done) {
          // 流结束
          console.log('流式响应结束', { 
            reasoningContent: reasoningContent.length, 
            finalContent: finalContent.length,
            finalContentJSON: JSON.stringify(finalContent.substring(0, 100))
          });
          
          // 解耦：移除流结束时从思考内容提取结论的逻辑
          // 只发送最终确认更新
          if (finalContent.length > 0) {
            // 流结束时发送最终确认更新
            console.log('流结束，发送最终确认更新:', finalContent.substring(0, 50));
            // 确保最后一次更新被发送
            streamBuffer.flush();
          }
          clearInterval(flushInterval);
          break;
        }
        
        // 解码并处理当前块
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          // 跳过空行
          if (!line.trim() || !line.startsWith('data:')) continue;
          
          // 忽略心跳信息
          if (line === 'data: [DONE]') {
            console.log('收到 [DONE] 信号');
            continue;
          }
          
          // 提取JSON部分（去掉"data: "前缀）
          try {
            const jsonStr = line.substring(5);
            const json = JSON.parse(jsonStr);
            
            // 检查是否收到完整的消息对象
            if (json.choices && json.choices[0].message) {
              console.log('收到完整的消息对象:', json.choices[0].message);
              
              // 检查是否有完整的回答
              if (json.choices[0].message.content) {
                finalContent = json.choices[0].message.content;
                isReasoningPhase = false;
                streamBuffer.flush(); // 立即更新UI
              }
              
              // 检查是否有完整的思考过程
              if (json.choices[0].message.reasoning_content) {
                reasoningContent = json.choices[0].message.reasoning_content;
                streamBuffer.flush(); // 立即更新UI
              }
              continue;
            }
            
            // 检查是否有 delta.reasoning_content
            if (json.choices[0].delta.reasoning_content !== undefined) {
              // 获取delta值，如果是null则默认为空字符串
              const delta = json.choices[0].delta.reasoning_content || '';
              
              // 只有当delta有实际内容时才更新和流式输出
              if (delta.trim()) {
                isReasoningPhase = true; // 当前是思考阶段
                
                // 添加到缓冲区而不是直接拼接
                streamBuffer.addReasoning(delta);
                
                // 调试信息
                console.log('收到思考内容:', JSON.stringify(delta));
              } else {
                console.log('收到空的思考内容，不处理');
                
                // 即使思考内容为空，也要检查是否有答复内容
                if (json.choices[0].delta.content !== undefined) {
                  isReasoningPhase = false; // 切换到答复阶段
                  const contentDelta = json.choices[0].delta.content || '';
                  
                  // 添加到缓冲区
                  streamBuffer.addFinal(contentDelta);
                  
                  console.log('思考为空，但收到答复内容:', JSON.stringify(contentDelta));
                }
              }
            } 
            // 检查是否有 delta.content 或 delta.finish_reason 表示思考阶段结束
            else if (json.choices[0].delta.content !== undefined || 
                    (json.choices[0].finish_reason && !hasProcessedReasoning)) {
              
              // 如果有 finish_reason 并且还没有处理过思考结束信号
              if (json.choices[0].finish_reason && !hasProcessedReasoning) {
                hasProcessedReasoning = true;
                reasoningDone = true;
                console.log('思考阶段结束信号:', json.choices[0].finish_reason);
                
                // 标记阶段变化，不再自动生成finalContent
                isReasoningPhase = false;
                streamBuffer.flush(); // 立即更新UI
              }
              
              isReasoningPhase = false; // 已进入回答阶段
              const delta = json.choices[0].delta.content || '';
              
              // 添加到缓冲区
              streamBuffer.addFinal(delta);
              
              console.log('收到答复内容:', JSON.stringify(delta));
            }
            // 检查是否有其他指示思考阶段结束的信号
            else if (json.choices[0].delta && Object.keys(json.choices[0].delta).length === 0 && !reasoningDone) {
              reasoningDone = true;
              console.log('检测到空delta，可能表示思考阶段结束');
              
              // 如果我们已经有思考内容但没有最终内容，可能需要手动触发阶段转换
              if (reasoningContent.length > 0 && finalContent.length === 0) {
                isReasoningPhase = false;
                streamBuffer.flush(); // 立即更新UI
              }
            }
            // 打印整个响应对象，查看是否有其他字段
            else {
              console.log('收到其他类型的响应:', json);
            }
          } catch (e) {
            console.warn('解析流数据失败:', line, e);
          }
        }
      }

      // 返回完整内容
      return { reasoningContent, finalContent };
    } else {
      // 非流式模式，设置stream为false
      requestBody.stream = false;
      
      // 发送请求到DeepSeek API
      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify(requestBody)
      });

      // 检查响应状态
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('DeepSeek API错误:', errorData);
        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
      }

      // 解析响应数据
      const data = await response.json();
      
      // 返回AI生成的分析结果，包含思考和回答部分
      return {
        reasoningContent: data.choices[0].message.reasoning_content || '',
        finalContent: data.choices[0].message.content || ''
      };
    }
  } catch (error) {
    console.error('DeepSeek API 调用失败:', error);
    
    // 如果API调用失败，回退到本地模拟分析
    // 这样可以确保即使API不可用，功能仍然可用
    const fallbackResult = fallbackAnalysis(domain);
    return {
      reasoningContent: '无法连接DeepSeek API，使用本地分析。',
      finalContent: fallbackResult
    };
  }
}

/**
 * 本地域名分析（当API调用失败时使用）
 * @param {string} domain 要分析的域名
 * @returns {string} 分析结果
 */
function fallbackAnalysis(domain) {
  // 分析完整域名，可能包含前缀和.ai后缀
  const domainParts = domain.split('.');
  const extension = domainParts.length > 1 ? domainParts[domainParts.length - 1] : '';
  
  // 提取基本域名部分（排除.ai等TLD）
  let baseDomain = domain;
  if (domainParts.length > 1) {
    // 去掉TLD，得到主域名部分
    baseDomain = domainParts.slice(0, -1).join('.');
  }
  
  const domainType = baseDomain.includes('shop') || baseDomain.includes('store') ? '电商' : 
                    baseDomain.includes('tech') || baseDomain.includes('code') ? '技术' : 
                    baseDomain.includes('blog') ? '博客' : '通用';
  
  const lengthDescription = baseDomain.length < 6 ? '短而精简' : 
                          baseDomain.length < 12 ? '适中长度' : '较长';
  
  const hasDigits = /\d/.test(baseDomain);
  const digitDescription = hasDigits ? '包含数字，可能降低记忆性' : '不包含数字，易于记忆';
  
  const brandability = baseDomain.length < 8 && !hasDigits ? '很高' : 
                      baseDomain.length < 12 ? '一般' : '较低';
  
  // 顶级域名评估
  let tldValue = '';
  if (extension) {
    if (extension.toLowerCase() === 'ai') {
      tldValue = '顶级域名.ai在人工智能和技术领域有特殊意义，具有较高的行业价值';
    } else if (extension === 'com') {
      tldValue = '顶级域名.com具有最高的商业价值和认可度';
    } else if (['org', 'net', 'io'].includes(extension)) {
      tldValue = `顶级域名.${extension}具有良好的专业形象`;
    } else {
      tldValue = `顶级域名.${extension}较为小众，可能在特定领域有特殊意义`;
    }
  }
  
  return `域名分析（本地分析）：
- 完整域名: ${domain}
- 类型：${domainType}类域名
- 长度：${lengthDescription}（${baseDomain.length}个字符）
- ${digitDescription}
- 品牌价值：${brandability}
${tldValue ? '- ' + tldValue : ''}
- 建议用途：${domainType === '电商' ? '电子商务网站' : 
            domainType === '技术' ? '技术博客或产品' : 
            domainType === '博客' ? '内容创作平台' : '多用途网站'}

注：此为本地分析结果，DeepSeek API连接失败时显示。`;
} 