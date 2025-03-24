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
      <span v-if="selectedFileName" class="file-name">已选择: {{ selectedFileName }}</span>
      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </div>
    
    <div v-if="domains.length" class="filter-section">
      <div class="input-group">
        <label>域名前缀</label>
        <input v-model="concatText" placeholder="输入要添加到域名前面的文字" />
      </div>
      
      <div class="input-group">
        <label>正则过滤</label>
        <div class="input-with-button">
          <input v-model="regexFilter" placeholder="输入正则表达式过滤域名" :class="{ 'error-input': regexError }" />
          <div class="dropdown">
            <button class="example-button">示例 ▼</button>
            <div class="dropdown-content">
              <a href="#" @click.prevent="setRegex('^[^jagzJAGZ]*$')">不含字母j、z、a和g</a>
              <a href="#" @click.prevent="setRegex('^[a-zA-Z0-9]*$')">只含字母和数字</a>
              <a href="#" @click.prevent="setRegex('^\\w+\\.com$')">以.com结尾</a>
              <a href="#" @click.prevent="setRegex('^((?!test).)*$')">不含"test"</a>
              <a href="#" @click.prevent="setRegex('^\\d')">以数字开头</a>
            </div>
          </div>
        </div>
        <span v-if="regexError" class="input-error">{{ regexError }}</span>
        <div class="regex-tips">
          <small>提示：使用正则表达式过滤域名，例如 ^[^jagzJAGZ]*$ 匹配不含j、z、a和g的域名</small>
        </div>
      </div>
    </div>
    
    <div v-if="domains.length" class="domain-list">
      <div class="list-header">
        <h2>域名列表</h2> 
        <span class="domain-count">共 {{ filteredDomains.length }} 个结果</span>
      </div>
      <transition-group name="list" tag="ul">
        <li v-for="(domain, index) in filteredDomains" 
            :key="domain + index" 
            :class="{ 'liked': likedDomains.has(domain) }">
          <div class="domain-header">
            <span class="domain">{{ domain }}</span>
            <button class="like-button" 
                    @click="toggleLike(domain)"
                    :class="{ 'liked': likedDomains.has(domain) }">
              <span class="like-icon">{{ likedDomains.has(domain) ? '❤️' : '🤍' }}</span>
            </button>
          </div>
          <div v-if="concatText" class="concat-result">
            <span class="concat-domain">{{ concatText + domain }}</span>
            <button class="copy-button" @click="copyToClipboard(concatText + domain)">
              <span class="copy-icon">📋</span>
              <span class="copy-text">复制</span>
            </button>
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
import { ref, computed } from 'vue';
import * as XLSX from 'xlsx';

const domains = ref([]);
const regexFilter = ref('');
const concatText = ref('');
const errorMessage = ref('');
const fileUploaded = ref(false);
const selectedFileName = ref('');
const regexError = ref('');
const showCopyToast = ref(false);
const likedDomains = ref(new Set());

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

const setRegex = (regex) => {
  regexFilter.value = regex;
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
</script>

<style scoped>
.excel-domain-viewer {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .excel-domain-viewer {
    padding: 15px;
  }
  
  h1 {
    font-size: 24px;
  }
}

.page-header {
  text-align: center;
  margin-bottom: 40px;
}

h1 {
  text-align: center;
  margin-bottom: 10px;
  color: #2c3e50;
  font-size: 32px;
}

.subtitle {
  color: #666;
  margin: 0;
  font-size: 16px;
}

.upload-section {
  margin-bottom: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.upload-button {
  display: inline-flex;
  align-items: center;
  padding: 12px 24px;
  background-color: #42b983;
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s;
  box-shadow: 0 2px 6px rgba(66, 185, 131, 0.3);
}

.upload-button:hover {
  background-color: #3aa876;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(66, 185, 131, 0.4);
}

.upload-icon {
  margin-right: 8px;
  font-size: 18px;
}

.hidden-input {
  display: none;
}

.file-name {
  margin-top: 10px;
  color: #666;
}

.error-message {
  color: red;
  margin-top: 5px;
}

.filter-section {
  margin-bottom: 30px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background-color: white;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.input-group {
  display: flex;
  flex-direction: column;
}

.input-group label {
  margin-bottom: 8px;
  font-weight: bold;
  color: #2c3e50;
}

.input-group input {
  padding: 12px;
  border: 2px solid #ddd;
  border-radius: 6px;
  font-size: 16px;
  transition: border-color 0.3s;
}

.input-group input:focus {
  border-color: #42b983;
  outline: none;
}

.error-input {
  border-color: #f56c6c !important;
}

.input-error {
  color: #f56c6c;
  font-size: 12px;
  margin-top: 5px;
}

.domain-list {
  background-color: #f9f9f9;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  border-bottom: 2px solid #e0e0e0;
  padding-bottom: 10px;
}

.domain-list h2 {
  margin: 0;
  font-size: 22px;
  color: #2c3e50;
}

.domain-count {
  background-color: #42b983;
  color: white;
  padding: 5px 10px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: bold;
}

.domain-list ul {
  padding-left: 0;
  margin: 0;
  list-style-type: none;
}

.domain-list li {
  margin-bottom: 15px;
  padding: 15px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
  transition: transform 0.2s, box-shadow 0.2s;
  animation: fadeIn 0.5s ease-out;
}

.domain-list li:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 列表动画 */
.list-enter-active, .list-leave-active {
  transition: all 0.5s ease;
}
.list-enter-from, .list-leave-to {
  opacity: 0;
  transform: translateY(30px);
}

.domain {
  font-weight: bold;
  font-size: 18px;
  display: block;
  margin-bottom: 10px;
  color: #1a1a1a;
}

.concat-result {
  color: #555;
  background-color: #f5f5f5;
  padding: 12px;
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  border-left: 3px solid #42b983;
}

.concat-domain {
  color: #42b983;
  font-weight: bold;
  word-break: break-all;
}

.copy-button {
  background-color: #2c3e50;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: background-color 0.3s;
  white-space: nowrap;
}

.copy-button:hover {
  background-color: #1a2733;
}

.copy-icon {
  font-size: 14px;
}

@media (max-width: 768px) {
  .excel-domain-viewer {
    padding: 15px;
  }
  
  .page-header {
    margin-bottom: 30px;
  }

  h1 {
    font-size: 24px;
  }
  
  .subtitle {
    font-size: 14px;
  }
  
  .upload-button {
    padding: 10px 16px;
  }
  
  .filter-section {
    padding: 15px;
  }
  
  .input-group input {
    padding: 10px;
  }
  
  .domain-list {
    padding: 15px;
  }
  
  .list-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .domain-count {
    align-self: flex-start;
  }
  
  .concat-result {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .concat-domain {
    width: 100%;
    margin-bottom: 10px;
  }
  
  .copy-button {
    align-self: flex-end;
  }
}

.no-domains {
  text-align: center;
  margin-top: 20px;
  color: #666;
}

.input-with-button {
  display: flex;
  align-items: center;
  gap: 10px;
}

.input-with-button input {
  flex: 1;
}

.example-button {
  background-color: #2c3e50;
  color: white;
  border: none;
  padding: 12px 15px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  transition: background-color 0.3s;
}

.example-button:hover {
  background-color: #1a2733;
}

.dropdown {
  position: relative;
  display: inline-block;
}

.dropdown-content {
  display: none;
  position: absolute;
  right: 0;
  background-color: #f9f9f9;
  min-width: 200px;
  box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
  z-index: 1;
  border-radius: 6px;
  overflow: hidden;
}

.dropdown-content a {
  color: #333;
  padding: 12px 16px;
  text-decoration: none;
  display: block;
  transition: background-color 0.2s;
}

.dropdown-content a:hover {
  background-color: #f1f1f1;
}

.dropdown:hover .dropdown-content {
  display: block;
}

.regex-tips {
  margin-top: 8px;
  color: #666;
}

.copy-toast {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 10px 20px;
  border-radius: 4px;
  z-index: 1000;
  animation: fadeInOut 2s ease;
}

@keyframes fadeInOut {
  0% { opacity: 0; transform: translate(-50%, 20px); }
  20% { opacity: 1; transform: translate(-50%, 0); }
  80% { opacity: 1; transform: translate(-50%, 0); }
  100% { opacity: 0; transform: translate(-50%, 0); }
}

.domain-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.like-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px;
  font-size: 20px;
  transition: transform 0.3s;
  display: flex;
  align-items: center;
  opacity: 0.7;
}

.like-button:hover {
  transform: scale(1.2);
  opacity: 1;
}

.like-button.liked {
  opacity: 1;
}

.domain-list li.liked {
  background: linear-gradient(135deg, #fff8f8 0%, #fff 100%);
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
</style> 