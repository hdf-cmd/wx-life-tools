// pages/toolbox/screenshot/index.js
// 工具箱 - 视频截图（canvas 绘制方案，社区主流做法，兼容性好）

Page({
  data: {
    videoPath: '',
    duration: 0,       // 视频时长（秒）
    videoWidth: 0,
    videoHeight: 0,
    currentTime: 0,    // 当前选中的时间点（秒）
    timeText: '00:00',
    extracting: false,
    frameImage: '',    // 截图结果路径
    videoReady: false  // 视频元数据是否就绪
  },

  /**
   * 选择视频并读取元数据
   */
  chooseVideo: function () {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      success: res => {
        const file = res.tempFiles[0]
        wx.getVideoInfo({
          src: file.tempFilePath,
          success: info => {
            this.setData({
              videoPath: file.tempFilePath,
              duration: Math.floor(info.duration),
              videoWidth: info.width || 720,
              videoHeight: info.height || 1280,
              currentTime: 0,
              timeText: this._fmtTime(0),
              frameImage: '',
              videoReady: false
            })
          },
          fail: () => {
            wx.showToast({ title: '读取视频失败', icon: 'none' })
          }
        })
      },
      fail: err => {
        if (err.errMsg && !err.errMsg.includes('cancel')) {
          wx.showToast({ title: '选择视频失败', icon: 'none' })
        }
      }
    })
  },

  /**
   * 视频元数据就绪
   */
  onVideoLoaded: function () {
    this.setData({ videoReady: true })
  },

  /**
   * 时间滑块变化
   */
  onTimeChange: function (e) {
    const t = e.detail.value
    this.setData({ currentTime: t, timeText: this._fmtTime(t) })
  },

  /**
   * 提取当前时间点的画面
   * 原理：video 组件 seek 到目标时间 → 暂停 → 通过 selectorQuery 获取
   * video 上下文 → canvas 2d drawImage(video) → canvasToTempFilePath 导出图片
   */
  extractFrame: function () {
    if (!this.data.videoPath) {
      wx.showToast({ title: '请先选择视频', icon: 'none' })
      return
    }
    if (this.data.extracting) return

    this.setData({ extracting: true, frameImage: '' })
    wx.showLoading({ title: '提取中...', mask: true })

    // 1. 定位视频到目标时间并暂停
    const videoCtx = wx.createVideoContext('screenshot-video', this)
    videoCtx.pause()
    videoCtx.seek(this.data.currentTime)

    // 2. 等 seek 渲染完成后绘制（已播放过的视频 seek 后画面就绪较快）
    setTimeout(() => {
      this._captureFrame()
    }, 900)
  },

  /**
   * 用 canvas 截取当前视频画面
   */
  _captureFrame: function () {
    // 获取 video 上下文（canvas drawImage 的源）
    wx.createSelectorQuery().in(this)
      .select('#screenshot-video').context().exec(videoRes => {
        if (!videoRes || !videoRes[0] || !videoRes[0].context) {
          this._captureFail('获取视频上下文失败')
          return
        }
        const video = videoRes[0].context

        // 获取 2d canvas 节点
        wx.createSelectorQuery().in(this)
          .select('#frame-canvas').fields({ node: true }).exec(canvasRes => {
            if (!canvasRes || !canvasRes[0] || !canvasRes[0].node) {
              this._captureFail('获取画布失败')
              return
            }
            const canvas = canvasRes[0].node
            // 用视频真实分辨率设置画布，保证截图清晰
            const w = this.data.videoWidth
            const h = this.data.videoHeight
            canvas.width = w
            canvas.height = h

            const ctx = canvas.getContext('2d')
            ctx.clearRect(0, 0, w, h)
            try {
              ctx.drawImage(video, 0, 0, w, h)
            } catch (err) {
              console.error('[capture] drawImage 异常:', err)
              this._captureFail('绘制失败')
              return
            }

            // 导出为图片文件
            wx.canvasToTempFilePath({
              canvas: canvas,
              x: 0,
              y: 0,
              width: w,
              height: h,
              destWidth: w,
              destHeight: h,
              fileType: 'jpg',
              quality: 0.92,
              success: res => {
                // 校验是否截到空白图（文件过小通常意味着空白）
                wx.getFileInfo({
                  filePath: res.tempFilePath,
                  success: fi => {
                    if (fi.size < 1024) {
                      // 空白帧：先短暂播放再截（安卓已知问题）
                      this._retryAfterPlay()
                      return
                    }
                    wx.hideLoading()
                    this.setData({ frameImage: res.tempFilePath, extracting: false })
                  },
                  fail: () => {
                    wx.hideLoading()
                    this.setData({ frameImage: res.tempFilePath, extracting: false })
                  }
                })
              },
              fail: err => {
                console.error('[capture] 导出失败:', err)
                this._captureFail('导出图片失败')
              }
            }, this)
          })
      })
  },

  /**
   * 安卓兜底：视频从未播放过时可能截到空白，先播 200ms 再截
   */
  _retryAfterPlay: function () {
    if (this._retried) {
      this._captureFail('截图失败，请先点播放按钮播一下视频再试')
      return
    }
    this._retried = true
    console.warn('[capture] 疑似空白帧，播放后重试')
    const videoCtx = wx.createVideoContext('screenshot-video', this)
    videoCtx.play()
    setTimeout(() => {
      videoCtx.pause()
      videoCtx.seek(this.data.currentTime)
      setTimeout(() => {
        this._retried = false
        this._captureFrame()
      }, 900)
    }, 300)
  },

  /**
   * 截图失败统一处理
   */
  _captureFail: function (msg) {
    wx.hideLoading()
    this.setData({ extracting: false })
    wx.showToast({ title: msg || '截图失败，请重试', icon: 'none' })
  },

  /**
   * 保存截图到相册
   */
  saveToAlbum: function () {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.frameImage,
      success: () => {
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      },
      fail: err => {
        if (err.errMsg && err.errMsg.includes('auth')) {
          wx.showModal({
            title: '提示',
            content: '需要相册权限才能保存图片，请前往设置开启',
            success: modalRes => {
              if (modalRes.confirm) wx.openSetting()
            }
          })
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }
    })
  },

  /**
   * 秒数格式化为 分:秒
   */
  _fmtTime: function (sec) {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
  }
})
