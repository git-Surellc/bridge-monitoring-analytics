import React, { useState, useEffect } from 'react';
import { Save, ArrowLeft, Key, Globe, CheckCircle, AlertCircle } from 'lucide-react';

interface AiConfigProps {
  onBack: () => void;
}

export function AiConfig({ onBack }: AiConfigProps) {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('qwen-turbo');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    const config = localStorage.getItem('ai_config');
    if (config) {
      try {
        const parsed = JSON.parse(config);
        setBaseUrl(parsed.baseUrl || '');
        setApiKey(parsed.apiKey || '');
        setModel(parsed.model || 'qwen-turbo');
      } catch (e) {
        console.error('Failed to parse AI config', e);
      }
    }
  }, []);

  const handleSave = () => {
    if (!baseUrl.startsWith('http')) {
      setMessage({ type: 'error', text: 'Base URL 必须以 http 或 https 开头' });
      return;
    }
    if (!apiKey.trim()) {
      setMessage({ type: 'error', text: 'API Key 不能为空' });
      return;
    }

    const config = { baseUrl, apiKey, model };
    localStorage.setItem('ai_config', JSON.stringify(config));
    setMessage({ type: 'success', text: '配置已保存' });
    
    // Clear message after 3 seconds
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div className="max-w-2xl mx-auto mt-10 p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center gap-4 mb-8 border-b border-gray-100 pb-4">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h2 className="text-xl font-bold text-gray-900">AI 分析配置</h2>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Base URL
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://dashscope.aliyuncs.com/compatible/v1 或 https://bailian-openai.cn-beijing.aliyuncs.com/v1"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
          />
          <p className="text-xs text-gray-500 mt-1">
            请输入兼容 OpenAI 接口格式的 API 地址（支持阿里云百炼 DashScope 兼容端点和 Bailian-OpenAI 端点）
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Key className="w-4 h-4" />
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">Model</span>
            模型名称
            <button
              onClick={async () => {
                if (!baseUrl || !apiKey) {
                  setMessage({ type: 'error', text: '请先填写 Base URL 和 API Key' });
                  return;
                }
                setMessage({ type: 'success', text: '正在获取可用模型列表...' });
                try {
                  const res = await fetch('/api/ai/models', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ baseUrl, apiKey })
                  });
                  
                  if (!res.ok) {
                    const text = await res.text();
                    try {
                      const json = JSON.parse(text);
                      // Handle 404 specifically for endpoints that don't support listing models
                      if (res.status === 404) {
                        throw new Error('该 API 节点不支持自动获取模型列表，请手动输入模型名称');
                      }
                      throw new Error(json.error || `HTTP error ${res.status}`);
                    } catch (e: any) {
                      // Pass through our custom error message
                      if (e.message.includes('该 API 节点')) throw e;
                      throw new Error(`API 请求失败 (${res.status}): ${text.slice(0, 100)}`);
                    }
                  }

                  const data = await res.json();
                  if (data.error) throw new Error(data.error);
                  if (data.data && Array.isArray(data.data)) {
                    setMessage({ type: 'success', text: `成功获取 ${data.data.length} 个模型` });
                    // If current model is not in list, maybe suggest one?
                    // For now just show success, user can see list in console if they want, 
                    // or we could show a dropdown. Let's make it a datalist for now.
                    const datalist = document.getElementById('model-list');
                    if (datalist) {
                      datalist.innerHTML = '';
                      data.data.forEach((m: any) => {
                        const option = document.createElement('option');
                        option.value = m.id;
                        datalist.appendChild(option);
                      });
                    }
                  } else {
                    throw new Error('返回数据格式异常');
                  }
                } catch (e: any) {
                  setMessage({ type: 'error', text: `获取模型失败: ${e.message}` });
                }
              }}
              className="ml-auto text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 transition-colors"
            >
              获取可用模型
            </button>
          </label>
          <input
            type="text"
            list="model-list"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="qwen-turbo"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono"
          />
          <datalist id="model-list">
            <option value="qwen-turbo" />
            <option value="qwen-plus" />
            <option value="qwen-max" />
            <option value="gpt-4o" />
            <option value="deepseek-chat" />
            <option value="qwen-2.5-coder-32b-instruct" />
          </datalist>
          <p className="text-xs text-gray-500 mt-1 space-y-1">
            <span className="block">请输入您要使用的模型名称（如 qwen-turbo, qwen-plus, gpt-4o 等）</span>
            <span className="block text-blue-600">
              * 阿里云百炼用户:
              <br/>- 通用: qwen-turbo, qwen-plus, qwen-max
              <br/>- Coding: qwen-2.5-coder-32b-instruct 等（Coding Plan 端点: https://coding.dashscope.aliyuncs.com/v1）
            </span>
          </p>
        </div>

        {message && (
          <div className={`p-4 rounded-lg flex items-center gap-2 ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="pt-4">
          <button
            onClick={handleSave}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}
