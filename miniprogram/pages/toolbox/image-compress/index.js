// pages/toolbox/image-compress/index.js
// 工具箱 - 图片压缩

Page({
  data: {
    images: [],      // [{ path, size, sizeText, width, height, resultPath, resultSize, resultSizeText }]
    quality: 80,     // 压缩质量 1-100
    compressing: false
  },

  /**
   * 选择图片（支持多张）
   */
  chooseImages: function () {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['original'],
      success: res => {
        const list = res.tempFiles.map(f => ({
          path: f.tempFilePath,
          size: f.size,
          sizeText: this._fmtSize(f.size),
          width: f.width || 0,
          height: f.height || 0,
          resultPath: '',
          resultSize: 0,
          resultSizeText: ''
        }))
        this.setData({ images: list })
      },
      fail: err => {
        if (err.errMsg && !err.errMsg.includes('cancel')) {
          wx.showToast({ title: '选择图片失败', icon: 'none' })
        }
      }
    })
  },

  onQualityChange: function (e) {
    this.setData({ quality: e.detail.value })
  },

  /**
   * 批量压缩
   */
  doCompress: function () {
    if (this.data.images.length === 0) {
      wx.showToast({ title: '请先选择图片', icon: 'none' })
      return
    }
    if (this.data.compressing) return

    this.setData({ compressing: true })
    wx.showLoading({ title: '压缩中...', mask: true })

    const tasks = this.data.images.map(img =>
      new Promise(resolve => {
        wx.compressImage({
          src: img.path,
          quality: this.data.quality,
          success: res => {
            wx.getFileInfo({
              filePath: res.tempFilePath,
              success: fi => resolve({ path: img.path, resultPath: res.tempFilePath, resultSize: fi.size }),
              fail: () => resolve({ path: img.path, resultPath: res.tempFilePath, resultSize: 0 })
            })
          },
          fail: () => resolve({ path: img.path, resultPath: '', resultSize: 0 })
        })
      })
    )

    Promise.all(tasks).then(results => {
      wx.hideLoading()
      const images = this.data.images.map(img => {
        const r = results.find(x => x.path === img.path)
        if (r && r.resultPath) {
          return Object.assign({}, img, { resultPath: r.resultPath,
            resultSize: r.resultSize,
            resultSizeText: this._fmtSize(r.resultSize) })
        }
        return img
      })
      const okCount = images.filter(i => i.resultPath).length
      this.setData({ images, compressing: false })
      wx.showToast({ title: `成功压缩 ${okCount} 张`, icon: 'none' })
    })
  },

  /**
   * 保存单张到相册
   */
  saveOne: function (e) {
    const idx = e.currentTarget.dataset.idx
    const img = this.data.images[idx]
    if (!img || !img.resultPath) return

    wx.saveImageToPhotosAlbum({
      filePath: img.resultPath,
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
   * 字节数格式化
   */
  _fmtSize: function (bytes) {
    if (!bytes && bytes !== 0) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  }
})
