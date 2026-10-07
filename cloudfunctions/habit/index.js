// cloudfunctions/habit/index.js
// 习惯打卡云函数 - 通过 action 路由实现不同功能

const crypto = require('crypto')
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 云函数端 get() 不写 limit 时默认且最多 100 条，连续天数类聚合必须显式抬到上限
const MAX_ROWS = 1000

function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

// 云函数入口
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event

  // 根据 action 路由到不同处理函数
  switch (action) {
    case 'addHabit':
      return await addHabit(openid, event)
    case 'listHabits':
      return await listHabits(openid)
    case 'checkIn':
      return await checkIn(openid, event)
    case 'unCheckIn':
      return await unCheckIn(openid, event)
    case 'getLogs':
      return await getLogs(openid, event)
    case 'exportLogs':
      return await exportLogs(openid, event)
    case 'getStreak':
      return await getStreak(openid, event)
    case 'deleteHabit':
      return await deleteHabit(openid, event)
    // 修复 Bug3：新增 updateHabit action，支持编辑习惯
    case 'updateHabit': {
      const { habitId, name, icon, frequency, weekDays, targetDays } = event
      if (!habitId) return { code: -1, msg: '缺少习惯ID' }
      try {
        // 归属权校验
        const habitDoc = await db.collection('habits').doc(habitId).get()
        if (!habitDoc.data || habitDoc.data._openid !== openid) {
          return { code: -1, msg: '无权修改该习惯' }
        }
        const updateData = {}
        if (name !== undefined) {
          const trimmed = String(name).trim()
          if (!trimmed) return { code: -1, msg: '请输入习惯名称' }
          if (trimmed.length > 20) return { code: -1, msg: '习惯名称不能超过 20 个字符' }
          updateData.name = trimmed
        }
        if (icon) updateData.icon = String(icon).slice(0, 8)
        if (frequency) {
          if (!['daily', 'weekly'].includes(frequency)) return { code: -1, msg: '频率参数错误' }
          updateData.frequency = frequency
        }
        if (Array.isArray(weekDays)) {
          updateData.weekDays = weekDays.filter(d => Number.isInteger(d) && d >= 1 && d <= 7)
        }
        if (targetDays !== undefined) updateData.targetDays = Math.max(parseInt(targetDays, 10) || 0, 0)
        updateData.updatedAt = new Date()
        await db.collection('habits').where({ _id: habitId }).update({ data: updateData })
        return { code: 0, msg: '更新成功' }
      } catch (e) {
        return { code: -1, msg: '更新失败', error: e.message }
      }
    }
    default:
      return { code: -1, msg: '未知操作' }
  }
}

/**
 * 创建习惯
 * @param {string} openid - 用户openid
 * @param {Object} params - { name, icon, frequency, targetDays }
 */
async function addHabit(openid, params) {
  const { name, icon, frequency, targetDays } = params
  const habitName = String(name || '').trim()
  if (!habitName) return { code: -1, msg: '请输入习惯名称' }
  if (habitName.length > 20) return { code: -1, msg: '习惯名称不能超过 20 个字符' }

  try {
    const result = await db.collection('habits').add({
      data: {
        _openid: openid,
        name: habitName,
        icon: String(icon || '📌').slice(0, 8),
        frequency: frequency || 'daily', // daily | weekly
        weekDays: params.weekDays || [], // 每周模式下的具体周几
        targetDays: targetDays || 0,
        createdAt: db.serverDate()
      }
    })
    return { code: 0, msg: '创建成功', data: result }
  } catch (e) {
    return { code: -1, msg: '创建失败', error: e.message }
  }
}

/**
 * 获取当前用户所有习惯，附带今日打卡状态和连续天数
 */
async function listHabits(openid) {
  try {
    // 获取所有习惯
    let habits = []
    try {
      const result = await db.collection('habits')
        .where({ _openid: openid })
        .orderBy('createdAt', 'asc')
        .limit(MAX_ROWS)
        .get()
      habits = result.data || []
    } catch (e) {
      console.error('[listHabits] 查询habits失败:', e)
      return { code: -1, msg: '获取习惯列表失败: ' + e.message }
    }

    if (!habits || habits.length === 0) {
      return { code: 0, data: [] }
    }

    const today = getTodayStr()

    // 批量查询所有习惯的今日打卡记录（避免 N+1 查询）
    let todayLogsMap = {}
    try {
      const { data: allTodayLogs } = await db.collection('habit_logs')
        .where({ _openid: openid, date: today })
        .limit(MAX_ROWS)
        .get()
      allTodayLogs.forEach(log => {
        if (!todayLogsMap[log.habitId]) todayLogsMap[log.habitId] = []
        todayLogsMap[log.habitId].push(log)
      })
    } catch (e) {
      // habit_logs 集合不存在时忽略
    }

    // 批量查询所有习惯近365天的打卡记录（用于连续天数计算）
    const startDate = getDateStrBefore(today, 365)
    let allLogsMap = {}
    try {
      const { data: allLogs } = await db.collection('habit_logs')
        .where({ _openid: openid, date: _.gte(startDate) })
        .field({ habitId: 1, date: 1 })
        .limit(MAX_ROWS)
        .get()
      allLogs.forEach(log => {
        if (!allLogsMap[log.habitId]) allLogsMap[log.habitId] = []
        allLogsMap[log.habitId].push(log)
      })
    } catch (e) {
      // 集合不存在时忽略
    }

    // 在内存中组装结果（只查 2 次数据库，而非 2N 次）
    const result = habits.map(habit => {
      const todayLogs = todayLogsMap[habit._id] || []
      const habitLogs = allLogsMap[habit._id] || []
      return {
        ...habit,
        checkedIn: todayLogs.length > 0,
        streak: calcStreakFromLogs(habitLogs, today, habit.frequency, habit.weekDays)
      }
    })

    return { code: 0, data: result }
  } catch (e) {
    return { code: -1, msg: '获取失败: ' + e.message }
  }
}

/**
 * 打卡
 * @param {string} openid
 * @param {Object} params - { habitId, date, note }
 */
async function checkIn(openid, params) {
  const { habitId, date, note } = params
  if (!habitId) return { code: -1, msg: '缺少习惯ID' }
  const checkDate = date || getTodayStr()

  // 前端 todayDate 只在 onLoad 算，跨过零点仍会提交昨天的日期；服务端必须自己把关
  if (!isValidDateStr(checkDate)) {
    return { code: -1, msg: '打卡日期格式错误（应为 YYYY-MM-DD）' }
  }
  const today = getTodayStr()
  if (checkDate > today) {
    return { code: -1, msg: '不能打卡未来日期' }
  }
  if (checkDate < getDateStrBefore(today, 365)) {
    return { code: -1, msg: '只能补打近一年内的卡' }
  }

  // 幂等键：同人+同习惯+同日恒定 → 并发重复写入由数据库主键唯一性兜底拦截
  const dedupeId = crypto.createHash('md5')
    .update(openid + '|' + habitId + '|' + checkDate)
    .digest('hex')

  try {
    // 查重：提前提示 + 拦截旧随机 _id 历史数据的重复打卡；并发防重由主键兜底
    let existing = []
    try {
      existing = await findExistingLog(openid, habitId, checkDate)
    } catch (e) {
      // 结果不明时先停下（fail-closed）：仅"集合不存在"这一确定错误可继续，
      // 超时等未知错误一律返回失败，避免按无记录写入造成重复
      if (!isCollectionNotExist(e)) {
        return { code: -1, msg: '打卡失败，请重试', error: e.message }
      }
      existing = []
    }

    if (existing.length > 0) {
      return { code: -2, msg: '今天已经打过卡啦，明天继续加油！' }
    }

    // 写入打卡记录（指定幂等 _id；habit_logs 按需创建：集合不存在时先建表再重试一次）
    const logData = {
      _id: dedupeId,
      _openid: openid,
      habitId: habitId,
      date: checkDate,
      note: String(note || '').slice(0, 100),
      createdAt: db.serverDate()
    }
    let result
    try {
      result = await db.collection('habit_logs').add({ data: logData })
    } catch (writeErr) {
      // 集合不存在（约 -502005）→ 建表重试一次
      if (isCollectionNotExist(writeErr)) {
        try {
          await db.createCollection('habit_logs')
          result = await db.collection('habit_logs').add({ data: logData })
        } catch (retryErr) {
          return await resolveWriteFailure(retryErr, openid, habitId, checkDate)
        }
      } else {
        return await resolveWriteFailure(writeErr, openid, habitId, checkDate)
      }
    }

    // 计算最新连续天数
    let streak = 0
    try {
      const habit = await db.collection('habits').doc(habitId).get()
      streak = await calcStreak(openid, habitId, habit.data.frequency, habit.data.weekDays)
    } catch (e) {
      streak = 0
    }

    return { code: 0, msg: '打卡成功！', data: result, streak: streak }
  } catch (e) {
    return { code: -1, msg: '打卡失败', error: e.message }
  }
}

/**
 * 撤销打卡（checkIn 的逆操作）
 * 打错卡原先无任何出口：记录会永久存在，连续天数随之虚高。
 * 定位方式与 checkIn 对称——同一幂等键，故也兼容修复前写入的随机 _id 历史数据。
 * @param {string} openid
 * @param {Object} params - { habitId, date } date 缺省为今天
 */
async function unCheckIn(openid, params) {
  const { habitId, date } = params
  if (!habitId) return { code: -1, msg: '缺少习惯ID' }
  const targetDate = date || getTodayStr()
  if (!isValidDateStr(targetDate)) {
    return { code: -1, msg: '日期格式错误（应为 YYYY-MM-DD）' }
  }

  let habit
  try {
    habit = await db.collection('habits').doc(habitId).get()
  } catch (e) {
    return { code: -1, msg: '习惯不存在', error: e.message }
  }
  if (!habit.data || habit.data._openid !== openid) {
    return { code: -1, msg: '无权撤销该习惯的打卡' }
  }

  // 查询结果不明时 fail-closed：不能把"没查到"当成"没有记录"
  let logs
  try {
    logs = await findExistingLog(openid, habitId, targetDate)
  } catch (e) {
    if (isCollectionNotExist(e)) return { code: -2, msg: '该日期没有打卡记录' }
    return { code: -1, msg: '撤销失败，请重试', error: e.message }
  }
  if (logs.length === 0) return { code: -2, msg: '该日期没有打卡记录' }

  let removeErr = null
  try {
    for (let i = 0; i < logs.length; i++) {
      await db.collection('habit_logs').doc(logs[i]._id).remove()
    }
  } catch (e) {
    removeErr = e
  }

  // 以"重查后还剩几条"为唯一判据：remove 抛错但记录确已消失（并发撤销）也算成功
  let remaining = 0
  try {
    remaining = (await findExistingLog(openid, habitId, targetDate)).length
  } catch (e) {
    remaining = removeErr ? logs.length : 0
  }
  if (remaining > 0) {
    return {
      code: -1,
      msg: '撤销未完成，请重试',
      error: removeErr ? removeErr.message : '',
      data: { remaining }
    }
  }

  let streak = 0
  try {
    streak = await calcStreak(openid, habitId, habit.data.frequency, habit.data.weekDays)
  } catch (e) {
    streak = 0
  }
  return { code: 0, msg: '已撤销', data: { removed: logs.length, remaining }, streak }
}

/**
 * 获取指定习惯的打卡记录
 * @param {string} openid
 * @param {Object} params - { habitId, month } month格式: YYYY-MM
 */
async function getLogs(openid, params) {
  const { habitId, month } = params
  if (!habitId) return { code: -1, msg: '缺少习惯ID' }
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return { code: -1, msg: '月份格式错误（应为 YYYY-MM）' }
  }

  try {
    // 构造月份起止日期
    const startDate = month ? `${month}-01` : `${getTodayStr().substring(0, 7)}-01`
    const endDate = month ? `${month}-31` : `${getTodayStr().substring(0, 7)}-31`

    let logs = []
    try {
      const { data } = await db.collection('habit_logs')
        .where({
          _openid: openid,
          habitId: habitId,
          date: _.gte(startDate).and(_.lte(endDate))
        })
        .orderBy('date', 'desc')
        .get()
      logs = data || []
    } catch (e) {
      // habit_logs 集合不存在时视为无记录（从未打过卡）
    }

    return { code: 0, data: logs }
  } catch (e) {
    return { code: -1, msg: '获取记录失败', error: e.message }
  }
}

/**
 * 导出打卡记录（口径与 bookkeeping 的 export 对齐：返回原始行 + truncated 标记，
 * CSV 拼装放前端，与记账那边一致）
 * @param {string} openid
 * @param {Object} params - { month } month 缺省为导出全部
 */
async function exportLogs(openid, params) {
  const { month } = params || {}
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return { code: -1, msg: '月份格式错误（应为 YYYY-MM）' }
  }

  // 单次 get() 上限 1000 条，9 个习惯跑一年就有 3000+ 条，必须翻页而不是只取第一页
  const MAX_EXPORT = 5000

  try {
    let nameMap = {}
    try {
      const { data: habits } = await db.collection('habits')
        .where({ _openid: openid })
        .limit(MAX_ROWS)
        .get()
      ;(habits || []).forEach(h => { nameMap[h._id] = h.name })
    } catch (e) {
      // 无习惯或集合不存在：导出的行里习惯名回落为占位文案
    }

    const cond = { _openid: openid }
    if (month) cond.date = _.gte(month + '-01').and(_.lt(month + '-32'))

    const rows = []
    let truncated = false
    while (true) {
      const { data: page } = await db.collection('habit_logs')
        .where(cond)
        .orderBy('_id', 'asc')
        .skip(rows.length)
        .limit(MAX_ROWS)
        .get()
      const batch = page || []
      for (let i = 0; i < batch.length; i++) rows.push(batch[i])
      if (batch.length < MAX_ROWS) break
      if (rows.length >= MAX_EXPORT) {
        truncated = true
        break
      }
    }

    return {
      code: 0,
      truncated: truncated,
      data: rows
        // 翻页按 _id 排序（skip 必须配稳定序），但导出给用户的 CSV 要按日期读
        .sort((a, b) => (a.date === b.date ? 0 : (a.date < b.date ? -1 : 1)))
        .map(l => ({
          habitName: nameMap[l.habitId] || '（已删除的习惯）',
          habitId: l.habitId,
          date: l.date,
          note: l.note || ''
        }))
    }
  } catch (e) {
    if (isCollectionNotExist(e)) return { code: 0, data: [], truncated: false }
    return { code: -1, msg: '导出失败', error: e.message }
  }
}

/**
 * 计算指定习惯的连续打卡天数
 * @param {string} openid
 * @param {Object} params - { habitId }
 */
async function getStreak(openid, params) {
  const { habitId } = params
  try {
    const habit = await db.collection('habits').doc(habitId).get()
    const streak = await calcStreak(openid, habitId, habit.data.frequency, habit.data.weekDays)
    return { code: 0, data: streak }
  } catch (e) {
    return { code: -1, msg: '计算失败', error: e.message }
  }
}

/**
 * 删除习惯及其所有打卡记录
 * @param {string} openid
 * @param {Object} params - { habitId }
 */
async function deleteHabit(openid, params) {
  const { habitId } = params
  try {
    // 校验归属权
    const habit = await db.collection('habits').doc(habitId).get()
    if (!habit.data || habit.data._openid !== openid) {
      return { code: -1, msg: '无权删除该习惯' }
    }

    // 批量删除打卡记录（每次 where.remove 最多删 20 条，循环直到清空；
    // habit_logs 集合不存在时视为无记录，跳过清理直接删习惯）
    try {
      while (true) {
        const { data: batch } = await db.collection('habit_logs')
          .where({ _openid: openid, habitId: habitId })
          .limit(20)
          .get()
        if (!batch || batch.length === 0) break
        for (const log of batch) {
          await db.collection('habit_logs').doc(log._id).remove()
        }
      }
    } catch (e) {
      // 集合不存在时忽略（该用户从未打过卡）
    }

    // 删除习惯
    await db.collection('habits').doc(habitId).remove()

    return { code: 0, msg: '删除成功' }
  } catch (e) {
    return { code: -1, msg: '删除失败', error: e.message }
  }
}

// ===== 辅助函数 =====

/**
 * 查询某用户某习惯某日的打卡记录（checkIn 查重与写入失败后确认共用）
 */
async function findExistingLog(openid, habitId, checkDate) {
  const result = await db.collection('habit_logs')
    .where({
      _openid: openid,
      habitId: habitId,
      date: checkDate
    })
    .get()
  return result.data || []
}

/**
 * 写入失败后的统一裁决：重查确认。
 * 查到记录 = 并发竞态下对手已完成打卡（主键冲突）→ 按"已打卡"返回；
 * 查不到 = 真实写入错误 → 返回失败，绝不盲目重写。
 */
async function resolveWriteFailure(err, openid, habitId, checkDate) {
  try {
    const confirmed = await findExistingLog(openid, habitId, checkDate)
    if (confirmed.length > 0) {
      return { code: -2, msg: '今天已经打过卡啦，明天继续加油！' }
    }
  } catch (e) {
    // 确认查询也失败，按写失败处理
  }
  return { code: -1, msg: '打卡失败', error: err.message }
}

/**
 * 判断数据库错误是否为"集合不存在"（约 -502005）
 * 仅这一确定错误可走建表重试；超时等结果不明错误必须区分开
 */
function isCollectionNotExist(e) {
  if (!e) return false
  if (e.errCode === -502005) return true
  return /not exists|COLLECTION_NOT_EXIST/i.test(e.errMsg || e.message || '')
}

/**
 * 获取今天的日期字符串 YYYY-MM-DD
 */
function getTodayStr() {
  const now = new Date()
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const y = utc8.getUTCFullYear()
  const m = String(utc8.getUTCMonth() + 1).padStart(2, '0')
  const d = String(utc8.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 获取 N 天前的日期字符串 YYYY-MM-DD
 */
function getDateStrBefore(dateStr, days) {
  const parts = dateStr.split('-')
  const d = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])))
  d.setUTCDate(d.getUTCDate() - days)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 计算连续打卡天数（核心逻辑）
 * 从昨天开始往前数，连续有打卡记录的天数
 * 如果今天已打卡，则从今天开始算
 */
async function calcStreak(openid, habitId, frequency, weekDays) {
  const today = getTodayStr()
  const startDate = getDateStrBefore(today, 365)
  const { data: allLogs } = await db.collection('habit_logs')
    .where({ _openid: openid, habitId: habitId, date: _.gte(startDate) })
    .field({ date: 1 })
    .limit(MAX_ROWS)
    .get()
  return calcStreakFromLogs(allLogs, today, frequency, weekDays)
}

/**
 * 从已加载的打卡记录计算连续天数（纯内存计算，无数据库查询）
 * listHabits 批量优化和 calcStreak 单条查询共用此函数
 */
function calcStreakFromLogs(logs, today, frequency, weekDays) {
  const dateSet = new Set((logs || []).map(l => l.date))

  let streak = 0
  let checkDate = new Date()
  checkDate = new Date(checkDate.getTime() + 8 * 60 * 60 * 1000)

  const todayStr = formatDateStr(checkDate)
  if (!dateSet.has(todayStr)) {
    checkDate.setUTCDate(checkDate.getUTCDate() - 1)
  }

  for (let i = 0; i < 365; i++) {
    const dateStr = formatDateStr(checkDate)

    if (frequency === 'weekly' && weekDays && weekDays.length > 0) {
      const dayOfWeek = checkDate.getUTCDay()
      const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek
      if (!weekDays.includes(adjustedDay)) {
        checkDate.setUTCDate(checkDate.getUTCDate() - 1)
        continue
      }
    }

    if (dateSet.has(dateStr)) {
      streak++
      checkDate.setUTCDate(checkDate.getUTCDate() - 1)
    } else {
      break
    }
  }

  return streak
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDateStr(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
