// cloudfunctions/bookkeeping/index.js
// 记账模块云函数 - 处理账单的增删查统计

const crypto = require('crypto')
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 云函数端 get() 不写 limit 时默认且最多 100 条，聚合类查询必须显式抬到上限
const MAX_ROWS = 1000

/**
 * 北京时区（UTC+8）的今日 YYYY-MM-DD
 * 禁用 toISOString().slice(0,10)：那是 UTC 日期，北京时间 00:00–07:59 会算成昨天
 */
function localTodayStr() {
  const t = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return t.toISOString().slice(0, 10)
}

function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function isValidMonthStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}$/.test(s)) return false
  const m = parseInt(s.slice(5), 10)
  return m >= 1 && m <= 12
}

/**
 * 判断是否主键冲突（重复 _id）：并发双写时用于把"对手已写入"与真实错误区分开
 */
function isDuplicateErr(e) {
  if (!e) return false
  return /duplicate|already exists|-502107/i.test((e.errMsg || '') + ' ' + (e.message || '') + ' ' + (e.errCode || ''))
}

/**
 * 云函数主入口
 * 通过 action 参数路由到不同的操作
 */
exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  switch (action) {
    case 'add':
      return await addBill(event, openid)
    case 'list':
      return await listBills(event, openid)
    case 'get':
      return await getBill(event, openid)
    case 'update':
      return await updateBill(event, openid)
    case 'stats':
      return await getStats(event, openid)
    case 'trend':
      return await getTrend(event, openid)
    case 'export':
      return await exportBills(event, openid)
    case 'getBudget':
      return await getBudget(event, openid)
    case 'setBudget':
      return await setBudget(event, openid)
    case 'delete':
      return await deleteBill(event, openid)
    default:
      return { code: -1, msg: '未知的操作类型' }
  }
}

/**
 * 添加账单
 * @param {Object} data - 账单数据
 * @param {number} data.amount - 金额
 * @param {string} data.type - 类型：income/expense
 * @param {string} data.category - 分类名称
 * @param {string} data.note - 备注
 * @param {string} data.date - 日期 YYYY-MM-DD
 */
async function addBill(data, openid) {
  try {
    const { amount, type, category, note, date } = data

    // 参数校验
    if (!amount || amount <= 0) {
      return { code: -1, msg: '金额必须大于0' }
    }
    if (!type || !['income', 'expense'].includes(type)) {
      return { code: -1, msg: '类型参数错误' }
    }
    if (!category) {
      return { code: -1, msg: '请选择分类' }
    }
    const amt = Number(amount)
    if (!isFinite(amt) || amt <= 0) {
      return { code: -1, msg: '金额必须大于0' }
    }
    if (date && !isValidDateStr(date)) {
      return { code: -1, msg: '日期格式错误（应为 YYYY-MM-DD）' }
    }

    // 处理金额浮点精度
    const safeAmount = Math.round(amt * 100) / 100

    const result = await db.collection('accounts').add({
      data: {
        _openid: openid,
        amount: safeAmount,
        type,
        category: String(category).slice(0, 20),
        note: String(note || '').slice(0, 200),
        date: date || localTodayStr(),
        createdAt: new Date()
      }
    })

    return {
      code: 0,
      msg: '添加成功',
      data: result
    }
  } catch (err) {
    console.error('[addBill] 错误:', err)
    return { code: -1, msg: '添加失败', error: err.message }
  }
}

/**
 * 获取账单列表（分页）
 * @param {Object} data
 * @param {string} data.month - 月份 YYYY-MM
 * @param {number} data.page - 页码，从 1 开始，默认 1
 * @returns {code:0, data:{list, page, hasMore}} 单页 50 条，hasMore 供前端判断是否继续加载
 */
async function listBills(data, openid) {
  try {
    const { month } = data
    const page = Math.max(parseInt(data.page, 10) || 1, 1)
    const limit = 50

    if (!isValidMonthStr(month)) {
      return { code: -1, msg: '请指定月份（YYYY-MM）' }
    }

    // 使用范围查询替代正则匹配，避免 RegExp 与 orderBy 冲突导致查询失败
    const startOfMonth = month
    const endOfMonth = month + '-32'  // 保证大于该月所有日期 (YYYY-MM-DD)

    // date 是天粒度，必须补 _id 次级排序键，否则同日多笔跨页顺序不稳定 → 翻页重复/漏条
    const result = await db.collection('accounts')
      .where({
        _openid: openid,
        date: _.gte(startOfMonth).and(_.lt(endOfMonth))
      })
      .orderBy('date', 'desc')
      .orderBy('_id', 'desc')
      .skip((page - 1) * limit)
      .limit(limit)
      .get()

    return {
      code: 0,
      data: {
        list: result.data,
        page: page,
        hasMore: result.data.length === limit
      }
    }
  } catch (err) {
    console.error('[listBills] 错误:', err)
    return { code: -1, msg: '获取列表失败', error: err.message }
  }
}

/**
 * 获取月度统计
 * @param {Object} data
 * @param {string} data.month - 月份 YYYY-MM
 */
async function getStats(data, openid) {
  try {
    const { month } = data

    if (!isValidMonthStr(month)) {
      return { code: -1, msg: '请指定月份（YYYY-MM）' }
    }

    // 获取该月所有账单（范围查询，与 listBills 一致）
    // 必须显式 limit：不写时云函数端默认且最多只返回 100 条，会让统计静默少算
    const startOfMonth = month + '-01'
    const endOfMonth = month + '-32'
    const result = await db.collection('accounts')
      .where({
        _openid: openid,
        date: _.gte(startOfMonth).and(_.lt(endOfMonth))
      })
      .limit(MAX_ROWS)
      .get()

    const bills = result.data

    // 全部以「分」为整数累加，避免浮点误差逐笔放大
    let incomeCents = 0
    let expenseCents = 0
    const categoryMap = {}

    bills.forEach(bill => {
      const cents = Math.round((Number(bill.amount) || 0) * 100)

      if (bill.type === 'income') {
        incomeCents += cents
      } else {
        expenseCents += cents
      }

      // 按分类汇总（支出）
      if (bill.type === 'expense') {
        if (!categoryMap[bill.category]) {
          categoryMap[bill.category] = 0
        }
        categoryMap[bill.category] += cents
      }
    })

    // 转换分类数据为数组并排序
    const categoryStats = Object.keys(categoryMap).map(key => ({
      category: key,
      amount: categoryMap[key] / 100,
      percent: expenseCents > 0
        ? Math.round((categoryMap[key] / expenseCents) * 10000) / 100
        : 0
    })).sort((a, b) => b.amount - a.amount)

    return {
      code: 0,
      data: {
        totalIncome: incomeCents / 100,
        totalExpense: expenseCents / 100,
        balance: (incomeCents - expenseCents) / 100,
        categoryStats,
        truncated: bills.length === MAX_ROWS,
        billCount: bills.length
      }
    }
  } catch (err) {
    console.error('[getStats] 错误:', err)
    return { code: -1, msg: '获取统计失败', error: err.message }
  }
}

/**
 * 获取单条账单（编辑页回填用）
 * @param {Object} data
 * @param {string} data.id - 账单ID
 */
async function getBill(data, openid) {
  try {
    const { id } = data
    if (!id) {
      return { code: -1, msg: '缺少账单ID' }
    }
    const bill = await db.collection('accounts').doc(id).get()
    if (!bill.data || bill.data._openid !== openid) {
      return { code: -1, msg: '无权查看该账单' }
    }
    return { code: 0, data: bill.data }
  } catch (err) {
    console.error('[getBill] 错误:', err)
    return { code: -1, msg: '获取账单失败', error: err.message }
  }
}

/**
 * 更新账单（编辑保存）
 * @param {Object} data - 同 add，外加 data.id
 */
async function updateBill(data, openid) {
  try {
    const { id, amount, type, category, note, date } = data

    if (!id) {
      return { code: -1, msg: '缺少账单ID' }
    }
    const amt = Number(amount)
    if (!isFinite(amt) || amt <= 0) {
      return { code: -1, msg: '金额必须大于0' }
    }
    if (!type || !['income', 'expense'].includes(type)) {
      return { code: -1, msg: '类型参数错误' }
    }
    if (!category) {
      return { code: -1, msg: '请选择分类' }
    }
    if (date && !isValidDateStr(date)) {
      return { code: -1, msg: '日期格式错误（应为 YYYY-MM-DD）' }
    }

    // 所有权校验（与 delete 同模式）
    const bill = await db.collection('accounts').doc(id).get()
    if (!bill.data || bill.data._openid !== openid) {
      return { code: -1, msg: '无权修改该账单' }
    }

    await db.collection('accounts').doc(id).update({
      data: {
        amount: Math.round(amt * 100) / 100,
        type: type,
        category: String(category).slice(0, 20),
        note: String(note || '').slice(0, 200),
        date: date || bill.data.date,
        updatedAt: new Date()
      }
    })

    return { code: 0, msg: '更新成功' }
  } catch (err) {
    console.error('[updateBill] 错误:', err)
    return { code: -1, msg: '更新失败', error: err.message }
  }
}

/**
 * 近 N 个月收支趋势（含当月，用于柱状图）
 * @param {Object} data
 * @param {number} data.months - 月数，默认 6
 */
async function getTrend(data, openid) {
  try {
    const months = Math.min(Math.max(parseInt(data.months, 10) || 6, 1), 12)
    const now = new Date()

    // 构造近 N 个月的月份键（含当月）
    const map = {}
    let startMonth = ''
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      if (!startMonth) startMonth = key
      map[key] = { income: 0, expense: 0 }
    }

    // 一次范围查询（显式 limit；不写时云函数端默认只取 100 条）
    // 必须带上界：否则该月之后新增的账单会白占 limit 额度，把窗口内的数据挤掉
    const lastMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
    const result = await db.collection('accounts')
      .where({
        _openid: openid,
        date: _.gte(startMonth + '-01').and(_.lt(lastMonth + '-32'))
      })
      .limit(MAX_ROWS)
      .get()

    // 内存按月聚合（以分为单位整数累加）
    result.data.forEach(bill => {
      const key = (bill.date || '').slice(0, 7)
      if (!map[key]) return
      const cents = Math.round((bill.amount || 0) * 100)
      if (bill.type === 'income') {
        map[key].income += cents
      } else {
        map[key].expense += cents
      }
    })

    const list = Object.keys(map).sort().map(key => ({
      month: key,
      label: parseInt(key.slice(5), 10) + '月',
      income: map[key].income / 100,
      expense: map[key].expense / 100
    }))

    return { code: 0, data: list, truncated: result.data.length === MAX_ROWS }
  } catch (err) {
    console.error('[getTrend] 错误:', err)
    return { code: -1, msg: '获取趋势失败', error: err.message }
  }
}

/**
 * 导出当月全部账单（CSV 数据源，不分页）
 */
async function exportBills(data, openid) {
  try {
    const { month } = data
    if (!isValidMonthStr(month)) {
      return { code: -1, msg: '请指定月份（YYYY-MM）' }
    }

    const startOfMonth = month
    const endOfMonth = month + '-32'

    const result = await db.collection('accounts')
      .where({
        _openid: openid,
        date: _.gte(startOfMonth).and(_.lt(endOfMonth))
      })
      .orderBy('date', 'desc')
      .orderBy('_id', 'desc')
      .limit(MAX_ROWS)
      .get()

    // truncated 让前端能提示"仅导出前 1000 条"，不再静默截断
    return { code: 0, data: result.data, truncated: result.data.length === MAX_ROWS }
  } catch (err) {
    console.error('[exportBills] 错误:', err)
    return { code: -1, msg: '导出失败', error: err.message }
  }
}

/**
 * 获取月度预算（budgets 集合按需创建，独立 try-catch）
 * @param {Object} data
 * @param {string} data.month - 月份 YYYY-MM
 */
async function getBudget(data, openid) {
  try {
    const { month } = data
    if (!isValidMonthStr(month)) {
      return { code: -1, msg: '请指定月份（YYYY-MM）' }
    }

    let res
    try {
      res = await db.collection('budgets')
        .where({ _openid: openid, month: month })
        .limit(1)
        .get()
    } catch (e) {
      // 集合不存在：按需创建后视为无预算
      try { await db.createCollection('budgets') } catch (e2) { }
      return { code: 0, data: { amount: 0 } }
    }

    return { code: 0, data: { amount: (res.data[0] && res.data[0].amount) || 0 } }
  } catch (err) {
    console.error('[getBudget] 错误:', err)
    return { code: -1, msg: '获取预算失败', error: err.message }
  }
}

/**
 * 设置月度预算（存在则更新；amount=0 表示清除）
 * @param {Object} data
 * @param {string} data.month - 月份 YYYY-MM
 * @param {number} data.amount - 预算金额
 */
async function setBudget(data, openid) {
  try {
    const { month } = data
    const rawAmount = Number(data.amount)
    if (!isFinite(rawAmount)) {
      return { code: -1, msg: '预算金额无效' }
    }
    const amount = Math.round(rawAmount * 100) / 100

    if (!isValidMonthStr(month)) {
      return { code: -1, msg: '请指定月份（YYYY-MM）' }
    }
    if (amount < 0) {
      return { code: -1, msg: '金额不能为负' }
    }

    let existing = null
    try {
      const res = await db.collection('budgets')
        .where({ _openid: openid, month: month })
        .limit(1)
        .get()
      existing = res.data[0] || null
    } catch (e) {
      try { await db.createCollection('budgets') } catch (e2) { }
    }

    if (existing) {
      await db.collection('budgets').doc(existing._id).update({
        data: { amount: amount, updatedAt: new Date() }
      })
    } else {
      // 幂等 _id：并发下两次"查无记录再写"只会落一条预算（主键唯一性兜底），与 habit_logs 同方案
      const budgetId = crypto.createHash('md5').update(openid + '|' + month).digest('hex')
      try {
        await db.collection('budgets').add({
          data: { _id: budgetId, _openid: openid, month: month, amount: amount, createdAt: new Date() }
        })
      } catch (e) {
        if (!isDuplicateErr(e)) throw e
        await db.collection('budgets').doc(budgetId).update({
          data: { amount: amount, updatedAt: new Date() }
        })
      }
    }

    return { code: 0, msg: amount > 0 ? '预算已设置' : '预算已清除' }
  } catch (err) {
    console.error('[setBudget] 错误:', err)
    return { code: -1, msg: '设置预算失败', error: err.message }
  }
}

/**
 * 删除账单
 * @param {Object} data
 * @param {string} data.id - 账单ID
 */
async function deleteBill(data, openid) {
  try {
    const { id } = data

    if (!id) {
      return { code: -1, msg: '缺少账单ID' }
    }

    // 验证该账单属于当前用户
    const bill = await db.collection('accounts').doc(id).get()

    if (!bill.data || bill.data._openid !== openid) {
      return { code: -1, msg: '无权删除该账单' }
    }

    await db.collection('accounts').doc(id).remove()

    return {
      code: 0,
      msg: '删除成功'
    }
  } catch (err) {
    console.error('[deleteBill] 错误:', err)
    return { code: -1, msg: '删除失败', error: err.message }
  }
}
