// pages/habit/habit.js
// 习惯打卡 - 列表页

const app = getApp()
const { todayStr } = require('../../utils/date.js')
const { toCsv } = require('../../utils/csv.js')

Page({
  data: {
    // 今日日期信息
    todayDate: '',      // YYYY-MM-DD
    todayDisplay: '',   // 显示用日期文字
    weekDay: '',        // 星期几

    // 习惯列表
    habitList: [],
    loading: true,
    loadError: false,

    // 打卡成功提示
    showEncourage: false,
    encourageText: '',

    // 最高连续（全部习惯取最大）
    maxStreak: 0,
    posting: false,
    exporting: false,

    // 长按操作菜单
    showActionSheet: false,
    currentHabit: null
  },

  onLoad: function () {
    this.initDate()
  },

  onShow: function () {
    // 每次显示页面时刷新列表（从添加页返回时也能刷新）
    // 日期必须一起重算：打卡的 date 取自 todayDate，只在 onLoad 算的话，
    // 23:59 打开页面、00:01 点打卡就会把卡打到昨天（云函数侧现在会直接拒收）
    this.initDate()
    this.loadHabits()
  },

  onUnload: function () {
    this._destroyed = true
    if (this._encourageTimer) {
      clearTimeout(this._encourageTimer)
      this._encourageTimer = null
    }
  },

  /**
   * 初始化今日日期显示
   */
  initDate: function () {
    const now = new Date()
    const weekNames = ['日', '一', '二', '三', '四', '五', '六']
    const m = now.getMonth() + 1
    const d = now.getDate()

    this.setData({
      todayDate: todayStr(now),
      todayDisplay: `${m}月${d}日`,
      weekDay: `星期${weekNames[now.getDay()]}`
    })
  },

  /**
   * 加载习惯列表
   */
  loadHabits: function () {
    this.setData({ loading: true })

    wx.cloud.callFunction({
      name: 'habit',
      data: { action: 'listHabits' }
    }).then(res => {
      // 云函数超时/崩溃时 res.result 可能是 undefined，直接取 .code 会抛 TypeError 卡住 loading
      const r = (res && res.result) || {}
      if (r.code === 0) {
        const list = r.data || []
        // 全部习惯中的最高连续天数
        const maxStreak = list.reduce(function (m, h) { return Math.max(m, h.streak || 0) }, 0)
        this.setData({
          habitList: list,
          maxStreak: maxStreak,
          loading: false,
          loadError: false
        })
      } else {
        this.setData({ loading: false, loadError: true })
        wx.showToast({ title: r.msg || '加载失败', icon: 'none' })
      }
    }).catch(err => {
      console.error('加载习惯列表失败', err)
      this.setData({ loading: false, loadError: true })
      wx.showToast({ title: '网络错误', icon: 'none' })
    })
  },

  /**
   * 点击卡片 - 打卡
   */
  onCardTap: function (e) {
    if (this._checkingIn) return
    const habit = e.currentTarget.dataset.habit
    if (habit.checkedIn) {
      // 已打卡，跳转到日历视图
      // frequency/weekDays 一并带过去：日历页要按习惯频率算「本月应打卡天数」，否则 weekly 习惯拿整月天数当分母
      wx.navigateTo({
        url: `/pages/habit/calendar?habitId=${habit._id}&habitName=${encodeURIComponent(habit.name)}&habitIcon=${encodeURIComponent(habit.icon)}&frequency=${habit.frequency || 'daily'}&weekDays=${encodeURIComponent(JSON.stringify(habit.weekDays || []))}`
      })
      return
    }

    // 未打卡，执行打卡
    this._checkingIn = true
    wx.cloud.callFunction({
      name: 'habit',
      data: {
        action: 'checkIn',
        habitId: habit._id,
        date: this.data.todayDate
      }
    }).then(res => {
      const r = (res && res.result) || {}
      if (r.code === 0) {
        // 打卡成功：震动反馈 + 鼓励文字
        wx.vibrateShort({ type: 'medium' })
        const encourages = [
          '太棒了！坚持就是胜利！',
          '又完成一天，继续加油！',
          '你真棒！习惯正在养成中～',
          '坚持的力量，为你点赞！',
          '每一小步都是大进步！'
        ]
        const text = encourages[Math.floor(Math.random() * encourages.length)]
        this.setData({
          showEncourage: true,
          encourageText: text
        })

        // 2秒后隐藏鼓励（页面已卸载则不再 setData）
        if (this._encourageTimer) clearTimeout(this._encourageTimer)
        this._encourageTimer = setTimeout(() => {
          if (this._destroyed) return
          this.setData({ showEncourage: false })
        }, 2000)

        // 刷新列表
        this.loadHabits()
      } else if (r.code === -2) {
        // 重复打卡（含并发主键冲突后的确认）：不是失败，刷新列表让卡片按「已打卡」呈现
        wx.showToast({ title: r.msg || '今天已经打过卡啦', icon: 'none' })
        this.loadHabits()
      } else {
        wx.showToast({ title: r.msg || '打卡失败', icon: 'none' })
      }
    }).catch(err => {
      console.error('打卡失败', err)
      wx.showToast({ title: '打卡失败', icon: 'none' })
    }).finally(() => {
      this._checkingIn = false
    })
  },

  /**
   * 长按卡片 - 显示操作菜单
   */
  onCardLongPress: function (e) {
    const habit = e.currentTarget.dataset.habit
    this.setData({ currentHabit: habit, showActionSheet: true })
  },

  /**
   * 关闭操作菜单
   */
  closeActionSheet: function () {
    this.setData({ showActionSheet: false, currentHabit: null })
  },

  /**
   * 空事件占位：弹层内容器用 catchtap="noop" 阻止冒泡到遮罩（否则会误触关闭）
   */
  noop: function () {},

  /**
   * 编辑习惯
   */
  onEditHabit: function () {
    const habit = this.data.currentHabit
    this.setData({ showActionSheet: false })
    wx.navigateTo({
      url: `/pages/habit/add?id=${habit._id}&name=${encodeURIComponent(habit.name)}&icon=${encodeURIComponent(habit.icon)}&frequency=${habit.frequency}&targetDays=${habit.targetDays || 0}&weekDays=${encodeURIComponent(JSON.stringify(habit.weekDays || []))}`
    })
  },

  /**
   * 删除习惯（二次确认）
   */
  onDeleteHabit: function () {
    const habit = this.data.currentHabit
    this.setData({ showActionSheet: false })

    wx.showModal({
      title: '确认删除',
      content: `确定要删除「${habit.name}」吗？所有打卡记录也会被清除。`,
      confirmColor: '#FF5252',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'habit',
            data: {
              action: 'deleteHabit',
              habitId: habit._id
            }
          }).then(res => {
            const r = (res && res.result) || {}
            if (r.code === 0) {
              wx.showToast({ title: '已删除', icon: 'success' })
              this.loadHabits()
            } else {
              wx.showToast({ title: r.msg || '删除失败', icon: 'none' })
            }
          }).catch(err => {
            // 删除习惯失败错误处理
            console.error('删除习惯失败:', err)
            wx.showToast({ title: '删除失败', icon: 'none' })
          })
        }
      }
    })
  },

  /**
   * 撤销今日打卡（长按卡片 → 操作菜单）
   * 打错卡此前没有任何出口：记录会永久留着，连续天数随之虚高
   */
  onUndoCheckIn: function () {
    const habit = this.data.currentHabit
    this.setData({ showActionSheet: false })
    if (!habit || !habit.checkedIn) return

    const that = this
    wx.showModal({
      title: '撤销今日打卡',
      content: `确定撤销「${habit.name}」今天的打卡吗？连续天数会相应回退。`,
      confirmText: '撤销',
      confirmColor: '#FF5252',
      success: function (m) {
        if (!m.confirm || that._destroyed) return
        wx.cloud.callFunction({
          name: 'habit',
          data: { action: 'unCheckIn', habitId: habit._id, date: that.data.todayDate }
        }).then(res => {
          const r = (res && res.result) || {}
          if (r.code === 0) {
            wx.showToast({ title: '已撤销', icon: 'none' })
            that.loadHabits()
          } else if (r.code === -2) {
            // 记录已不在（多端同时操作或已在日历页撤销）：状态本就等价于已撤销，刷新即可，不算失败
            wx.showToast({ title: r.msg || '该日期没有打卡记录', icon: 'none' })
            that.loadHabits()
          } else {
            wx.showToast({ title: r.msg || '撤销失败', icon: 'none' })
          }
        }).catch(err => {
          console.error('[habit] 撤销打卡失败', err)
          wx.showToast({ title: '撤销失败，请重试', icon: 'none' })
        })
      }
    })
  },

  /**
   * 导出全部打卡记录为 CSV（复制到剪贴板，与记账导出同一口径）
   */
  exportRecords: function () {
    if (this.data.exporting) return
    const that = this
    this.setData({ exporting: true })

    wx.cloud.callFunction({
      name: 'habit',
      data: { action: 'exportLogs' }
    }).then(res => {
      if (that._destroyed) return
      that.setData({ exporting: false })
      const r = (res && res.result) || {}
      if (r.code !== 0) {
        wx.showToast({ title: r.msg || '导出失败', icon: 'none' })
        return
      }
      const logs = r.data || []
      if (logs.length === 0) {
        wx.showToast({ title: '还没有打卡记录可导出', icon: 'none' })
        return
      }
      const truncated = !!r.truncated
      if (truncated) wx.showToast({ title: '仅导出前 5000 条', icon: 'none' })

      wx.setClipboardData({
        data: toCsv(['日期', '习惯', '备注'], logs.map(l => [l.date, l.habitName, l.note])),
        success: function () {
          if (that._destroyed) return
          wx.showModal({
            title: '导出成功',
            content: `共 ${logs.length} 条打卡记录已复制为 CSV`
              + (truncated ? '（记录超过 5000 条，仅导出前 5000 条）' : '')
              + '，去电脑上粘贴到表格文件即可保存',
            showCancel: false,
            confirmText: '知道了'
          })
        },
        fail: function (err) {
          if (that._destroyed) return
          console.error('[habit] 复制剪贴板失败:', err)
          wx.showToast({ title: '复制失败，请重试', icon: 'none' })
        }
      })
    }).catch(err => {
      if (that._destroyed) return
      that.setData({ exporting: false })
      console.error('[habit] 导出失败', err)
      wx.showToast({ title: '网络错误，请重试', icon: 'none' })
    })
  },

  /**
   * 跳转添加习惯页
   */
  goAddHabit: function () {
    wx.navigateTo({ url: '/pages/habit/add' })
  },

  /**
   * 空状态 - 点击添加
   */
  onEmptyAction: function () {
    this.goAddHabit()
  },

  /**
   * 生成打卡海报（canvas 绘制 → 分享/保存）
   */
  generatePoster: function () {
    if (this.data.posting) return
    const list = this.data.habitList
    if (!list.length) {
      wx.showToast({ title: '先添加一个习惯吧', icon: 'none' })
      return
    }

    const done = list.filter(function (h) { return h.checkedIn }).length
    const total = list.length
    const maxStreak = this.data.maxStreak
    const checkedNames = list
      .filter(function (h) { return h.checkedIn })
      .map(function (h) { return (h.icon || '📌') + ' ' + h.name })

    this.setData({ posting: true })
    const that = this

    const query = this.createSelectorQuery()
    query.select('#posterCanvas').fields({ node: true, size: true }).exec(function (res) {
      if (!res || !res[0] || !res[0].node) {
        that.setData({ posting: false })
        wx.showToast({ title: '生成失败', icon: 'none' })
        return
      }
      const canvas = res[0].node
      const W = 600
      const H = 900
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')

      // 品牌蓝渐变底 + 装饰圆
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, '#4A94E8')
      grad.addColorStop(1, '#2E6FC0')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
      ctx.beginPath(); ctx.arc(W - 70, 130, 190, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(40, H - 150, 150, 0, Math.PI * 2); ctx.fill()

      // 头部：应用名 + 日期
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
      ctx.font = '26px sans-serif'
      ctx.fillText('生活小工具 · 习惯打卡', 48, 88)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
      ctx.font = '24px sans-serif'
      ctx.fillText(that.data.todayDate + ' ' + that.data.weekDay, 48, 126)

      // 主视觉：今日完成 x/y
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 116px sans-serif'
      ctx.fillText(done + ' / ' + total, 48, 300)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.font = '30px sans-serif'
      ctx.fillText('今日打卡完成', 48, 352)

      // 最高连续
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 56px sans-serif'
      ctx.fillText('🔥 ' + maxStreak + ' 天', 48, 456)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
      ctx.font = '26px sans-serif'
      ctx.fillText('最高连续打卡', 48, 498)

      // 完成清单（最多 5 条）
      let y = 586
      ctx.font = '28px sans-serif'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
      checkedNames.slice(0, 5).forEach(function (n) {
        ctx.fillText('✓ ' + n, 48, y)
        y += 54
      })
      if (total - done > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
        ctx.fillText('还有 ' + (total - done) + ' 个习惯等你来完成', 48, y)
      }

      // 底部落款
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.font = '22px sans-serif'
      ctx.fillText('坚持的力量，为你点赞 💪', 48, H - 56)

      wx.canvasToTempFilePath({
        canvas: canvas,
        success: function (r) {
          that.setData({ posting: false })
          if (wx.showShareImageMenu) {
            wx.showShareImageMenu({
              path: r.tempFilePath,
              fail: function () { /* 用户取消分享 */ }
            })
          } else {
            wx.saveImageToPhotosAlbum({
              filePath: r.tempFilePath,
              success: function () { wx.showToast({ title: '已保存到相册', icon: 'success' }) },
              fail: function (err) {
                that.handleAlbumSaveFail(err)
              }
            })
          }
        },
        fail: function () {
          that.setData({ posting: false })
          wx.showToast({ title: '生成失败', icon: 'none' })
        }
      })
    })
  },

  /**
   * 保存相册失败分流：用户拒绝授权要引导去设置页开权限，其余失败只提示原因
   */
  handleAlbumSaveFail: function (err) {
    const msg = (err && err.errMsg) || ''
    console.error('保存海报到相册失败:', msg)
    if (/auth|deny/i.test(msg)) {
      wx.showModal({
        title: '需要相册权限',
        content: '保存图片需要相册权限，请到「设置」中开启后重试。',
        confirmText: '去设置',
        cancelText: '取消',
        success: function (m) {
          if (m.confirm) wx.openSetting()
        }
      })
    } else {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  /**
   * 分享给好友
   */
  onShareAppMessage: function () {
    return {
      title: '我在坚持打卡，快来一起养成好习惯',
      path: '/pages/habit/index'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline: function () {
    return { title: '我在坚持打卡，快来一起养成好习惯' }
  }
})
