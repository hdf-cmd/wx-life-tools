// tests/habit-checkin.test.js
// habit 云函数 checkIn 接口级沙箱测试。
// 加载真实云函数源码（cloudfunctions/habit/index.js），仅将 wx-server-sdk 替换为内存桩件。
// 运行方式：node tests/habit-checkin.test.js
//
// 背景修复（2026-09-11）：checkIn 原为"先查后写"，并发下两个请求都通过查重后各写一条。
// 现写入使用确定性 _id（md5(openid|habitId|date)），由数据库主键唯一性兜底并发防重；
// 查重查询结果不明（超时等）时 fail-closed，不再按无记录继续写。

const path = require('path')
const Module = require('module')

// 将 wx-server-sdk 指向桩件，云函数源码原样加载
const stubPath = path.join(__dirname, 'stubs', 'wx-server-sdk.js')
const origLoad = Module._load
Module._load = function (request) {
  if (request === 'wx-server-sdk') return require(stubPath)
  return origLoad.apply(this, Array.prototype.slice.call(arguments))
}

const crypto = require('crypto')
const stub = require('./stubs/wx-server-sdk')
const habitFn = require('../cloudfunctions/habit/index.js')

// 与云函数 getTodayStr() 同口径（UTC+8）动态取今日。
// 原先硬编码 '2026-09-11' 并断言 streak=1：真实日期一旦越过该日，连续天数就归 0，测试必挂。
function utc8Today(offsetDays) {
  const t = new Date(Date.now() + 8 * 60 * 60 * 1000 - (offsetDays || 0) * 24 * 60 * 60 * 1000)
  const y = t.getUTCFullYear()
  const m = String(t.getUTCMonth() + 1).padStart(2, '0')
  const d = String(t.getUTCDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

const TODAY = utc8Today()

function expectedId(openid, habitId, date) {
  return crypto.createHash('md5').update(openid + '|' + habitId + '|' + date).digest('hex')
}

function seedHabit(openid, habitId) {
  stub.seedDoc('habits', {
    _id: habitId,
    _openid: openid,
    name: '测试习惯',
    frequency: 'daily',
    weekDays: [],
    createdAt: { __serverDate: true }
  })
}

function checkIn(habitId, date) {
  return habitFn.main({ action: 'checkIn', habitId: habitId, date: date || TODAY }, {})
}

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log('  [通过] ' + name)
  } catch (e) {
    failed++
    console.log('  [失败] ' + name + '\n         ' + (e && e.message))
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败')
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error((label || '值') + '应为 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual))
  }
}

async function main() {
  console.log('habit checkIn 沙箱测试（桩件 + 真实云函数源码）\n')

  // 核心用例：并发双写
  await test('并发双写：两次同时打卡，一次成功一次返回已打卡，库中只落一条', async () => {
    stub.reset({ openid: 'userA' })
    seedHabit('userA', 'h1')
    const results = await Promise.all([checkIn('h1'), checkIn('h1')])
    const codes = results.map(r => r.code).sort()
    assert(codes[0] === -2 && codes[1] === 0,
      '应恰好一成功(-2/+0)，实际 ' + JSON.stringify(codes))
    const logs = stub.dump('habit_logs')
    assert(logs.length === 1, '库中应只有 1 条，实际 ' + logs.length)
    assert(logs[0]._id === expectedId('userA', 'h1', TODAY), '落库 _id 应为确定性幂等键')
  })

  await test('顺序重复打卡：第二次返回 -2，不产生第二条', async () => {
    stub.reset({ openid: 'userA' })
    seedHabit('userA', 'h1')
    const r1 = await checkIn('h1')
    const r2 = await checkIn('h1')
    assert(r1.code === 0 && r1.streak === 1, '首次应成功且 streak=1，实际 ' + JSON.stringify(r1))
    assert(r2.code === -2, '第二次应返回 -2，实际 ' + r2.code)
    assert(stub.dump('habit_logs').length === 1, '库中应仍只有 1 条')
  })

  await test('历史数据兼容：旧随机 _id 的今日记录仍能被查重拦截', async () => {
    stub.reset({ openid: 'userA' })
    seedHabit('userA', 'h1')
    stub.seedDoc('habit_logs', { _id: 'legacy_random_id', _openid: 'userA', habitId: 'h1', date: TODAY, note: '' })
    const r = await checkIn('h1')
    assert(r.code === -2, '应被 where 查重拦截返回 -2，实际 ' + r.code)
    assert(stub.dump('habit_logs').length === 1, '不应新增记录')
  })

  await test('查重查询结果不明（超时）：fail-closed 返回失败，不写入', async () => {
    stub.reset({ openid: 'userA' })
    seedHabit('userA', 'h1')
    const timeoutErr = new Error('database query timeout')
    timeoutErr.errCode = -504003
    timeoutErr.errMsg = timeoutErr.message
    stub.failNextQuery(timeoutErr)
    const r = await checkIn('h1')
    assert(r.code === -1, '应返回 -1 而非继续写入，实际 ' + JSON.stringify(r))
    assert(stub.dump('habit_logs').length === 0, '不应产生任何写入')
  })

  await test('首次使用：habit_logs 集合不存在时自动建表写入成功', async () => {
    stub.reset({ openid: 'userA' })
    seedHabit('userA', 'h1')
    const r = await checkIn('h1')
    assert(r.code === 0, '应打卡成功，实际 ' + JSON.stringify(r))
    assert(stub.dump('habit_logs').length === 1, '应落库 1 条')
  })

  await test('幂等键隔离：不同用户 / 不同日期互不误伤', async () => {
    stub.reset({ openid: 'userA' })
    seedHabit('userA', 'h1')
    stub.seedDoc('habits', { _id: 'h1', _openid: 'userB', name: 'x', frequency: 'daily', weekDays: [] })
    assert((await checkIn('h1')).code === 0, 'userA 当日打卡应成功')
    stub.reset({ openid: 'userB' })
    stub.seedDoc('habit_logs', {}) // no-op 占位，保持集合存在的语义由 seedDoc 创建
    stub.seedDoc('habits', { _id: 'h1', _openid: 'userB', name: 'x', frequency: 'daily', weekDays: [] })
    assert((await checkIn('h1', '2026-09-12')).code === 0, 'userB 次日打卡应成功')
    stub.reset({ openid: 'userB' })
    stub.seedDoc('habits', { _id: 'h1', _openid: 'userB', name: 'x', frequency: 'daily', weekDays: [] })
    stub.seedDoc('habit_logs', { _id: expectedId('userB', 'h1', '2026-09-12'), _openid: 'userB', habitId: 'h1', date: '2026-09-12' })
    assert((await checkIn('h1', '2026-09-12')).code === -2, 'userB 同日重复打卡应被拦')
  })

  // ===== 本轮新增：服务端日期把关 + 条数上限回归 =====
  function utc8Date(offsetDays) {
    const t = new Date(Date.now() + 8 * 3600000 - offsetDays * 86400000)
    return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0')
  }

  await test('服务端拒绝非法/越界日期：格式错、未来、超一年', async () => {
    stub.reset({ openid: 'userA' })
    seedHabit('userA', 'h1')
    const badFormat = await checkIn('h1', '2026-9-5')
    eq(badFormat.code, -1, '格式错误应拒绝')
    const future = await checkIn('h1', utc8Date(-5))
    eq(future.code, -1, '未来日期应拒绝')
    const ancient = await checkIn('h1', utc8Date(400))
    eq(ancient.code, -1, '超 365 天应拒绝')
    eq(stub.dump('habit_logs').length, 0, '三种非法请求都不应落库')
  })

  await test('连续天数不被 100 条默认上限截断：150 天连卡应算出 150', async () => {
    stub.reset({ openid: 'userA' })
    seedHabit('userA', 'h1')
    stub.ensureCollection('habit_logs')
    for (let i = 0; i < 150; i++) {
      const d = utc8Date(i)
      stub.seedDoc('habit_logs', { _id: expectedId('userA', 'h1', d), _openid: 'userA', habitId: 'h1', date: d })
    }
    const r = await habitFn.main({ action: 'listHabits' }, {})
    eq(r.code, 0)
    eq(r.data[0].streak, 150, 'streak')
  })

  console.log('\n结果：' + passed + ' 通过 / ' + failed + ' 失败')
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('测试执行异常：', e)
  process.exit(1)
})
