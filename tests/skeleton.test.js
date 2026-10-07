// tests/skeleton.test.js
// 骨架屏组件的行数展开逻辑（用假 Component 直接加载真实组件源码）。
// 背景：原先 wxml 用 wx:for="{{rows}}" 配 rows: Number，且 wx:key="*index" 是非法键名，
// 每次渲染都报 WXMLRT 告警；现改为组件内展开成 rowList 数组 + wx:key="*this"。
// 运行方式：node tests/skeleton.test.js

let captured = null
global.Component = def => { captured = def }

require('../miniprogram/components/skeleton/skeleton.js')

// 真实组件里属性挂在 this.data 上，setData 合并进 this.data —— 桩件按同一形状造
function makeInstance(overrides) {
  const data = {}
  Object.keys(captured.properties).forEach(k => {
    data[k] = captured.properties[k].value
  })
  Object.assign(data, captured.data || {}, overrides || {})
  return {
    data: data,
    setData(payload) { Object.assign(this.data, payload) }
  }
}


let passed = 0
let failed = 0

function test(name, body) {
  try {
    body()
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

console.log('skeleton 组件沙箱测试（假 Component + 真实组件源码）\n')

test('组件定义包含 rowList 初值与 rows 监听', () => {
  eq(typeof captured.observers['rows'], 'function', 'observers.rows')
  eq(typeof captured.lifetimes.attached, 'function', 'lifetimes.attached')
  eq(Array.isArray(captured.data.rowList), true, 'data.rowList 初值应为数组')
})

test('observer：rows=5 展开成 5 行且键值唯一', () => {
  const inst = makeInstance()
  captured.observers['rows'].call(inst, 5)
  eq(inst.data.rowList.length, 5, 'rowList 长度')
  eq(new Set(inst.data.rowList).size, 5, '*this 作键必须唯一')
  eq(inst.data.rowList.join(','), '0,1,2,3,4', 'rowList 内容')
})

test('attached 兜底：不依赖 observer 首帧触发也能出行数', () => {
  const inst = makeInstance({ rows: 4 })
  captured.lifetimes.attached.call(inst)
  eq(inst.data.rowList.length, 4, 'rowList 长度')
})

test('异常入参不崩：0 / 负数 / 非数字 / undefined 都归零', () => {
  [0, -3, 'abc', undefined, null, NaN].forEach(v => {
    const inst = makeInstance({ rows: v })
    captured.observers['rows'].call(inst, v)
    eq(inst.data.rowList.length, 0, 'rows=' + JSON.stringify(v))
  })
})

test('字符串数字可用：rows="6" 展开成 6 行', () => {
  const inst = makeInstance()
  captured.observers['rows'].call(inst, '6')
  eq(inst.data.rowList.length, 6, 'rowList 长度')
})

console.log('\n结果：' + passed + ' 通过 / ' + failed + ' 失败')
process.exit(failed ? 1 : 0)
