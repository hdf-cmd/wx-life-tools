// tests/bookkeeping.test.js
// bookkeeping 云函数接口级沙箱测试：加载真实源码（cloudfunctions/bookkeeping/index.js），
// 仅把 wx-server-sdk 换成内存桩件（tests/stubs/wx-server-sdk.js）。
// 运行方式：node tests/bookkeeping.test.js
//
// 本文件锁住的行为：
//   1. 云函数端 get() 不写 limit 时默认且最多 100 条 —— 统计类查询必须显式抬到 1000，否则静默少算
//   2. 日期兜底走 UTC+8，不用 toISOString()（那是 UTC，凌晨会写成昨天）
//   3. 月份/日期参数校验（YYYY-MM / YYYY-MM-DD）
//   4. 金额以「分」为整数累加
//   5. 天粒度 date 排序必须有 _id 次级键，否则同日多笔翻页会重复/漏条
//   6. budgets 写入用确定性 _id，并发双写只落一条

const path = require('path')
const Module = require('module')
const crypto = require('crypto')

const stubPath = path.join(__dirname, 'stubs', 'wx-server-sdk.js')
const origLoad = Module._load
Module._load = function (request) {
  if (request === 'wx-server-sdk') return require(stubPath)
  return origLoad.apply(this, Array.prototype.slice.call(arguments))
}

const fn = require('../cloudfunctions/bookkeeping/index.js')

// 与云函数同口径（UTC+8），避免把日期冻成绝对值后随时间失效
function utc8(offsetDays) {
  const t = new Date(Date.now() + 8 * 60 * 60 * 1000 - (offsetDays || 0) * 86400000)
  const y = t.getUTCFullYear()
  const m = String(t.getUTCMonth() + 1).padStart(2, '0')
  const d = String(t.getUTCDate()).padStart(2, '0')
  return { date: y + '-' + m + '-' + d, month: y + '-' + m }
}
const NOW = utc8()

let passed = 0
let failed = 0

async function test(name, body) {
  try {
    await body()
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

// 造 N 条支出账单（默认同一天，用于压测条数上限与翻页）
function seedBills(n, opts) {
  const o = opts || {}
  for (let i = 0; i < n; i++) {
    stub.seedDoc('accounts', {
      _id: o.idPrefix + '_' + i,
      _openid: o.openid || 'userA',
      amount: o.amount == null ? 1 : o.amount,
      type: o.type || 'expense',
      category: o.category || '餐饮',
      note: o.note || '',
      date: o.date || NOW.date
    })
  }
}

const stub = require(stubPath)

function call(action, extra) {
  return fn.main(Object.assign({ action: action }, extra), {})
}

async function main() {
  console.log('bookkeeping 云函数沙箱测试（桩件 + 真实源码）\n')

  await test('统计不被 100 条默认上限截断：150 条账单应全算', async () => {
    stub.reset({ openid: 'userA' })
    seedBills(150, { idPrefix: 'a' })
    const r = await call('stats', { month: NOW.month })
    eq(r.code, 0)
    eq(r.data.totalExpense, 150, 'totalExpense')
    eq(r.data.billCount, 150, 'billCount')
    eq(r.data.truncated, false, 'truncated')
  })

  await test('统计达到 1000 条上限时明确回报 truncated，不静默少算', async () => {
    stub.reset({ openid: 'userA' })
    seedBills(1000, { idPrefix: 'b' })
    const r = await call('stats', { month: NOW.month })
    eq(r.code, 0)
    eq(r.data.truncated, true, 'truncated')
    eq(r.data.billCount, 1000, 'billCount')
  })

  await test('金额以分为整数累加：0.1 × 3 应恰为 0.3', async () => {
    stub.reset({ openid: 'userA' })
    seedBills(3, { idPrefix: 'c', amount: 0.1 })
    const r = await call('stats', { month: NOW.month })
    eq(r.data.totalExpense, 0.3, 'totalExpense')
  })

  await test('不传 date 时兜底为 UTC+8 今日（非 UTC 日期）', async () => {
    stub.reset({ openid: 'userA' })
    stub.ensureCollection('accounts')
    const RealDate = Date
    // 冻结在 UTC 2026-10-06T20:00Z：UTC 日期是 10-06，北京时间是 10-07 04:00
    class FakeDate extends RealDate {
      constructor(...a) { if (a.length) super(...a); else super('2026-10-06T20:00:00Z') }
      static now() { return new RealDate('2026-10-06T20:00:00Z').getTime() }
    }
    global.Date = FakeDate
    try {
      const r = await call('add', { amount: 8.8, type: 'expense', category: '餐饮' })
      eq(r.code, 0, 'add 应成功')
      const saved = stub.dump('accounts')[0]
      eq(saved.date, '2026-10-07', '兜底日期')
    } finally {
      global.Date = RealDate
    }
  })

  await test('月份参数校验：非 YYYY-MM 一律拒绝', async () => {
    stub.reset({ openid: 'userA' })
    seedBills(2, { idPrefix: 'd' })
    for (const bad of ['2026-9', 'abc', '2026-13', '']) {
      const list = await call('list', { month: bad })
      eq(list.code, -1, 'list month=' + JSON.stringify(bad))
      const stats = await call('stats', { month: bad })
      eq(stats.code, -1, 'stats month=' + JSON.stringify(bad))
      const exp = await call('export', { month: bad })
      eq(exp.code, -1, 'export month=' + JSON.stringify(bad))
    }
  })

  await test('日期参数校验：非 YYYY-MM-DD 拒绝写入', async () => {
    stub.reset({ openid: 'userA' })
    const bad = await call('add', { amount: 5, type: 'expense', category: '餐饮', date: '2026-10-7' })
    eq(bad.code, -1, 'add date=2026-10-7')
    eq(stub.dump('accounts').length, 0, '不应落库')
  })

  await test('金额参数校验：非有限数/≤0 拒绝', async () => {
    stub.reset({ openid: 'userA' })
    for (const bad of ['abc', 0, -3, null]) {
      const r = await call('add', { amount: bad, type: 'expense', category: '餐饮' })
      eq(r.code, -1, 'amount=' + JSON.stringify(bad))
    }
    eq(stub.dump('accounts').length, 0, '不应落库')
  })

  await test('同日多笔翻页：60 条同天账单两页取完不重不漏', async () => {
    stub.reset({ openid: 'userA' })
    seedBills(60, { idPrefix: 'e' })
    const p1 = await call('list', { month: NOW.month, page: 1 })
    const p2 = await call('list', { month: NOW.month, page: 2 })
    eq(p1.code, 0)
    eq(p2.code, 0)
    eq(p1.data.list.length, 50, '第一页条数')
    eq(p2.data.list.length, 10, '第二页条数')
    const ids = p1.data.list.concat(p2.data.list).map(x => x._id)
    eq(new Set(ids).size, 60, '两页并集应 60 条唯一')
    eq(p1.data.hasMore, true, 'hasMore')
    eq(p2.data.hasMore, false, '末页 hasMore')
  })

  await test('预算并发双写：同月两次只落一条', async () => {
    stub.reset({ openid: 'userA' })
    const results = await Promise.all([
      call('setBudget', { month: NOW.month, amount: 3000 }),
      call('setBudget', { month: NOW.month, amount: 5000 })
    ])
    results.forEach(r => eq(r.code, 0, 'setBudget 应成功'))
    const rows = stub.dump('budgets')
    eq(rows.length, 1, 'budgets 只应 1 条')
    const expectedId = crypto.createHash('md5').update('userA|' + NOW.month).digest('hex')
    eq(rows[0]._id, expectedId, '幂等 _id')
    assert([3000, 5000].indexOf(rows[0].amount) > -1, '金额应为两次写入之一，实际 ' + rows[0].amount)
  })

  await test('越权拦截：他人账单读/改/删全部拒绝且数据未动', async () => {
    stub.reset({ openid: 'userB' })
    stub.seedDoc('accounts', {
      _id: 'victim', _openid: 'userA', amount: 10, type: 'expense',
      category: '餐饮', note: '', date: NOW.date
    })
    const g = await call('get', { id: 'victim' })
    eq(g.code, -1, 'get 越权')
    const u = await call('update', { id: 'victim', amount: 1, type: 'expense', category: '餐饮' })
    eq(u.code, -1, 'update 越权')
    const d = await call('delete', { id: 'victim' })
    eq(d.code, -1, 'delete 越权')
    eq(stub.dump('accounts').length, 1, '数据不应被删')
    eq(stub.dump('accounts')[0].amount, 10, '金额不应被改')
  })

  await test('趋势窗口带上界：未来月份记录不混入近 6 个月', async () => {
    stub.reset({ openid: 'userA' })
    seedBills(2, { idPrefix: 'f' })
    stub.seedDoc('accounts', {
      _id: 'future_1', _openid: 'userA', amount: 999, type: 'expense',
      category: '餐饮', note: '', date: utc8(-40).date  // 未来 40 天
    })
    const r = await call('trend', { months: 6 })
    eq(r.code, 0)
    eq(r.data.length, 6, '月份键数')
    const total = r.data.reduce((s, m) => s + Math.round(m.expense * 100), 0)
    eq(total, 200, '近 6 个月支出合计（应为 2 条 1 元，不含未来那条）')
  })

  console.log('\n结果：' + passed + ' 通过 / ' + failed + ' 失败')
  process.exit(failed ? 1 : 0)
}

main().catch(e => {
  console.error('测试异常', e)
  process.exit(1)
})
