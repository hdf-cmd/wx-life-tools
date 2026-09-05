// cloudfunctions/habit/index.js
// 习惯打卡云函数 - 通过 action 路由实现不同功能

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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
    case 'getLogs':
      return await getLogs(openid, event)
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
        if (name) updateData.name = name
        if (icon) updateData.icon = icon
        if (frequency) updateData.frequency = frequency
        if (weekDays !== undefined) updateData.weekDays = weekDays
        if (targetDays !== undefined) updateData.targetDays = targetDays
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
  if (!name) return { code: -1, msg: '请输入习惯名称' }

  try {
    const result = await db.collection('habits').add({
      data: {
        _openid: openid,
        name: name,
        icon: icon || '📌',
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
  const checkDate = date || getTodayStr()

  try {
    // 检查是否重复打卡
    let existing = []
    try {
      const result = await db.collection('habit_logs')
        .where({
          _openid: openid,
          habitId: habitId,
          date: checkDate
        })
        .get()
      existing = result.data || []
    } catch (e) {
      // habit_logs 集合不存在时视为无记录
      existing = []
    }

    if (existing.length > 0) {
      return { code: -2, msg: '今天已经打过卡啦，明天继续加油！' }
    }

    // 写入打卡记录（habit_logs 按需创建：集合不存在时先建表再重试一次）
    const logData = {
      _openid: openid,
      habitId: habitId,
      date: checkDate,
      note: note || '',
      createdAt: db.serverDate()
    }
    let result
    try {
      result = await db.collection('habit_logs').add({ data: logData })
    } catch (writeErr) {
      // 集合不存在（约 -502005）→ 建表重试
      try {
        await db.createCollection('habit_logs')
        result = await db.collection('habit_logs').add({ data: logData })
      } catch (retryErr) {
        return { code: -1, msg: '打卡失败', error: retryErr.message }
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
 * 获取指定习惯的打卡记录
 * @param {string} openid
 * @param {Object} params - { habitId, month } month格式: YYYY-MM
 */
async function getLogs(openid, params) {
  const { habitId, month } = params
  if (!habitId) return { code: -1, msg: '缺少习惯ID' }

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
