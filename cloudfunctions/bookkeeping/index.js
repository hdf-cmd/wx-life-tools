// cloudfunctions/bookkeeping/index.js
// 记账模块云函数 - 处理账单的增删查统计

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

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
    case 'stats':
      return await getStats(event, openid)
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

    // 处理金额浮点精度
    const safeAmount = Math.round(amount * 100) / 100

    const result = await db.collection('accounts').add({
      data: {
        _openid: openid,
        amount: safeAmount,
        type,
        category,
        note: note || '',
        date: date || new Date().toISOString().slice(0, 10),
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
 * 获取账单列表
 * @param {Object} data
 * @param {string} data.month - 月份 YYYY-MM
 */
async function listBills(data, openid) {
  try {
    const { month } = data

    if (!month) {
      return { code: -1, msg: '请指定月份' }
    }

    // 使用范围查询替代正则匹配，避免 RegExp 与 orderBy 冲突导致查询失败
    const startOfMonth = month
    const endOfMonth = month + '-32'  // 保证大于该月所有日期 (YYYY-MM-DD)

    const result = await db.collection('accounts')
      .where({
        _openid: openid,
        date: _.gte(startOfMonth).and(_.lt(endOfMonth))
      })
      .orderBy('date', 'desc')
      .limit(100)
      .get()

    return {
      code: 0,
      data: result.data
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

    if (!month) {
      return { code: -1, msg: '请指定月份' }
    }

    // 获取该月所有账单（范围查询，与 listBills 一致）
    const startOfMonth = month + '-01'
    const endOfMonth = month + '-32'
    const result = await db.collection('accounts')
      .where({
        _openid: openid,
        date: _.gte(startOfMonth).and(_.lt(endOfMonth))
      })
      .get()

    const bills = result.data

    // 计算总收入、总支出
    let totalIncome = 0
    let totalExpense = 0
    const categoryMap = {}

    bills.forEach(bill => {
      const amount = Math.round(bill.amount * 100) / 100

      if (bill.type === 'income') {
        totalIncome += amount
      } else {
        totalExpense += amount
      }

      // 按分类汇总（支出）
      if (bill.type === 'expense') {
        if (!categoryMap[bill.category]) {
          categoryMap[bill.category] = 0
        }
        categoryMap[bill.category] += amount
      }
    })

    // 处理浮点精度
    totalIncome = Math.round(totalIncome * 100) / 100
    totalExpense = Math.round(totalExpense * 100) / 100

    // 转换分类数据为数组并排序
    const categoryStats = Object.keys(categoryMap).map(key => ({
      category: key,
      amount: Math.round(categoryMap[key] * 100) / 100,
      percent: totalExpense > 0
        ? Math.round((categoryMap[key] / totalExpense) * 10000) / 100
        : 0
    })).sort((a, b) => b.amount - a.amount)

    return {
      code: 0,
      data: {
        totalIncome,
        totalExpense,
        balance: Math.round((totalIncome - totalExpense) * 100) / 100,
        categoryStats
      }
    }
  } catch (err) {
    console.error('[getStats] 错误:', err)
    return { code: -1, msg: '获取统计失败', error: err.message }
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

    if (bill.data._openid !== openid) {
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
