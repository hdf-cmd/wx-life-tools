// utils/csv.js
// CSV 拼装：记账导出与习惯导出共用。
// 字段含逗号/引号/换行时用引号包裹并把内部引号翻倍；BOM 头保证 Excel 打开中文不乱码。

function escapeCell(v) {
  const s = String(v === undefined || v === null ? '' : v)
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

/**
 * @param {string[]} headers 表头
 * @param {Array<Array<*>>} rows 二维数组，每行长度应与 headers 一致
 */
function toCsv(headers, rows) {
  const lines = [headers.map(escapeCell).join(',')]
  for (let i = 0; i < (rows || []).length; i++) {
    lines.push((rows[i] || []).map(escapeCell).join(','))
  }
  return '\ufeff' + lines.join('\n') + '\n'
}

module.exports = { escapeCell, toCsv }
