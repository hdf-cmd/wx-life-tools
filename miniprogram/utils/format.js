// utils/format.js
// 展示层格式化工具。此前 compress / image-compress 两页各抄了一份完全相同的 _fmtSize。

/**
 * 字节数格式化
 * 空值（null/undefined/'' 等，0 除外）返回空串，便于直接绑定到文本节点
 */
function formatSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

module.exports = {
  formatSize
}
