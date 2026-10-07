// tests/csv.test.js
// utils/csv.js 纯函数测试：记账导出与习惯导出共用，转义口径错一处就污染两份 CSV。
// 运行方式：node tests/csv.test.js

const path = require('path')
const { toCsv, escapeCell } = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'csv.js'))

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log('  [通过] ' + name)
  } catch (e) {
    failed++
    console.log('  [失败] ' + name + '\n         ' + (e && e.message))
  }
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error((label || '值') + '应为 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual))
  }
}

console.log('utils/csv.js 纯函数测试\n')

test('首字符必须是 BOM（Excel 打开中文不乱码的前提）', () => {
  eq(toCsv(['日期'], []).charCodeAt(0), 0xFEFF, 'charCodeAt(0)')
})

test('普通行列结构：表头 + 每行一条，末尾带换行', () => {
  const out = toCsv(['a', 'b'], [['1', '2'], ['3', '4']])
  eq(out.replace('﻿', ''), 'a,b\n1,2\n3,4\n')
})

test('含逗号的字段加引号包裹', () => {
  eq(escapeCell('早起,跑步'), '"早起,跑步"')
})

test('含引号的字段整体加引号且内部引号翻倍', () => {
  eq(escapeCell('他说"好"'), '"他说""好"""')
})

test('含换行的字段加引号（否则一行会被拆成两行）', () => {
  eq(escapeCell('第一行\n第二行'), '"第一行\n第二行"')
})

test('null / undefined 归空串，不写出 "null" 字样', () => {
  eq(escapeCell(null), '')
  eq(escapeCell(undefined), '')
})

test('数字原样输出（金额已在上游 toFixed）', () => {
  eq(escapeCell(12.5), '12.5')
})

test('只有表头时不产生空数据行', () => {
  eq(toCsv(['日期', '习惯'], []).replace('﻿', ''), '日期,习惯\n')
})

test('rows 传 null 或行内为 null 都不崩', () => {
  eq(toCsv(['a'], null).replace('﻿', ''), 'a\n')
  eq(toCsv(['a', 'b'], [[null, '2']]).replace('﻿', ''), 'a,b\n,2\n')
})

test('中文习惯名不被误判为需要转义', () => {
  eq(escapeCell('坚持早起'), '坚持早起')
})

console.log('\n结果：' + passed + ' 通过 / ' + failed + ' 失败')
process.exit(failed > 0 ? 1 : 0)
