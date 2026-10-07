// tests/run-all.js
// 一次跑完 tests/ 下所有 *.test.js。自动发现文件，新增测试不会被漏跑。
// 运行方式：node tests/run-all.js

const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const files = fs.readdirSync(__dirname).filter(f => /\.test\.js$/.test(f)).sort()
if (files.length === 0) {
  console.error('没找到任何 *.test.js，检查 tests/ 目录')
  process.exit(1)
}

let failedFiles = 0
files.forEach(f => {
  console.log('\n===== ' + f + ' =====')
  try {
    execFileSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' })
  } catch (e) {
    failedFiles++
  }
})

console.log('\n' + '====================================')
console.log(failedFiles === 0
  ? '全部通过：' + files.length + ' 个测试文件（' + files.join('、') + '）'
  : '有 ' + failedFiles + ' / ' + files.length + ' 个测试文件失败')
process.exit(failedFiles > 0 ? 1 : 0)
