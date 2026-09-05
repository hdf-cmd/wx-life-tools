# life-toolkit 微信小程序

生活小工具集合（微信云开发）：记账 / 习惯打卡 / 随机工具（掷骰子、喝什么→附近品牌）/ 工具箱。

## 📌 项目交接

### 进行到
- **四梯队体验改进 ✅ 已完成（2026-09-05，4 个提交）**
  - 第一梯队：记账列表分页（50条/页+触底加载，修数据截断隐患）、darkmode+theme.json、工具箱意见反馈、索引步骤入文档
  - 第二梯队：账单编辑（get/update+所有权校验）、月度预算（budgets 集合+三态进度条）、近6月趋势图（纯 view 柱状图，点柱切月）、CSV 导出（剪贴板）；沙箱测试 17/17
  - 第三梯队：首页「最高连续」统计卡、打卡震动反馈、12 页分享（onShareAppMessage/Timeline）、打卡海报（canvas 2d）、日历页最长连续
  - 第四梯队：首页「随机一下」卡（2×2 网格补全，玫红骰子图标 card-random.png）、记账/习惯列表骨架屏、首页数字滚动动效
  - ⚠️ 部署提醒：`bookkeeping` 云函数有大量新增 action，需重新上传部署
- **提醒功能 ✅ 已整体删除（2026-09-05，用户决策）**
  - 移除内容：Tab（5→4）、`pages/reminder/`、`cloudfunctions/reminder/`、`app.js` 到期检查、首页提醒统计卡与入口、bell 图标
  - 删除原因：实测离线推送是死链路（定时器事件无 `action` 未路由 + `config.json` 缺 `subscribeMessage.send` 权限声明 + 订阅消息一次授权一条推送的平台限制），仅剩应用内弹窗价值有限
  - ⚠️ 云端善后：云开发控制台手动删 `reminder` 云函数（含 30 分钟定时触发器）与 `reminders` 集合；本地 git 暂存区仍保留原文件，需要可恢复
- **安全与成本加固 ✅ 代码已完成（2026-09-05，待部署验证；unwatermark 部分当日已按用户要求回退至加固前版本，仅保留以下两项）**
  - `cloudfunctions/nearby/index.js`：**v11-logredact**，高德请求日志脱敏（Key 不再进云函数日志）；可用 `action:'version'` 自检云端版本
  - `miniprogram/app.js`：**删除 60 秒全局轮询**，到期提醒改为 `App.onShow` + 登录成功后各检查一次（云函数侧标记 expired 防重复弹窗，语义不变）；每用户云函数调用量从 ~60 次/小时 降为按次
  - ⚠️ 部署提醒：需重新上传 `nearby` 云函数
- **去水印功能实测（2026-09-05）：皮皮虾 ✅；抖音 ⚠️ 签名链路间歇性 403（约50%成功率，非全面失效）；小红书 ⚠️ 受 xsec_token 门槛影响**
  - 测试方式：本地沙箱桩件（模拟 wx-server-sdk）+ 真实源码 + 真实网络
  - 当日曾实现 unwatermark 加固（限流/100MB 上限/7天清理）与抖音 Cookie 方案（v12-cookie，移植上游 `DouyinParser.php` 的 `user/self?modal_id` + RENDER_DATA 提取），已按用户要求**整体回退**；如需恢复，配方记录在 HANDOVER 第六节，备份在 `%TEMP%/unwatermark-backup-20260905`
- **「附近品牌」功能 ✅ 已完成并验证通过（2026-08-26）**
  - `pages/random/drink/index.js`：**零改动**
  - `miniprogram/utils/map.js`：云函数调用版（`wx.cloud.callFunction('nearby')`），返回 POI 数组形状 `{title, address, location:{lat,lng}, _distance, category}`
  - `cloudfunctions/nearby/index.js`：**v9-envkey**，代理【高德地图】周边搜索 `restapi.amap.com/v3/place/around` + 逆地理编码 `/v3/geocode/regeo`；**Key 只读环境变量 `AMAP_KEY`**（代码内已无密钥，未配置时返回明确报错）
  - 前端「附近品牌」带 **24h 本地缓存**（`nearby_pois_{lat},{lng}`，同坐标当天只查一次高德）
  - 验证记录：本地直连高德 `infocode:10000`；小程序「附近品牌」列表与定位展示条均正常
  - 项目 AppID：`wxf676b631dbbc8e32`；云环境：`cloud1-d6g4x9h9m507b429c`
- **12 品牌饮品菜单已按 2026 在售情况重写（2026-08-26）**
  - `miniprogram/pages/random/drink/index.js` 的 `BRAND_DATA`：删除疑似下架/虚构款（原古茗/沪上"芝士水果全家桶"等），加入 2026 在售新品（霸王茶姬走走系列、沪上摩登玉兰系列、古茗泰橘系列等），价格按"子代理经确认价 → 原价 → 同系列约价"补齐
  - 现共 282 款（喜茶20/奈雪20/蜜雪26/茶百道26/古茗24/沪上20/霸王22/书亦20/一点点22/CoCo25/茶颜23/瑞幸34）
  - 研究原始数据：工作区 `brand_menus_2026.json`（仅 C 组 4 品牌）+ 3 个子代理结论（对话内）
  - ⚠️ 价格多为其后参考价/约价，最终需用户对照门店小程序菜单微调

### 关键决定
- POI 搜索采用【高德地图 Web 服务】替代腾讯位置服务：
  - 腾讯路线排障一整天无法收敛（详见"坑"）
  - 高德错误码清晰（`10000` 成功 / `10001` Key 无效 / `10003` 无权限），个人免费额度够用
  - 前端链路不变（仍调 `nearby` 云函数），Key 只存云端，切换成本仅在云函数内部

### 坑
- **腾讯位置服务（已弃用，勿回退）**：
  - Key 类型必须匹配调用场景（WebServiceAPI 类型 vs 微信小程序类型）
  - WebServiceAPI 需在 Key「启用产品」中勾选，否则 `status=199`
  - 接口配额需在控制台「配额分配」页单独给 Key 分配；配额为 0 时表现为 `status=113/121`
  - `boundary` 参数的括号/逗号必须**字面不编码**，编码 → HTTP 301 → `status=113`
  - 请求路径不能拼成双斜杠 `//ws/...`（`/${API_PATH}` 且 API_PATH 自带 `/` 所致），会 301 且跟随仍 113
  - 云函数机房 IP 调用腾讯存在无法解释的 113（probe 成功、真实调用失败并存）
  - 官方状态码表：https://lbs.qq.com/service/webService/webServiceGuide/status
- **高德**：`location` 参数顺序是 `经度,纬度`（与腾讯 `lat,lng` 相反），云函数里已转换
- 微信开发者工具模拟器来源（devtools）与真机来源（真实 AppID）对小程序类型 Key 的校验有差异

### 下一步
- [✅ 已接续] 「附近品牌」24h 本地缓存（2026-08-26 完成）
- [✅ 已接续] 高德 Key 移入环境变量 `AMAP_KEY`（2026-08-26 完成，代码内已无密钥）
- [✅ 已接续] 安全与成本加固：AMAP_KEY 日志脱敏 / 提醒轮询改 onShow（2026-09-05 代码完成，**待用户部署云端**）；unwatermark 加固与 Cookie 方案当日已回退
- [待用户] 清理不再使用的腾讯 Key（`2GHBZ`/`ZIBBZ`/`BALBZ`/`YREBZ`）及对应配额分配（腾讯位置服务控制台）
- [待用户] 云数据库建索引（云开发控制台 → 数据库 → 集合 → 索引管理，2 分钟）：`accounts` 建组合索引 `_openid` 升序 + `date` 降序；`habit_logs`（若已创建）建 `_openid` 升序 + `date` 降序
- [待用户] unwatermark 是否保留上线（合规风险：内置签名逆向、品牌 logo 版权）；云存储转存视频无自动清理，建议在云开发控制台手动清理旧文件
- [待办] 其他 Tab（记账/习惯）的功能完善