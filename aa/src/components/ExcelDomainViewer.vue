<template>
  <div class="excel-domain-viewer">
    <div class="page-header">
      <h1>Excel域名查看器</h1>
      <p class="subtitle">上传Excel文件，管理和过滤您的域名列表</p>
    </div>
    
    <div class="upload-section">
      <label class="upload-button">
        <i class="upload-icon">📄</i>
        <span>选择Excel文件</span>
        <input type="file" @change="handleFileUpload" accept=".xlsx, .xls" class="hidden-input" />
      </label>
      <button class="test-file-button" @click="loadTestFile">
        <i class="test-icon">🧪</i>
        <span>测试用Excel文件</span>
      </button>
      <span v-if="selectedFileName" class="file-name">已选择: {{ selectedFileName }}</span>
      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </div>
    
    <div v-if="domains.length" class="filter-section">
      <div class="input-group">
        <label>域名前缀</label>
        <textarea v-model="concatText" 
                  placeholder="输入要添加到域名前面的文字" 
                  class="auto-resize-textarea"
                  @input="autoResizeTextarea"
                  rows="3"></textarea>
      </div>
      
      <div class="input-group">
        <label>正则过滤</label>
        <div class="input-with-button">
          <input v-model="regexFilter" placeholder="输入正则表达式过滤域名" :class="{ 'error-input': regexError }" />
        </div>
        <span v-if="regexError" class="input-error">{{ regexError }}</span>
        <div class="regex-tips">
          <button class="test-data-button" @click="fillTestData">
            <i class="test-icon">📝</i>
            <span>填入测试数据</span>
          </button>
        </div>
      </div>
    </div>
    
    <div v-if="domains.length" class="domain-list">
      <div class="list-header">
        <h2>域名列表</h2> 
        <div class="list-actions">
          <button class="auto-analyze-button" 
                  @click="autoAnalyzeAll" 
                  :disabled="isAutoAnalyzing || filteredDomains.length === 0"
                  :class="{ 'analyzing': isAutoAnalyzing }">
            <span v-if="isAutoAnalyzing" class="spinner"></span>
            <span>{{ isAutoAnalyzing ? `自动分析中 (${currentAutoIndex + 1}/${filteredDomains.length})` : '自动发送给AI分析' }}</span>
          </button>
          <span class="domain-count">共 {{ filteredDomains.length }} 个结果</span>
        </div>
      </div>
      <transition-group name="list" tag="ul">
        <li v-for="(domain, index) in filteredDomains" 
            :key="domain + index" 
            :class="{ 'liked': likedDomains.has(domain) }">
          <div class="domain-header">
            <span class="domain">{{ domain }}</span>
            <div class="domain-actions">
              <button class="like-button" 
                      @click="toggleLike(domain)"
                      :class="{ 'liked': likedDomains.has(domain) }">
                <span class="like-icon">{{ likedDomains.has(domain) ? '❤️' : '🤍' }}</span>
              </button>
              <button class="ai-analyze-button" 
                      @click="analyzeWithAI(domain)" 
                      :disabled="isAnalyzing[domain]"
                      :class="{ 'analyzing': isAnalyzing[domain] }">
                <span v-if="isAnalyzing[domain]" class="spinner"></span>
                <span>{{ isAnalyzing[domain] ? '分析中...' : '发送给AI分析' }}</span>
              </button>
            </div>
          </div>
          <div v-if="concatText" class="concat-result">
            <span class="concat-domain">{{ concatText + domain + '.ai'}}</span>
          </div>
          
          <!-- 直接显示思考和答复两个框，不使用AI分析结果外层容器 -->
          <div v-if="aiResults[domain]" class="dual-panel-container">
            <!-- 思考框 - 只显示思考内容 -->
            <div class="panel thinking-panel">
              <div class="panel-header">
                <h4>思考</h4>
                <div class="panel-actions">
                  <button class="copy-button-small" 
                          @click="copyToClipboard(aiReasoning[domain] || '')" 
                          title="复制思考内容">
                    <span>📋</span>
                  </button>
                </div>
              </div>
              <div class="panel-content" :class="{ 'streaming': isAnalyzing[domain] }">
                <div v-if="isAnalyzing[domain] && !aiReasoning[domain]" class="loading-indicator">AI正在思考...</div>
                <div v-else-if="aiReasoning[domain]" v-html="renderedReasoning[domain] || renderMarkdown(aiReasoning[domain])"></div>
                <div v-else class="empty-content">
                  <span class="no-content-icon">📝</span>
                  <span>暂无思考内容</span>
                </div>
              </div>
            </div>
            
            <!-- 答复框 - 只显示答复内容 -->
            <div class="panel answer-panel">
              <div class="panel-header">
                <h4>答复</h4>
                <button class="copy-button-small" 
                        @click="copyToClipboard(aiFinalAnswer[domain] || '')" 
                        title="复制答复内容">
                  <span>📋</span>
                </button>
              </div>
              <div class="panel-content" :class="{ 'streaming': isAnalyzing[domain] }">
                <div v-if="isAnalyzing[domain] && !aiFinalAnswer[domain]" class="loading-indicator">等待AI答复...</div>
                <div v-else-if="aiFinalAnswer[domain]" v-html="renderedAnswer[domain] || renderMarkdown(aiFinalAnswer[domain])"></div>
                <div v-else class="empty-content">
                  <span class="no-content-icon">💬</span>
                  <span>暂无答复内容</span>
                </div>
              </div>
            </div>
          </div>
        </li>
      </transition-group>
    </div>
    
    <div v-else-if="fileUploaded" class="no-domains">
      <p>未在Excel文件中找到域名</p>
    </div>
    
    <div v-if="showCopyToast" class="copy-toast">
      <span>复制成功</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import * as XLSX from 'xlsx';
import { analyzeDomain } from '../services/deepseekService';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// 导入测试文件
import testFileUrl from '../assets/aaa_zzz.xlsx?url';

const domains = ref([]);
const regexFilter = ref('');
const concatText = ref('');
const errorMessage = ref('');
const fileUploaded = ref(false);
const selectedFileName = ref('');
const regexError = ref('');
const showCopyToast = ref(false);
const likedDomains = ref(new Set());
const aiResults = ref({});
const isAnalyzing = ref({});

// 存储原始和渲染后的 Markdown 内容
const renderedMarkdown = ref({});
const renderedReasoning = ref({}); // 渲染后的思考过程
const renderedAnswer = ref({}); // 渲染后的最终结果

// 分别存储思考部分和回答部分
const aiReasoning = ref({});
const aiFinalAnswer = ref({});

// 自动分析相关状态
const isAutoAnalyzing = ref(false);
const currentAutoIndex = ref(0);

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// 用于渲染 Markdown 的防抖函数
const debouncedRenderMarkdown = debounce((domain) => {
  if (!aiResults.value[domain]) {
    renderedMarkdown.value[domain] = '';
    return;
  }
  const rawHtml = marked(aiResults.value[domain]);
  renderedMarkdown.value[domain] = DOMPurify.sanitize(rawHtml);
}, 150); // 150ms 的防抖时间

// 用于渲染思考过程的防抖函数
const debouncedRenderReasoning = debounce((domain) => {
  if (!aiReasoning.value[domain]) {
    renderedReasoning.value[domain] = '';
    return;
  }
  const rawHtml = marked(aiReasoning.value[domain]);
  renderedReasoning.value[domain] = DOMPurify.sanitize(rawHtml);
}, 150);

// 用于渲染最终结果的防抖函数
const debouncedRenderAnswer = debounce((domain) => {
  if (!aiFinalAnswer.value[domain]) {
    renderedAnswer.value[domain] = '';
    return;
  }
  const rawHtml = marked(aiFinalAnswer.value[domain]);
  renderedAnswer.value[domain] = DOMPurify.sanitize(rawHtml);
}, 150);

// 监听变化，并使用防抖来更新渲染结果
watch(aiResults, (newResults) => {
  for (const domain in newResults) {
    if (newResults[domain]) {
      debouncedRenderMarkdown(domain);
    }
  }
}, { deep: true });

watch(aiReasoning, (newReasoning) => {
  for (const domain in newReasoning) {
    if (newReasoning[domain]) {
      debouncedRenderReasoning(domain);
    }
  }
}, { deep: true });

watch(aiFinalAnswer, (newAnswer) => {
  for (const domain in newAnswer) {
    if (newAnswer[domain]) {
      debouncedRenderAnswer(domain);
    }
  }
}, { deep: true });

const filteredDomains = computed(() => {
  if (!regexFilter.value.trim()) {
    regexError.value = '';
    return domains.value;
  }
  
  try {
    const regex = new RegExp(regexFilter.value);
    regexError.value = '';
    return domains.value.filter(domain => regex.test(domain));
  } catch (error) {
    regexError.value = '正则表达式语法错误';
    return domains.value;
  }
});

const handleFileUpload = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  
  fileUploaded.value = true;
  errorMessage.value = '';
  selectedFileName.value = file.name;
  
  const reader = new FileReader();
  
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      
      // 假设我们使用第一个工作表
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // 将工作表转换为JSON对象
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      // 获取第一列作为域名列表（跳过标题行）
      const extractedDomains = jsonData
        .filter(row => row.length > 0)
        .map(row => row[0])
        .filter(value => value && typeof value === 'string');
      
      if (extractedDomains.length > 0) {
        domains.value = extractedDomains;
      } else {
        errorMessage.value = '在Excel文件中未找到域名数据';
      }
    } catch (error) {
      errorMessage.value = '处理Excel文件时出错: ' + error.message;
      domains.value = [];
    }
  };
  
  reader.onerror = () => {
    errorMessage.value = '读取文件时出错';
    domains.value = [];
  };
  
  reader.readAsArrayBuffer(file);
};

const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text)
    .then(() => {
      showCopyToast.value = true;
      setTimeout(() => {
        showCopyToast.value = false;
      }, 2000);
    })
    .catch(err => {
      console.error('复制失败: ', err);
    });
};

const toggleLike = (domain) => {
  if (likedDomains.value.has(domain)) {
    likedDomains.value.delete(domain);
  } else {
    likedDomains.value.add(domain);
  }
};

const analyzeWithAI = async (domain) => {
  // 标记为正在分析
  isAnalyzing.value[domain] = true;
  aiResults.value[domain] = true; // 只用于标记显示结果区域
  aiReasoning.value[domain] = ''; // 清空思考内容
  aiFinalAnswer.value[domain] = ''; // 清空答复内容
  renderedReasoning.value[domain] = ''; // 清空已渲染的思考内容
  renderedAnswer.value[domain] = ''; // 清空已渲染的答复内容
  
  try {
    // 构建完整域名字符串: 前缀 + 域名 + '.ai'
    const fullDomain = concatText.value + domain + '.ai';
    
    // 使用完整域名调用DeepSeek API，并传入流式更新回调
    await analyzeDomain(
      fullDomain, 
      (streamData) => {
        console.log('收到流式数据:', 
                    '思考内容长度:', streamData.reasoningContent?.length || 0,
                    '答复内容长度:', streamData.finalContent?.length || 0);
        
        // 如果有思考内容，直接更新思考框
        if (streamData.reasoningContent) {
          aiReasoning.value[domain] = streamData.reasoningContent;
          // 触发渲染
          debouncedRenderReasoning(domain);
        }
        
        // 如果有答复内容，直接更新答复框并添加详细日志
        if (streamData.finalContent) {
          console.log(`收到答复 [${domain}]:`, 
                      '长度:', streamData.finalContent.length, 
                      '内容片段:', JSON.stringify(streamData.finalContent.substring(0, 30)));
          
          aiFinalAnswer.value[domain] = streamData.finalContent;
          // 触发渲染
          debouncedRenderAnswer(domain);
          
          // 添加额外检查，确保内容被正确渲染
          setTimeout(() => {
            console.log('答复框状态:', 
                        '内容长度:', aiFinalAnswer.value[domain].length,
                        '渲染状态:', renderedAnswer.value[domain] ? '已渲染' : '未渲染');
          }, 300);
        }
      }
    );
  } catch (error) {
    console.error('AI分析请求失败:', error);
    aiReasoning.value[domain] = '分析请求失败，请稍后再试。';
    aiFinalAnswer.value[domain] = '分析请求失败，请稍后再试。';
  } finally {
    // 无论成功与否，都要取消"分析中"状态
    isAnalyzing.value[domain] = false;
  }
};

// 将 markdown 转换为 HTML 并净化 - 用于非流式响应
const renderMarkdown = (text) => {
  if (!text) return '';
  const rawHtml = marked(text);
  return DOMPurify.sanitize(rawHtml);
};

const generateSummary = (domain) => {
  const reasoning = aiReasoning.value[domain] || '';
  
  // 如果思考内容为空，返回默认消息
  if (!reasoning.trim()) {
    return "无法从空白思考过程生成总结。";
  }
  
  // 从思考过程中提取关键部分
  let summary = "";
  
  // 策略1: 提取最后几个段落作为总结
  const paragraphs = reasoning.split('\n\n').filter(p => p.trim());
  if (paragraphs.length > 0) {
    // 取最后1-3段，具体取决于段落长度
    const lastParagraphs = paragraphs.slice(Math.max(0, paragraphs.length - 3));
    
    // 寻找包含"总结"、"综上"、"因此"、"结论"等关键词的段落
    const conclusionParagraphs = lastParagraphs.filter(p => 
      p.includes("总结") || p.includes("综上") || p.includes("因此") || 
      p.includes("所以") || p.includes("结论") || p.includes("建议") ||
      p.includes("总的来说") || p.includes("总体而言")
    );
    
    if (conclusionParagraphs.length > 0) {
      summary = conclusionParagraphs.join('\n\n');
    } else {
      // 如果没有明确的结论，使用最后1-2段
      summary = lastParagraphs.join('\n\n');
    }
  }
  
  // 策略2: 如果没有找到好的段落，则提取带编号的要点
  if (!summary) {
    const bulletPoints = reasoning.match(/[*-]\s+.+?(?=\n|$)|[0-9]+\.\s+.+?(?=\n|$)/g) || [];
    if (bulletPoints.length > 0) {
      summary = bulletPoints.join('\n');
    }
  }
  
  // 策略3: 如果仍然没有找到好的总结，提取最后300个字符
  if (!summary) {
    summary = reasoning.substring(Math.max(0, reasoning.length - 300));
  }
  
  // 添加前缀提示这是自动生成的总结
  return `## 自动生成的域名分析总结\n\n${summary}\n\n*注: 此总结是从思考过程中自动提取的，可能不完整。您可以切换到"思考过程"查看完整分析。*`;
};

const fillTestData = () => {
  concatText.value = `你是个域名领域的专家，能从各方面分析域名的价值。现在我给你3个字母长度的.ai后缀的域名，从以下几个方面帮我分析。1.现在你是一个研究英语、拉丁语、北欧语的专家，请问这三个字母能否作为贴近游戏元宇宙西方神话AI概念英文缩写，如果能，请告诉我，并写上对应的中文翻译；2.现在你是一个研究英语、拉丁语、北欧语的专家，单看这三个字母能联想到什么，这三个字母能不能连读、发音是否好听、是否好记，能否发散联想到贴近游戏元宇宙西方神话AI这些概念，发音"音译"成汉字告诉我，不要用音标；3.现在你是一个研究汉语的专家，请问这三个字母的中文发音是否好听、是否好记，能不能发散联想到贴近游戏元宇宙东方神话AI这些概念的拼音谐音。另外，不要从.ai后缀或域名长度分析。现在请帮我分析`;
  regexFilter.value = "^(?=.*[aeiou])(?!.*[jqgz])[a-zA-Z]+$";
};

// 添加自适应文本框高度的方法
const autoResizeTextarea = (e) => {
  const textarea = e.target;
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
};

// 在组件挂载后初始化文本框高度
const initTextareaHeight = () => {
  const textareas = document.querySelectorAll('.auto-resize-textarea');
  textareas.forEach(textarea => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });
};

// 在nextTick时初始化文本框高度
watch(concatText, () => {
  nextTick(initTextareaHeight);
});

const loadTestFile = async () => {
  try {
    // 清除错误信息
    errorMessage.value = '';
    
    // 设置文件名
    selectedFileName.value = 'aaa_zzz.xlsx';
    fileUploaded.value = true;
    
    // 获取文件内容
    const response = await fetch(testFileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    // 解析Excel
    const workbook = XLSX.read(data, { type: 'array' });
    
    // 假设我们使用第一个工作表
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // 将工作表转换为JSON对象
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // 获取第一列作为域名列表（跳过标题行）
    const extractedDomains = jsonData
      .filter(row => row.length > 0)
      .map(row => row[0])
      .filter(value => value && typeof value === 'string');
    
    if (extractedDomains.length > 0) {
      domains.value = extractedDomains;
    } else {
      errorMessage.value = '在测试Excel文件中未找到域名数据';
    }
  } catch (error) {
    console.error('处理测试Excel文件时出错:', error);
    errorMessage.value = '处理测试Excel文件时出错: ' + error.message;
    domains.value = [];
  }
};

// 自动逐个分析所有域名
const autoAnalyzeAll = async () => {
  if (isAutoAnalyzing.value || filteredDomains.value.length === 0) return;
  
  try {
    isAutoAnalyzing.value = true;
    currentAutoIndex.value = 0;
    
    // 开始递归分析
    await analyzeNext();
  } catch (error) {
    console.error('自动分析过程中出错:', error);
  } finally {
    isAutoAnalyzing.value = false;
  }
};

// 递归分析下一个域名
const analyzeNext = async () => {
  // 检查是否已经完成所有分析
  if (currentAutoIndex.value >= filteredDomains.value.length) {
    isAutoAnalyzing.value = false;
    return;
  }
  
  const domain = filteredDomains.value[currentAutoIndex.value];
  
  // 标记为正在分析
  isAnalyzing.value[domain] = true;
  aiResults.value[domain] = true; // 只用于标记显示结果区域
  aiReasoning.value[domain] = ''; // 清空思考内容
  aiFinalAnswer.value[domain] = ''; // 清空答复内容
  renderedReasoning.value[domain] = ''; // 清空已渲染的思考内容
  renderedAnswer.value[domain] = ''; // 清空已渲染的答复内容
  
  try {
    // 构建完整域名字符串: 前缀 + 域名 + '.ai'
    const fullDomain = concatText.value + domain + '.ai';
    
    // 创建一个Promise来处理分析完成
    const analysisPromise = new Promise((resolve, reject) => {
      let isCompleted = false;
      
      // 使用完整域名调用DeepSeek API，并传入流式更新回调
      analyzeDomain(
        fullDomain, 
        (streamData) => {
          // 如果有思考内容，直接更新思考框
          if (streamData.reasoningContent) {
            aiReasoning.value[domain] = streamData.reasoningContent;
            // 触发渲染
            debouncedRenderReasoning(domain);
          }
          
          // 如果有答复内容，直接更新答复框
          if (streamData.finalContent) {
            aiFinalAnswer.value[domain] = streamData.finalContent;
            // 触发渲染
            debouncedRenderAnswer(domain);
          }
          
          // 检查是否已完成并且还未调用resolve
          if (streamData.isComplete && !isCompleted) {
            isCompleted = true;
            // 延迟一下确保UI更新完成
            setTimeout(() => {
              isAnalyzing.value[domain] = false;
              resolve();
            }, 500);
          }
        }
      ).catch(error => {
        console.error(`分析域名 ${domain} 时出错:`, error);
        isAnalyzing.value[domain] = false;
        reject(error);
      });
      
      // 设置超时，防止API没有返回isComplete
      setTimeout(() => {
        if (!isCompleted) {
          isCompleted = true;
          isAnalyzing.value[domain] = false;
          resolve();
        }
      }, 60000); // 60秒超时
    });
    
    // 等待当前分析完成
    await analysisPromise;
    
    // 移动到下一个
    currentAutoIndex.value++;
    
    // 继续分析下一个
    await analyzeNext();
  } catch (error) {
    console.error(`分析域名 ${domain} 时出错:`, error);
    isAnalyzing.value[domain] = false;
    
    // 尽管出错，仍继续分析下一个
    currentAutoIndex.value++;
    await analyzeNext();
  }
};
</script>

<style scoped>
.excel-domain-viewer {
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 30px;
  box-sizing: border-box;
  background-color: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border-radius: 0;
  box-shadow: none;
}

.page-header {
  text-align: center;
  margin-bottom: 50px;
  position: relative;
}

.page-header::after {
  content: "";
  position: absolute;
  bottom: -15px;
  left: 50%;
  transform: translateX(-50%);
  width: 60px;
  height: 3px;
  background: linear-gradient(90deg, #42b983, #3498db);
  border-radius: 3px;
}

h1 {
  text-align: center;
  margin-bottom: 15px;
  color: #2c3e50;
  font-size: 36px;
  font-weight: 600;
  letter-spacing: -0.5px;
}

.subtitle {
  color: #6c7a89;
  margin: 0;
  font-size: 16px;
  font-weight: 400;
}

.upload-section {
  margin-bottom: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30px;
  background-color: rgba(255, 255, 255, 0.5);
  border-radius: 12px;
  backdrop-filter: blur(5px);
  border: 1px solid rgba(231, 231, 231, 0.5);
  transition: all 0.3s ease;
}

.upload-section:hover {
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.05);
  transform: translateY(-2px);
}

.upload-button {
  display: inline-flex;
  align-items: center;
  padding: 14px 28px;
  background: linear-gradient(135deg, #42b983 0%, #3aa876 100%);
  color: white;
  border-radius: 30px;
  cursor: pointer;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.5px;
  transition: all 0.3s;
  box-shadow: 0 4px 12px rgba(66, 185, 131, 0.2);
  border: none;
}

.upload-button:hover {
  background: linear-gradient(135deg, #3aa876 0%, #2d9165 100%);
  box-shadow: 0 6px 15px rgba(66, 185, 131, 0.3);
  transform: translateY(-2px);
}

.upload-icon {
  margin-right: 10px;
  font-size: 18px;
  opacity: 0.9;
}

.hidden-input {
  display: none;
}

.file-name {
  margin-top: 12px;
  color: #5c6bc0;
  font-weight: 500;
  padding: 8px 16px;
  background-color: rgba(92, 107, 192, 0.1);
  border-radius: 20px;
  font-size: 14px;
}

.error-message {
  color: #e53935;
  margin-top: 10px;
  font-weight: 500;
  padding: 10px 15px;
  background-color: rgba(229, 57, 53, 0.1);
  border-radius: 8px;
}

.filter-section {
  margin-bottom: 35px;
  display: flex;
  flex-direction: column;
  gap: 25px;
  background-color: rgba(255, 255, 255, 0.7);
  padding: 25px;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  backdrop-filter: blur(5px);
  border: 1px solid rgba(231, 231, 231, 0.5);
}

.input-group {
  display: flex;
  flex-direction: column;
}

.input-group label {
  margin-bottom: 10px;
  font-weight: 600;
  color: #3c4858;
  font-size: 15px;
}

.input-group input {
  padding: 14px 16px;
  border: 1px solid rgba(220, 220, 220, 0.7);
  border-radius: 12px;
  font-size: 15px;
  transition: all 0.3s;
  background-color: rgba(255, 255, 255, 0.6);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.01);
}

.input-group input:focus {
  border-color: #42b983;
  outline: none;
  box-shadow: 0 0 0 3px rgba(66, 185, 131, 0.15);
  background-color: rgba(255, 255, 255, 0.9);
}

.error-input {
  border-color: #e53935 !important;
  box-shadow: 0 0 0 2px rgba(229, 57, 53, 0.15) !important;
}

.input-error {
  color: #e53935;
  font-size: 13px;
  margin-top: 6px;
  font-weight: 500;
}

.domain-list {
  background-color: rgba(251, 251, 251, 0.7);
  padding: 25px;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  backdrop-filter: blur(5px);
  border: 1px solid rgba(231, 231, 231, 0.5);
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 25px;
  border-bottom: 2px solid rgba(224, 224, 224, 0.5);
  padding-bottom: 15px;
}

.domain-list h2 {
  margin: 0;
  font-size: 22px;
  color: #2c3e50;
  font-weight: 600;
}

.domain-count {
  background-color: #42b983;
  color: white;
  padding: 7px 14px;
  border-radius: 30px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.3px;
  box-shadow: 0 2px 5px rgba(66, 185, 131, 0.2);
}

.domain-list ul {
  padding-left: 0;
  margin: 0;
  list-style-type: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 20px;
}

.domain-list li {
  margin-bottom: 0;
  padding: 20px;
  background-color: rgba(255, 255, 255, 0.7);
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  transition: all 0.3s ease;
  border: 1px solid rgba(231, 231, 231, 0.5);
  backdrop-filter: blur(5px);
  animation: fadeIn 0.5s ease-out;
}

.domain-list li:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  background-color: rgba(255, 255, 255, 0.9);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(15px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 列表动画 */
.list-enter-active, .list-leave-active {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
.list-enter-from, .list-leave-to {
  opacity: 0;
  transform: translateY(30px);
}

.domain {
  font-weight: 600;
  font-size: 18px;
  display: block;
  margin-bottom: 12px;
  color: #2c3e50;
  letter-spacing: 0.3px;
}

.concat-result {
  color: #555;
  background-color: rgba(245, 245, 245, 0.7);
  padding: 14px 16px;
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  border-left: 3px solid #42b983;
  margin-top: 16px;
  backdrop-filter: blur(4px);
}

.concat-domain {
  color: #42b983;
  font-weight: 600;
  word-break: break-all;
  font-size: 12px;
}

.copy-button {
  background: linear-gradient(135deg, #3c4b64 0%, #2c3e50 100%);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  transition: all 0.3s;
  white-space: nowrap;
  font-weight: 500;
  font-size: 14px;
}

.copy-button:hover {
  background: linear-gradient(135deg, #2c3e50 0%, #1e2b3a 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.copy-icon {
  font-size: 15px;
}

.domain-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.domain-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.like-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  font-size: 20px;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  opacity: 0.7;
  border-radius: 50%;
}

.like-button:hover {
  transform: scale(1.2);
  opacity: 1;
  background-color: rgba(255, 107, 107, 0.1);
}

.like-button.liked {
  opacity: 1;
}

.domain-list li.liked {
  background: linear-gradient(135deg, rgba(255, 248, 248, 0.8) 0%, rgba(255, 255, 255, 0.8) 100%);
  border-left: 4px solid #ff6b6b;
  transform: translateX(2px);
}

.domain-list li.liked .domain {
  color: #ff6b6b;
}

.domain-list li.liked .concat-result {
  border-left-color: #ff6b6b;
}

@keyframes likeAnimation {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.like-button.liked {
  animation: likeAnimation 0.3s ease-in-out;
}

.ai-analyze-button {
  background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
  color: white;
  border: none;
  border-radius: 30px;
  padding: 9px 18px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 12px;
  box-shadow: 0 2px 8px rgba(52, 152, 219, 0.25);
}

.ai-analyze-button:hover {
  background: linear-gradient(135deg, #2980b9 0%, #206592 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.35);
}

.ai-analyze-button:disabled {
  background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.ai-analyze-button.analyzing {
  background: linear-gradient(135deg, #34495e 0%, #2c3e50 100%);
}

.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: 50%;
  border-top-color: #fff;
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.ai-result {
  margin-top: 20px;
  padding: 20px;
  background-color: rgba(240, 247, 255, 0.7);
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  backdrop-filter: blur(5px);
  border: 1px solid rgba(231, 231, 231, 0.5);
  transition: all 0.3s ease;
}

.ai-result:hover {
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
}

.ai-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(224, 224, 224, 0.4);
  padding-bottom: 12px;
}

.ai-result-actions {
  display: flex;
  gap: 8px;
}

.ai-result h3 {
  margin: 0;
  color: #3498db;
  font-size: 17px;
  font-weight: 600;
}

.dual-panel-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 20px;
}

.panel {
  flex: 1;
  background-color: rgba(255, 255, 255, 0.7);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
  padding: 20px;
  min-height: 150px;
  transition: all 0.3s;
  backdrop-filter: blur(5px);
  border: 1px solid rgba(231, 231, 231, 0.5);
}

.panel:hover {
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
  background-color: rgba(255, 255, 255, 0.8);
}

.thinking-panel {
  border-left: 4px solid #34495e;
}

.thinking-panel .panel-content {
  font-size: 12px; /* 思考框内字体更小 */
  color: #444;
}

.answer-panel {
  border-left: 4px solid #2ecc71;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(238, 238, 238, 0.7);
}

.panel-header h4 {
  margin: 0;
  font-size: 16px;
  color: #2c3e50;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.panel-content {
  margin: 0;
  color: #333;
  font-size: 14px;
  line-height: 1.7;
  /* 移除垂直滚动条 */
  overflow-y: visible;
  overflow-x: auto;
  padding-right: 0;
}

/* 移除滚动条相关样式 */
.panel-content::-webkit-scrollbar {
  width: 0;
  height: 4px;
}

.panel-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.panel-content::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 4px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: #999;
}

.loading-indicator {
  text-align: center;
  color: #777;
  font-style: italic;
  padding: 30px 0;
  font-weight: 500;
}

.loading-indicator:after {
  content: '...';
  display: inline-block;
  animation: ellipsis 1.5s infinite;
  width: 1.5em;
  text-align: left;
}

.empty-content {
  text-align: center;
  color: #888;
  font-style: italic;
  padding: 40px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.no-content-icon {
  font-size: 28px;
  opacity: 0.6;
  margin-bottom: 8px;
}

.copy-button-small {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  transition: all 0.3s;
  border-radius: 6px;
}

.copy-button-small:hover {
  opacity: 1;
  transform: scale(1.1);
  background-color: rgba(0, 0, 0, 0.05);
}

/* 流式更新动画 */
.panel-content.streaming::after {
  content: '|';
  display: inline-block;
  color: #3498db;
  animation: blink 1s step-end infinite;
  margin-left: 2px;
  font-weight: bold;
}

.test-data-button {
  display: inline-flex;
  align-items: center;
  padding: 12px 24px;
  background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
  color: white;
  border-radius: 30px;
  cursor: pointer;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.5px;
  transition: all 0.3s;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.2);
  border: none;
}

.test-data-button:hover {
  background: linear-gradient(135deg, #2980b9 0%, #206592 100%);
  box-shadow: 0 6px 15px rgba(52, 152, 219, 0.3);
  transform: translateY(-2px);
}

.test-icon {
  margin-right: 10px;
  font-size: 18px;
  opacity: 0.9;
}

.no-domains {
  text-align: center;
  margin-top: 30px;
  color: #777;
  padding: 30px;
  background-color: rgba(245, 245, 245, 0.7);
  border-radius: 12px;
  font-size: 16px;
  font-weight: 500;
  backdrop-filter: blur(5px);
  border: 1px solid rgba(231, 231, 231, 0.5);
}

.input-with-button {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
}

.input-with-button input {
  flex: 1;
}

.regex-tips {
  margin-top: 10px;
  color: #777;
}

.copy-toast {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(52, 73, 94, 0.9);
  color: white;
  padding: 12px 25px;
  border-radius: 30px;
  z-index: 1000;
  animation: fadeInOut 2s ease;
  backdrop-filter: blur(5px);
  font-weight: 500;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

@keyframes fadeInOut {
  0% { opacity: 0; transform: translate(-50%, 20px); }
  20% { opacity: 1; transform: translate(-50%, 0); }
  80% { opacity: 1; transform: translate(-50%, 0); }
  100% { opacity: 0; transform: translate(-50%, 0); }
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: rgba(245, 245, 245, 0.1);
  border-radius: 10px;
}

::-webkit-scrollbar-thumb {
  background: rgba(189, 195, 199, 0.5);
  border-radius: 10px;
  transition: all 0.3s;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(149, 165, 166, 0.7);
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.auto-resize-textarea {
  padding: 14px 16px;
  border: 1px solid rgba(220, 220, 220, 0.7);
  border-radius: 12px;
  font-size: 15px;
  transition: all 0.3s;
  background-color: rgba(255, 255, 255, 0.6);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.01);
  min-height: 100px;
  resize: none;
  overflow: hidden;
  width: 100%;
  line-height: 1.5;
  font-family: inherit;
}

.auto-resize-textarea:focus {
  border-color: #42b983;
  outline: none;
  box-shadow: 0 0 0 3px rgba(66, 185, 131, 0.15);
  background-color: rgba(255, 255, 255, 0.9);
}

.thinking-panel .panel-content,
.answer-panel .panel-content {
  font-size: 12px; /* 所有面板内字体统一大小 */
  color: #444;
}

.test-file-button {
  display: inline-flex;
  align-items: center;
  padding: 12px 24px;
  background: linear-gradient(135deg, #8e44ad 0%, #7d3c98 100%);
  color: white;
  border-radius: 30px;
  cursor: pointer;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.5px;
  transition: all 0.3s;
  box-shadow: 0 4px 12px rgba(142, 68, 173, 0.2);
  border: none;
  margin-top: 16px;
}

.test-file-button:hover {
  background: linear-gradient(135deg, #7d3c98 0%, #6c3483 100%);
  box-shadow: 0 6px 15px rgba(142, 68, 173, 0.3);
  transform: translateY(-2px);
}

.copy-ai-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 7px;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  transition: all 0.3s;
  border-radius: 6px;
}

.copy-ai-button:hover {
  opacity: 1;
  transform: scale(1.1);
  background-color: rgba(0, 0, 0, 0.05);
}

.list-actions {
  display: flex;
  align-items: center;
  gap: 15px;
}

.auto-analyze-button {
  background: linear-gradient(135deg, #ff7f50 0%, #e74c3c 100%);
  color: white;
  border: none;
  border-radius: 30px;
  padding: 9px 18px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 12px;
  box-shadow: 0 2px 8px rgba(231, 76, 60, 0.25);
  white-space: nowrap;
}

.auto-analyze-button:hover {
  background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(231, 76, 60, 0.35);
}

.auto-analyze-button:disabled {
  background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.auto-analyze-button.analyzing {
  background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { opacity: 0.8; }
  50% { opacity: 1; }
  100% { opacity: 0.8; }
}
</style> 