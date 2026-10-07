// components/skeleton/skeleton.js
// 骨架屏组件 - 用于列表页加载状态展示

Component({
  /**
   * 组件属性
   */
  properties: {
    // 显示行数
    rows: {
      type: Number,
      value: 3
    },
    // 是否显示头像占位
    avatar: {
      type: Boolean,
      value: false
    },
    // 是否显示卡片占位
    card: {
      type: Boolean,
      value: false
    },
    // 是否正在加载
    loading: {
      type: Boolean,
      value: true
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    rowList: []   // wx:for 需要数组，*this 作键
  },

  /**
   * 属性变化监听：把行数展开成可循环的数组
   */
  observers: {
    'rows': function (rows) {
      this.setData({ rowList: buildRows(rows) })
    }
  },

  lifetimes: {
    // 兜底：不依赖"属性 observer 是否首帧触发"这一实现细节，挂载时再算一次
    attached: function () {
      this.setData({ rowList: buildRows(this.data.rows) })
    }
  },

  /**
   * 组件的方法
   */
  methods: {}
})

/** 行数 → 可循环数组（wx:for 需要数组，*this 作唯一键） */
function buildRows(rows) {
  const n = Math.max(parseInt(rows, 10) || 0, 0)
  const list = []
  for (let i = 0; i < n; i++) list.push(i)
  return list
}
