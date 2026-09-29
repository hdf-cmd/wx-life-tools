# life-toolkit 微信小程序

生活小工具集合（微信云开发）：记账 / 习惯打卡 / 随机工具（掷骰子、喝什么→附近品牌）/ 工具箱。

## 📌 项目交接

### 进行到
- **云端全量备份 ✅ 已完成并校验（2026-09-29；环境 2026-10-01 00:46:37 到期，尚未选定新服务器）**
  - 位置：`C:\Desktop\云端备份\cloud1-d6g4x9h9m507b429c\`，111 个文件 / 76.0 MB，**恢复按该目录 `RESTORE.md` 九步走，先读它**
  - 范围：18 个集合 345 条文档（含 `import/` 14 个可直接上传控制台的 JSONL）、44 个索引定义、18 个集合权限规则、8 个云函数代码包（sha256 逐个匹配平台 CodeSha256）、51 个静态托管文件、1 条 HTTP 网关路由、AMAP_KEY 明文（`functions/secrets.env`）
  - 按用户决策**未下载**云存储 10 个去水印测试视频内容（126,002,411 字节），只留 `storage/manifest.json` 清单
  - ⚠️ 备份自带一处失真：导出时 `JSON.stringify` 把 4 个小程序集合的 25 处 Date 字段写成了 ISO 字符串，还原工具在 `restore-tools/fix-dates/`（支持 dryRun），**不跑这步恢复出来的时间字段就是错的**
  - ⚠️ 该云环境被两个项目共用（本项目 + 食光 App `C:\Desktop\健康饮食app`），到期两边一起失效，所以备份按整个环境做，不只本项目
  - 施工方式：临时挂只读导出云函数 `export-backup-tmp` 把数据打包到云存储再本地下载（绕开对话上下文的转录失真），**用完已删除，云端函数列表已复查回到 8 个、原函数未受影响**；云存储 `backup/2026-09-29T12-50-15-134Z/` 那 18 个 JSON 副本保留未删，环境到期自动消失，可作本地损坏时的二次核对源
- **打卡并发双写修复 ✅ 已部署并核实（2026-09-11 修复，2026-09-29 经云端代码比对确认已上线）**
  - 缺陷：`checkIn` 先查后写（TOCTOU），并发下两个请求都通过查重后各写一条；云开发数据库不支持唯一索引，无数据库层兜底
  - 修复：写入改用确定性 `_id` = md5(openid|habitId|date)（32 位恰为 _id 长度上限），并发防重收敛到主键唯一性；where 查重保留（降级为体验优化 + 拦截旧随机 _id 历史数据）
  - 错误处理改 fail-closed：查重结果不明（超时等）一律返回失败、不再按无记录写入；仅"集合不存在"走建表重试；任何写入失败统一走 `resolveWriteFailure` 重查确认，查到即按"已打卡"返回，绝不盲目重写
  - 测试入库：`tests/habit-checkin.test.js` + `tests/stubs/wx-server-sdk.js`（内存桩件，主键唯一性模拟 MongoDB），6/6 通过（核心：并发双写只落一条），20 轮稳定性压测零失败；运行 `node tests/habit-checkin.test.js`
  - ✅ 部署状态已核实（2026-09-29）：云端 `habit` 函数整目录（排除 node_modules）与本地 `cloudfunctions/habit` 逐文件一致，云端 ModTime 2026-09-12 15:15 与修复提交同日——**早已上线，无需再传**
- **四梯队体验改进 ✅ 已完成（2026-09-05，4 个提交）**
  - 第一梯队：记账列表分页（50条/页+触底加载，修数据截断隐患）、darkmode+theme.json、工具箱意见反馈、索引步骤入文档
  - 第二梯队：账单编辑（get/update+所有权校验）、月度预算（budgets 集合+三态进度条）、近6月趋势图（纯 view 柱状图，点柱切月）、CSV 导出（剪贴板）；沙箱测试 17/17
  - 第三梯队：首页「最高连续」统计卡、打卡震动反馈、12 页分享（onShareAppMessage/Timeline）、打卡海报（canvas 2d）、日历页最长连续
  - 第四梯队：首页「随机一下」卡（2×2 网格补全，玫红骰子图标 card-random.png）、记账/习惯列表骨架屏、首页数字滚动动效
  - ✅ 部署状态已核实（2026-09-29）：云端 `bookkeeping` 整目录与本地逐文件一致（云端 ModTime 2026-09-05 22:21），新增 action 那批**已上线，无需再传**
- **提醒功能 ✅ 已整体删除（2026-09-05，用户决策）**
  - 移除内容：Tab（5→4）、`pages/reminder/`、`cloudfunctions/reminder/`、`app.js` 到期检查、首页提醒统计卡与入口、bell 图标
  - 删除原因：实测离线推送是死链路（定时器事件无 `action` 未路由 + `config.json` 缺 `subscribeMessage.send` 权限声明 + 订阅消息一次授权一条推送的平台限制），仅剩应用内弹窗价值有限
  - ⚠️ 云端善后（2026-09-29 经 MCP 核查，结论有变）：`reminder` 云函数本体**仍在**（`lam-4t84i5r9`），30 分钟定时触发器查询结果为**空**（已不存在，此项待办已了结），`reminders` 集合仍有 4 条数据。**别急着删函数**——本地 `cloudfunctions/` 已无 reminder 目录，云端这份是仅存源码（已提取到 `云端备份/.../functions/src/reminder.index.js` + zip）。环境 10-01 到期会一并消失，无需手动清理
- **安全与成本加固 ✅ 云函数侧已上线，前端侧发布状态未核实（2026-09-05 改码；unwatermark 部分当日已按用户要求回退至加固前版本，仅保留以下两项）**
  - `cloudfunctions/nearby/index.js`：**v11-logredact**，高德请求日志脱敏（Key 不再进云函数日志）；可用 `action:'version'` 自检云端版本
  - `miniprogram/app.js`：**删除 60 秒全局轮询**，到期提醒改为 `App.onShow` + 登录成功后各检查一次（云函数侧标记 expired 防重复弹窗，语义不变）；每用户云函数调用量从 ~60 次/小时 降为按次
  - ✅ `nearby` 部署状态已核实（2026-09-29）：云端整目录与本地逐文件一致，云端代码即 v11-logredact（ModTime 2026-09-05 21:09），**无需再传**
  - ❓ `app.js` 属小程序前端改动，是否已**发布上线**要看微信公众平台的审核/发布记录，本次备份未涉及、我无法核实
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
- **一个云环境承载两个项目**：`cloud1-d6g4x9h9m507b429c` 里除了本项目的 `accounts`/`habits`/`habit_logs`/`budgets`/`reminders` 等，还有食光 App 的 `sg_*`/`custom_foods`/`meal_records`/`app_users` 和 `api-diet`/`auth-diet` 两个云函数。做任何"清理/迁移/删除云端"动作前，先确认会不会打到食光那边
- **导云端 NoSQL 数据别用 `JSON.stringify` 直接落文件**：Date 类型会被静默转成 ISO 字符串，条数、字节数、sha256 全都对得上，**只有字段类型错了**，常规校验发现不了。要么导出时显式转 `$date`/毫秒数，要么像本次一样附还原脚本（`restore-tools/fix-dates`）并在手册里写成必做步骤
- **集合的 `Size` 不等于数据体积**：MCP 列表里 `custom_foods` 报 2.27 MB，实际 JSON 只有 25 条文档；按 Size 估算导出量会误判（本次真实数据总量 5.86 MB / 345 条）

### 下一步
- [🔴 待用户·有截止日] **2026-10-01 00:46:37 环境到期**，二选一：微信侧续费（个人版 19.9/月，≠腾讯云侧 39.9），或选定新环境后按 `C:\Desktop\云端备份\cloud1-d6g4x9h9m507b429c\RESTORE.md` 九步迁移。到期后能否靠续费捞回来、数据保留多久，**属平台侧行为，未核实，别指望**
- [待办·迁移时必做] 换环境后要改的硬编码（漏一个就整片功能失效，详见 RESTORE.md 第 7 节）：本小程序 `project.config.json` + `miniprogram/app.js` 的 envId；食光 App `js/api.js` 17/20/26 行 + `ShiguangFlutter/lib/data/api_client.dart` 38/42/46 行，并且 **publishable key 是 JWT、`aud` 绑死旧 envId，必须换发新 key**，否则食光客户端全量 401
- [✅ 已接续] 「附近品牌」24h 本地缓存（2026-08-26 完成）
- [✅ 已接续] 高德 Key 移入环境变量 `AMAP_KEY`（2026-08-26 完成，代码内已无密钥）
- [✅ 已接续] 安全与成本加固：AMAP_KEY 日志脱敏（云端已上线 v11-logredact）/ 提醒轮询改 onShow（前端发布状态未核实）；unwatermark 加固与 Cookie 方案当日已回退
- [待用户] 清理不再使用的腾讯 Key（`2GHBZ`/`ZIBBZ`/`BALBZ`/`YREBZ`）及对应配额分配（腾讯位置服务控制台）
- [✅ 已接续] 云数据库索引：`accounts` 组合索引 `openid_date1`（`_openid` 升序 + `date` 降序）此前已建；`habit_logs` 同款组合索引 2026-09-12 经 CloudBase MCP 补建完成，均已验证生效
- [待用户] unwatermark 是否保留上线（合规风险：内置签名逆向、品牌 logo 版权）；云存储转存视频无自动清理，建议在云开发控制台手动清理旧文件
- [待办] 其他 Tab（记账/习惯）的功能完善