/**
 * MiniMax 模型 context window 大小映射表
 * 单位: tokens
 *
 * 来源: https://platform.minimax.io/docs/api-reference/text-openai-api
 */

const MODEL_CONTEXT_SIZES = {
  // MiniMax M 系列 - 统一 200K context window
  'MiniMax-M2': 204800,
  'MiniMax-M2.1': 204800,
  'MiniMax-M2.1-highspeed': 204800,
  'MiniMax-M2.5': 204800,
  'MiniMax-M2.5-highspeed': 204800,
  'MiniMax-M2.7': 204800,
  'MiniMax-M2.7-highspeed': 204800,
};

/**
 * 根据模型名称获取 context window 大小
 * @param {string} modelName - 模型名称
 * @returns {number|null} context window 大小，如果未找到返回 null
 */
function getContextWindowSize(modelName) {
  if (!modelName) return null;

  // 精确匹配
  if (MODEL_CONTEXT_SIZES[modelName] !== undefined) {
    return MODEL_CONTEXT_SIZES[modelName];
  }

  // MiniMax M 系列模糊匹配（兼容未知的 MiniMax-M 系列新型号）
  if (modelName.includes('MiniMax-M')) {
    return 204800;
  }

  return null;
}

/**
 * 获取默认 context window 大小
 * @returns {number} 默认值 200000
 */
function getDefaultContextWindowSize() {
  return 200000;
}

module.exports = {
  MODEL_CONTEXT_SIZES,
  getContextWindowSize,
  getDefaultContextWindowSize,
};
