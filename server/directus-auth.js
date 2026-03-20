/**
 * Directus 认证中间件
 * 用于验证用户身份和权限
 */

import axios from 'axios';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://auth.pikaa.cn';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

// Directus API 客户端
const directus = axios.create({
  baseURL: DIRECTUS_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 添加 Token 到请求头
if (DIRECTUS_TOKEN) {
  directus.defaults.headers.common['Authorization'] = `Bearer ${DIRECTUS_TOKEN}`;
}

/**
 * 验证 Token 是否有效
 * @param {string} token - 用户提供的 Token
 * @returns {Promise<object|null>} - 用户信息或 null
 */
export async function verifyToken(token) {
  if (!token) return null;
  
  try {
    const response = await axios.get(`${DIRECTUS_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      timeout: 5000
    });
    
    if (response.data && response.data.data) {
      return response.data.data;
    }
    return null;
  } catch (error) {
    console.log('[Directus Auth] Token 验证失败:', error.message);
    return null;
  }
}

/**
 * 验证服务端 Token（环境变量中的 Token）
 * @returns {Promise<boolean>} - 是否有效
 */
export async function verifyServiceToken() {
  if (!DIRECTUS_TOKEN) {
    console.warn('[Directus Auth] 未配置 DIRECTUS_TOKEN，使用本地认证');
    return false;
  }
  
  try {
    const response = await directus.get('/server/info');
    return response.status === 200;
  } catch (error) {
    console.error('[Directus Auth] 服务端 Token 验证失败:', error.message);
    return false;
  }
}

/**
 * Directus 认证中间件
 * 可选模式：
 * - 'required': 必须认证
 * - 'optional': 可选认证（未认证时使用降级权限）
 * - 'disabled': 禁用认证
 */
export function createAuthMiddleware(mode = 'optional') {
  return async (req, res, next) => {
    // 如果禁用认证，直接跳过
    if (mode === 'disabled') {
      return next();
    }
    
    // 从请求头获取 Token
    const authHeader = req.headers.authorization;
    let token = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // 可选认证模式：没有 Token 也允许访问
    if (mode === 'optional' && !token) {
      req.user = null;
      req.authMode = 'anonymous';
      return next();
    }
    
    // 必须认证模式：没有 Token 返回 401
    if (!token) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: '需要提供认证 Token'
      });
    }
    
    // 验证 Token
    const user = await verifyToken(token);
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Token 无效或已过期'
      });
    }
    
    // 附加用户信息到请求
    req.user = user;
    req.authMode = 'authenticated';
    
    // 记录日志
    console.log(`[Directus Auth] 用户认证成功：${user.email || user.id}`);
    
    next();
  };
}

/**
 * 权限检查中间件
 * @param {string[]} requiredRoles - 需要的角色列表
 */
export function requireRoles(requiredRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: '需要先认证'
      });
    }
    
    const userRoles = req.user.role || [];
    const hasRole = requiredRoles.some(role => userRoles.includes(role));
    
    if (!hasRole) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: '权限不足'
      });
    }
    
    next();
  };
}

/**
 * 从 Directus 获取数据
 * @param {string} collection - 集合名称
 * @param {object} params - 查询参数
 * @returns {Promise<any>}
 */
export async function fetchFromDirectus(collection, params = {}) {
  try {
    const response = await directus.get(`/items/${collection}`, { params });
    return response.data.data;
  } catch (error) {
    console.error(`[Directus] 获取 ${collection} 失败:`, error.message);
    throw error;
  }
}

/**
 * 向 Directus 创建数据
 * @param {string} collection - 集合名称
 * @param {object} data - 数据
 * @returns {Promise<any>}
 */
export async function createInDirectus(collection, data) {
  try {
    const response = await directus.post(`/items/${collection}`, data);
    return response.data.data;
  } catch (error) {
    console.error(`[Directus] 创建 ${collection} 数据失败:`, error.message);
    throw error;
  }
}

/**
 * 更新 Directus 数据
 * @param {string} collection - 集合名称
 * @param {string} id - 记录 ID
 * @param {object} data - 数据
 * @returns {Promise<any>}
 */
export async function updateInDirectus(collection, id, data) {
  try {
    const response = await directus.patch(`/items/${collection}/${id}`, data);
    return response.data.data;
  } catch (error) {
    console.error(`[Directus] 更新 ${collection} 数据失败:`, error.message);
    throw error;
  }
}

export default {
  verifyToken,
  verifyServiceToken,
  createAuthMiddleware,
  requireRoles,
  fetchFromDirectus,
  createInDirectus,
  updateInDirectus
};
