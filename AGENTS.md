# life-toolkit 微信小程序

生活小工具集合（微信云开发）：记账 / 习惯打卡 / 随机工具（掷骰子、喝什么→附近品牌）/ 工具箱。

## 📌 项目交接

### 进行到
- **体验补强第二轮 ✅ 已完成（2026-10-07，接在规范审查轮之后，3 个提交）**
  - **习惯可撤销打卡**：`cloudfunctions/habit/index.js` 新增 `unCheckIn`。定位方式与 `checkIn` 对称（同一确定性 `_id = md5(openid|habitId|date)`），因此也吃得下幂等键修复前的随机 `_id` 历史数据；删除后**以"重查还剩几条"为唯一判据**——`remove` 抛错但记录确已消失（并发撤销）算成功，反之如实返回"未完成"，不谎报。入口两处：列表页长按卡片菜单（撤销今日）、日历页点已打卡的日期（撤销任意一天，日历页刻意只放撤销不放出卡，避免同页两种相反写操作误触）
  - **习惯可导出**：新增 `exportLogs`，习惯名在服务端解析后随 CSV 行返回（已删除的习惯给占位名 `（已删除的习惯）`）；**单次 `get()` 上限 1000 条用 `skip` 翻页绕过**（9 个习惯跑一年就超 1000），上限 5000 并带 `truncated`；翻页按 `_id` 排序保证不重不漏，返回前再按日期重排
  - 云函数**已部署并探针验证在线**：`invokeFunction {action:'unCheckIn'}` → `缺少习惯ID`、`{action:'exportLogs',month:'2026-9'}` → `月份格式错误（应为 YYYY-MM）`（旧代码会回 `未知操作`）。⚠️ 部署后**立刻**探针会读到旧代码——第一次探针就回了 `未知操作`，隔了一轮才回新结果，`tcb fn detail` 同期已能看到新代码。结论：**部署与生效之间有延迟，探针要复跑**
  - **诚实纠错**：上一轮记的"分类图标已收敛到 `utils/category.js`"**只对了一半**——当时只改了消费方（列表页/统计页用 `iconOf`），`pages/bookkeeping/add.js` 仍自持一份 16 行分类数组。今天两边取值恰好一致所以没暴雷，但在 add 页加一个分类就会让列表页/统计页静默回落 📦。现改为**以两个分类数组为准、`CATEGORY_ICONS` 由它们派生**，`add.js` 只引用不再自存
  - 新增 `miniprogram/utils/csv.js`（转义+BOM），记账导出与新增的习惯导出共用，不再两处各写一遍 escape
  - 新增 `tests/run-all.js`：**自动发现** `tests/*.test.js`，防止新测试文件被漏跑。测试 24 → **51 例**（habit 8→18、category 7、csv 10、bookkeeping 11、skeleton 5）
  - 变异检验：把「其他」在两个分类数组里配成不同图标 → 立刻 3 例失败。**第一次变异选错了对象**（改 `医疗` 的图标不该被抓——派生映射的本意就是改一处两边同步，那是正确行为不是缺陷），换成同名不同图标才是有效变异
  - **深色模式补漏（静态核对过，未目检）**：`habit/add`、`random/index`、`random/food`、`random/decision` 四个页面原先**完全没有 `@media (prefers-color-scheme: dark)` 块**，页底 `#FAFAFA`、输入框 `#F8F8F8`、选中块 `#E3F2FD`、页头蓝紫渐变在深色下成片发白，各补一个覆盖块（**必须放文件末尾**：同优先级下后写的才盖得住前面的浅色声明）。另修首页四张快捷卡——浅色渐变原先写在 **JS 数据里当内联样式**，`@media` 根本覆盖不到，改为按 id 走 `.quick-icon--<id>` 类名，深色下换成同色相半透明。饱和主色（`#FF6B6B`/`#FF8E6B`/`#FDCB6E` 系按钮）深色下本身可读，刻意未改
  - ⚠️ **深色模式视觉质量未经验证**：改动只经过选择器级 grep 核对（确认对应选择器确实在 dark 块内、顺序在浅色之后），**没有在模拟器里真看过一眼**。原因见"坑"里那条深色切换入口
  - 首页云函数调用量已量（回答"要不要合并"）：冷启动 **4 次**（`login` 1 + `bookkeeping.stats` 1 + `habit.listHabits` 1 + `nearby` 天气 1），稳态每次回首页 **2 次**（天气 1h 缓存、`onShow` 5 秒节流）。**判断：不值得为此新建 `dashboard` 函数**——多一份部署面和一套鉴权，换 1 次调用和几十毫秒，个人版配额远没到瓶颈。真要省就用脏标记（记账/习惯写入成功后置 `app.globalData.statsDirty`，`onShow` 仅在 dirty 或超阈值时刷新），比放宽节流窗口安全（放宽窗口会让"刚记完账回首页看到旧数字"）
- **系统性规范审查 + 全量修复 ✅ 已完成并部署上线（2026-10-07）**
  - 审查依据：CloudBase code-review 规则集（AUTH-WX/NOSQL-MP/STO 全过）+ 小程序规范清单；结论是**架构层干净**（前端零直连云数据库、4 个业务集合权限实测全 `PRIVATE`、云函数一律 `DYNAMIC_CURRENT_ENV` + `getWXContext` 鉴权、写操作全带所有权校验），缺陷集中在**数据口径**与**异常路径**
  - 云函数侧：`getStats`/`listHabits`/`calcStreak` 等聚合查询补 `.limit(1000)`（**云函数端 `get()` 不写 limit 时默认且最多 100 条，是本轮三条"静默少算"的同一根因**）；新增 `truncated`/`billCount` 让超限不再无声；`addBill` 日期兜底从 `toISOString()`(UTC) 改 UTC+8；`month`/`date`/`amount` 强校验；`listBills`/`export` 补 `_id` 次级排序键（同日多笔翻页原本会重/漏）；`checkIn` 服务端拒绝非法/未来/超一年日期；`setBudget` 改确定性 `_id`=md5(openid|month)，把并发双写收敛到主键唯一性（与 habit 同方案）
  - 前端侧：记账列表页汇总改走 `stats` 全量口径（原注释写"算全量"、代码只算已加载页）；习惯编辑页 URL 参数全字段解码（中文名曾以 `%E4%B9%A6…` 形式永久入库）；日历完成率分母按 `weekDays` 算应打卡天数；定位被拒改为弹授权引导 + `openSetting`，不再静默冒充北京；随机数/抽签输入夹紧（原 `min=0 max=99999999` 可冻死页面）；视频截图空白帧无限自旋改计数；24 处 `res.result` 判空、12 处定时器跟踪 + `onUnload`、6 页失败态与空态分离 + 重试入口；`followSystem` 23 处清零（官方 SDK 无此参数）；月份/分类/字节格式化收敛到 `utils/date.js`、`utils/category.js`、`utils/format.js`；习惯页 7 处深色漏白改走 CSS 变量 + dark 块
  - 组件：`skeleton` 的 `wx:key="*index"` 是非法键名（每帧报 WXMLRT 告警），改为组件内展开 `rowList` + `*this`，并加 `attached` 兜底不依赖 observer 首帧
  - 测试：新增 `tests/bookkeeping.test.js`（11 例）+ `tests/skeleton.test.js`（5 例），扩桩件支持 `lt/gte.and`/`skip`/`field`/多字段排序/`update`；现 **habit 8 + bookkeeping 11 + skeleton 5 = 24 例全绿**。已做变异检验：手动删掉 `getStats` 的 `.limit` → 立刻 2 例失败，门禁是真的拦得住
  - 部署与证据：4 个函数代码 + `config.json`（`bookkeeping/habit/nearby` timeout 3s→20s、`login`→5s）经 CloudBase MCP 上线，`tcb fn detail` 实测超时值已生效；`invokeFunction nearby {action:'version'}` → `keyConfigured:true`（**证明部署没冲掉 AMAP_KEY**）；`bookkeeping {month:'2026-9'}` → `请指定月份（YYYY-MM）`、`habit {date:'2026-9-5'}` → `打卡日期格式错误`（新代码在线）
  - 上机复验（微信开发者工具 + automator）：4 个主页面 **WXML 运行时告警 0 条**；剩余 6 条 error 全是自动化窗口 `appid missing` 限制（普通窗口云函数正常），且都已带新加的日志前缀
  - ✅ **运行时已升到 Nodejs18.15（2026-10-07，5 个函数全部完成）**：三条"改配置"通道（MCP `updateFunctionCode` 带 `func.runtime`、MCP `createFunction force`、`tcb fn deploy --runtime`）**全部静默无效** —— 都返回成功但 `Runtime` 字段一个字没变（`login` 的 FunctionId/AddTime 也没变，说明连重建都没发生）。**可行做法＝删除 + 同名重建**：先建临时探针函数（`rt-probe-tmp`）确认平台允许 18.15 → MCP `deleteFunction(confirm:true)` → `tcb fn deploy <fn> --config-file <rc> --force --install-dependency true`。要点：cloudbaserc 的 `functionRoot` **必须写相对路径**（绝对路径会被再拼一次 CWD）；`memorySize` 只有 cloudbaserc 能带（MCP createFunction 无此字段，`unwatermark` 的 512MB 靠它保住）；`tcb fn delete` 没有 `--force` 会卡交互，删除一律走 MCP。`nearby` 的 `AMAP_KEY` 用 `tcb fn env pull` 落到本地临时文件 → 脚本回填进 rc 的 `envVariables` → 重建后 `invokeFunction {action:'version'}` 返回 `keyConfigured:true`，**明文全程不进对话**，用完即删本地文件。回读结果：`login/bookkeeping/habit/nearby/unwatermark` 全部 `Nodejs18.15`，timeout `5/20/20/20/60`、内存 `256/256/256/256/512` 保持不变；云端函数共 7 个（含食光的 `api-diet`/`auth-diet`）
  - 顺手修掉一个**长期存在、非本轮引入**的缺陷：`pages/index/index.js` 调 `bookkeeping` 时 `data:{action:'stats'}` **没传 `month`**，而云函数改前改后都要求月份 → 一直返回 `code:-1` → 首页「本月支出」从来没显示过数字（永远 `--`），且 `code!==0` 分支原本不记日志所以无人发现。现补 `month: date.currentMonthStr()` + 失败记日志，真机复验该卡显示 `0.00`
  - 云存储清理：`unwatermark/` 下 10 个转存测试视频已删除（合计 126,002,411 字节，与备份 manifest 记录的字节数逐字节吻合；删除后根目录 28 → 18 个文件，只剩 `backup/2026-09-29T12-50-15-134Z/` 的 18 个 JSON 副本）。⚠️ 这批视频本地备份**当初按你的决策未下载**，云端是仅存副本，现已永久删除
  - 包体优化：12 个品牌 logo 由 24-bit PNG 改自适应 PNG-8 量化，**525KB → 303KB（省 42%）**。做法是每张按质量门槛（RMS≤3.0 且误差>32 的像素≤0.2%）在 256/128/64 色里取能过槛的最少档：6 张 64 色、4 张 128 色、2 张 256 色。`mixue.png` 含渐变，256 色仍超标（RMS 3.62 / 0.69%），已在真机 88rpx 显示尺寸下目检确认可接受。原件在 git 里可回退
  - **本轮刻意未做**：unwatermark 限流/自动清理代码（用户 2026-09-05 明确要求回退，不捡回）
- **云端全量备份 ✅ 已完成并校验（2026-09-29；环境已于 09-29 续期，见下条）**
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
  - 测试入库：`tests/habit-checkin.test.js` + `tests/stubs/wx-server-sdk.js`（内存桩件，主键唯一性模拟 MongoDB），核心用例：并发双写只落一条；20 轮稳定性压测零失败；运行 `node tests/habit-checkin.test.js`
  - ⚠️ 该文件原为「6/6 通过」的记载已失效：测试把日期冻成 `TODAY='2026-09-11'` 却断言 `streak=1`，真实日期一过 09-12 就必然失败（2026-10-07 实测为 5/6，与本轮改动无关，用 HEAD 版函数 + HEAD 版桩件复现确认）。现改为按 UTC+8 动态取今日，连同新增守卫共 **8/8**
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
  - ✅ 云端善后已了结（2026-10-07，用户明确批准后执行）：`reminder` 云函数已删除（`tcb fn detail reminder` → "Function does not exist"，同法对照 `login` 仍正常，确认不是查询失败的假阴性），`reminders` 集合已删除（`readNoSqlDatabaseContent` → "Db or Table not exist"）。删除前已核实仅存源码在备份两处（`云端备份/.../functions/src/reminder.index.js` 13,961 字节 + `functions/code/reminder.zip`），数据 4 条全是测试垃圾（`666/非凡哥`、`1/1`、`123/4556`、`测试/123`，全 `status: expired`）。**云端函数列表从 8 个降为 7 个**
- **安全与成本加固 ✅ 云函数侧已上线，前端侧发布状态未核实（2026-09-05 改码；unwatermark 部分当日已按用户要求回退至加固前版本，仅保留以下两项）**
  - `cloudfunctions/nearby/index.js`：**v11-logredact**，高德请求日志脱敏（Key 不再进云函数日志）；可用 `action:'version'` 自检云端版本
  - `miniprogram/app.js`：**60 秒全局轮询已删除**（2026-10-07 复核现状：`app.js` 里既无轮询也无 `onShow`——原记"到期提醒改到 `App.onShow` 各检查一次"已随提醒功能整体删除而不存在）。每用户云函数调用量从 ~60 次/小时 降为按次
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
- **云函数端 `get()` 不写 `limit` 时默认且最多 100 条**（小程序端 20，官方原文），上限 1000。任何"全量/统计/连续天数"类查询都必须显式 `.limit()` —— 2026-10-07 一轮里 `getStats`/`listHabits`/`calcStreak` 三处同根因，且**当前数据量（accounts 3 条 / habit_logs 5 条）下根本触发不了**，属"数据长起来才爆"的静默缺陷，只能靠单测钉死
- **测试里冻绝对日期 + 断言相对时间的量 = 定时炸弹**：`habit-checkin.test.js` 把 `TODAY` 写成 `'2026-09-11'` 却断言 `streak=1`，真实日期一过 09-12 必挂，而因为没人再跑它，挂了 26 天。要么动态取"今日"，要么把 `Date` 冻结后测纯函数
- **`wx:for` 传 Number 实测可以渲染**（2026-10-07 模拟器截图判定，账单页 `rows="{{5}}"` 正常出 5 行），别按"只支持数组"下结论；但 **`wx:key` 的合法值只有条目属性名或 `*this`，`*index` 是非法键名**，会在每次渲染时打 `WXMLRT_...: wx:key="*index" does not look like a valid key name`
- **微信开发者工具自动化通道的四条坑**（本机 IDE Stable 2.02.2608040 实测）：参数是 `--auto-port`，写成 `--auto 9421` 会打印 `✔ auto` 但**根本不监听**；`automator.launch({cliPath:'…/cli.bat'})` 在 Windows 必失败（spawn 不吃 .bat），改手动 `cli auto` + `automator.connect`；`checkVersion()` 会崩（本机 `Tool.getInfo` 不返回 `SDKVersion`），需 stub；**自动化窗口里 `wx.cloud.callFunction` 全部报 `appid missing`**（普通窗口正常）→ 这条通道只能验渲染，数据链路走 CloudBase MCP 直查
- **部署云函数后要自检环境变量**：本轮用 CloudBase MCP `updateFunctionCode` + `updateFunctionConfig`（不传 `envVariables`）后，`invokeFunction nearby {action:'version'}` 返回 `keyConfigured:true`，AMAP_KEY 未丢 —— 但这是"事后验证到的"，不是"平台保证的"，传完必须查
- **改运行时/配置类操作"返回成功"不等于生效**：`updateFunctionCode`、`createFunction(force:true)`、`tcb fn deploy --runtime` 三条通道都回 `success`/`✔ deployed successfully`，实际 Runtime 一个字没变。**唯一可信判据是 `queryFunctions listFunctions` 里每个函数的 `Runtime` 字段**（`tcb fn detail` 的表格也能读，但注意别被 ANSI 颜色码干扰取值——`\x1b[90m` 会让"90"混进结果里）。同理适用于 timeout：改完必须回读
- **普通代码更新也有生效延迟，不只是配置类**：2026-10-07 用 `updateFunctionCode` 传 `habit`，返回成功后**立刻** `invokeFunction` 探针回的是旧代码的 `未知操作`；同一时刻 `tcb fn detail` 已能看到新代码里的 `unCheckIn`。隔一轮再探针才回 `缺少习惯ID`。**结论：探针不能只打一次，读到旧结果先重跑再判部署失败**，否则会误去做删除重建那种重操作
- **自写的 CSS 深色覆盖审计脚本不可信，别拿它的输出当缺陷清单**：按行判断"是否在 dark 块内"会把多行选择器组（`.a,\n.b {`）和单行规则（`.x { ... }`）解析错，实测把**已覆盖**的 `.form-input`/`.preview-emoji` 报成未覆盖；`background: var(--x, #FFFFFF)` 的兜底值也不是缺陷（var 本身有深色覆盖）。**正解是直白 grep 复核**：`awk '/prefers-color-scheme: dark/,0' 文件 | grep -oE '\.(选择器)'`，一次核一个具体选择器，别信统计数字
- **开发者工具的深色模式切换入口自动化拿不到（2026-10-07 三条路全试尽）**：① UIA 无障碍树对这个 Electron 窗口只返回 9 个空壳「窗格」节点、**零文字**，读不到任何按钮名；② IDE 原生菜单（工具/设置）是**独立弹层窗口**，`get_window_state` 按窗口截图抓不到，点完看不到菜单项；③ 手机画面下方那排模拟器工具栏图标盲点两轮（含 x=941/y=718）画面零变化。**别再继续盲点**——深色目检只能人工：官方文档《DarkMode 适配指南》明写"开发者工具 1.03.2004271 版本起，在模拟器顶部可切换深色/浅色模式"，本机 Stable 2.02.2608040 远新于此，入口一定在，只是自动化定位不到。同理 `project.private.config.json` 里没有主题键，改配置文件这条路也不通
- **CloudBase 有三个互相独立的登录会话，别按"一个掉了"就判定全掉**：2026-10-07 实测 `mcp__cloudbase__*` 报 `AUTH_REQUIRED`，而 `mcp__plugin_cloudbase_cloudbase-mcp__*` 同一时刻正常列出 7 个云函数，`tcb` CLI 也活着。**看到 AUTH_REQUIRED 先换另一条 MCP 前缀试，不要直接去走 `auth start_auth` 或让用户重新认证**

### 下一步
- [🔴 待人工·2 分钟] **深色模式目检**：本轮补的 5 处 dark 块（`habit/add`、`random/index`、`random/food`、`random/decision`、首页 `.quick-icon--*`）只做过选择器级 grep 核对，**没有在模拟器里真看过**。你在开发者工具模拟器顶部切一次深色，重点看这 5 处 + 习惯列表页新的「⬇ 导出」按钮和长按菜单里的「↩️ 撤销今日打卡」是否正常排版。自动化定位不到那个开关（三条路试尽，见"坑"）
- [✅ 已完成] 习惯撤销打卡 + 打卡记录导出（2026-10-07，云函数已部署并探针验证，前端已改，测试 24→51 例）
- [🟡 已裁决不做] **分类图标去 emoji 化——我上一条建议的严重度判断错了，撤回**。仓库里 `ICON-DESIGN.md`（2026-09-05）早有明确裁决：界面骨架图标（tabBar/首页卡/工具箱分类）走 `tools/icon-forge.js` 重绘的圆角蓝图 PNG，**已完成**（`images/icons/` 9 个 PNG 实测在位）；而记账分类这类**内容级 emoji 刻意保留**。我复核后认同：那 15 个字符全在 Unicode 基础集内、iOS/Android/微信都有覆盖，"变方框"是我高估的风险，换 PNG 要多养 15 个资产却只买到"基线更齐"。真正的问题不在 emoji，在**两处数据源**——已改（见"进行到"里那条诚实纠错）
- [🟡 已搁置·用户裁决] 工具箱**二级列表**每个工具仍用 emoji（`pages/toolbox/list/index.js` 的 `icon` 字段），而父页 `toolbox/index.wxml` 用的是 PNG 分类图标——同一导航路径上两种视觉语言混着。用户说"工具箱两大类先不用改动"，故未动。**注意外链本身实测可达**：`https://tools.video/video-trim` 与 `https://pdf.imagestool.com/split-pdf` 当日都回 200（归属未确认，是用户自己的站还是第三方，没问过）
- [判断已给·未做] 首页云函数调用合并成 `dashboard`：**不建议**。实测冷启动 4 次、稳态 2 次，个人版配额远未触顶。真要省就上脏标记（写入后置 `app.globalData.statsDirty`），别放宽 `onShow` 的 5 秒节流窗口
- [✅ 已了结] ~~2026-10-01 环境到期~~ —— 2026-10-07 经 `envQuery` 实测：`ExpireTime 2027-03-30 23:59:59`、`IsAutoRenew=true`、`Status NORMAL`、个人版（`baas_personal`）。备份仍保留，真要迁移时按 `RESTORE.md` 九步走
- [待办·迁移时必做] 换环境后要改的硬编码（漏一个就整片功能失效，详见 RESTORE.md 第 7 节）：本小程序 `project.config.json` + `miniprogram/app.js` 的 envId；食光 App `js/api.js` 17/20/26 行 + `ShiguangFlutter/lib/data/api_client.dart` 38/42/46 行，并且 **publishable key 是 JWT、`aud` 绑死旧 envId，必须换发新 key**，否则食光客户端全量 401
- [✅ 已完成] 云函数运行时 `Nodejs16.13 → Nodejs18.15`（2026-10-07，5 个函数全部升完并回读确认）。**改法不是"改配置"而是"删除+同名重建"**，机制与四个坑（cloudbaserc 相对 `functionRoot`、`memorySize` 只能走 rc、`tcb fn delete` 无 `--force`、`nearby` 密钥搬运）记在"进行到"那条里
- [✅ 已完成] 云存储 `unwatermark/` 转存视频清理（2026-10-07，10 个 / 126,002,411 字节已删）。⚠️ 云函数**仍然没有自动清理逻辑**（`deleteFile` 全项目零命中），下次真机测试还会重新堆积
- [待办] 小程序前端这轮改动**尚未发布**：上传体验版/提审要微信公众平台的审核记录，本地无法核实；`cli preview`/`cli upload` 可随时出包
- [✅ 已接续] 「附近品牌」24h 本地缓存（2026-08-26 完成；2026-10-07 补了按前缀过期清理，原缓存 key 含坐标只增不删）
- [✅ 已接续] 高德 Key 移入环境变量 `AMAP_KEY`（2026-08-26 完成，代码内已无密钥）
- [✅ 已接续] 安全与成本加固：AMAP_KEY 日志脱敏（云端已上线 v11-logredact）/ 提醒轮询改 onShow（前端发布状态未核实）；unwatermark 加固与 Cookie 方案当日已回退
- [🟡 已搁置·2026-10-07] 腾讯位置服务 4 个废弃 Key 清理。**当前实际状态：4 条已在控制台「停用」（页面提示"该key已停用，所有配额已归零，可以通过恢复重新使用"），但「彻底删除」一步没点**，用户说"先不管这个了"。清单（应用 → Key 名称 → Key **首段**）：`微信小程序 → 123 → ZIBBZ…`、`live-toolkit → live-toolkit → 2GHBZ…`、`小程序 → 微信小程序 → BALBZ…`、`小程序 → 小程序 → YREBZ…`。**⚠️ 本文件旧版把这四个串写成"尾号"是错的，它们是首段**，按尾号去列表里找不到。剩余动作只有：每条右侧「彻底删除」→ 刷新回读确认条目消失（停用已把配额归零，所以不再需要先去「配额管理」解绑，这个坎自动过了）。停用后的安全性已核实：本项目 2026-08-26 起走高德、食光 App 对腾讯域名零引用、控制台内该账号**没有任何"启用中"的腾讯 Key** → 停用没打到在用链路。另：完整 Key 曾出现在当日对话截图里，删除前不构成额外泄露面（已停用），但这类"后台截图含完整密钥"的习惯以后要避免。**别再走自动化通道**：`browser-use` 是 Qoder 内置浏览器（Electron，cookie 与用户 Chrome 隔离）、`user-browser-use` 拿不到页面数据（`evaluate_script` 恒返回 `{}`）、`computer-use activate_window` 对浏览器窗口会被 `browser_url_policy` 拦并中止整轮 —— 结论与实测记在用户记忆 `env-browser-use-sdk.md`
- [✅ 已接续] 云数据库索引：`accounts` 组合索引 `openid_date1`（`_openid` 升序 + `date` 降序）此前已建；`habit_logs` 同款组合索引 2026-09-12 经 CloudBase MCP 补建完成，均已验证生效
- [待用户] unwatermark 是否保留上线（合规风险：内置签名逆向、品牌 logo 版权）。云存储那批转存视频已于 2026-10-07 手动清空（10 个 / 126MB）；**云函数侧仍无自动清理**，真机再测几轮就会重新堆积，要堵这个口子得动那段被回退的加固代码
- [待办] 其他 Tab（记账/习惯）的功能完善