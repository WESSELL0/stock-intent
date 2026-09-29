# 测试说明与验收矩阵

更新：2026-09-29。以下区分已经实测、仅有代码处理、尚未验证的场景；合成单元测试数据从未作为真实候选股票提供给页面。

## 已完成的验证

| 项目 | 结果与证据 |
|---|---|
| 工程检查 | `npm run lint`、`npm run typecheck`、`npm test`（40项）、`npm run build`及`npm run release:check`均通过；干净检出执行`npm ci`和上述前四项亦通过 |
| 真实数据 | 2026-09-29市场日、2026H1财报期、沪深300完整300只；七指标非空数依次为300、300、300、252、300、300、296。首轮刷新213.9秒、5次供应商429失败；续跑7.3秒、0次失败，UNKNOWN未补值 |
| 字段口径 | 从五个不同行业样本的本期/上年同期原值复算营收同比与归母净利润同比，共10项，最大差异小于0.000001个百分点；记录在本地`artifacts/finance-crosscheck-5.json` |
| 确定性引擎 | `tests/screen.test.ts`覆盖全部比较符、未舍入值边界、同指标冲突、300只三态筛选、Near Miss排除缺失、同快照差分与跨快照拒绝 |
| 数据与模型边界 | `tests/domain.test.ts`覆盖白名单、单位、null不补零、证据、波动率窗口与异常；`tests/intent.test.ts`覆盖模型幻觉字段、伪称用户修改、假设擅自确认、冲突保留 |
| 浏览器主链路 | 最新Playwright脚本`npm run test:e2e`已在本机生产构建及最终公网版本的2026-09-29真实快照上完成五条件编辑、PASS/FAIL证据、UNKNOWN分区；275只数据完整的排除股票均可逐只查看失败证据；删除、新增、冲突拦截、查询修改失效均通过，无页面错误。过期警告和歧义确认以合成响应验证UI分支。最新公网证据在本地`artifacts/acceptance/browser.json`及同目录截图 |
| 真实模型 | 官方DeepSeek `deepseek-flash`解析非预设两条件，浏览器运行后300只中62 PASS、238 FAIL、0 UNKNOWN；收益保证及行业排除均被标为不支持并要求澄清。本地记录在`artifacts/phase3-llm-e2e.json` |
| 异常注入 | `tests/finance-request.test.ts`覆盖鉴权、供应商实际429码、超时、网络故障、有限退避、缓存续跑、改变请求及失败刷新；`tests/evidence.test.ts`覆盖发布前原始哈希校验；`tests/temporal-intent.test.ts`覆盖日期写法、财报期、时间否定和去重；`tests/llm-transport.test.ts`覆盖模型鉴权与畸形响应；`tests/store.test.ts`覆盖失败刷新保留旧版；HTTP路由验收覆盖超大及畸形请求 |
| 发布数据隔离 | `npm run release:check`确认本地新真实快照合法，三个服务端路由追踪规范化快照；本次Vercel构建准备76个文件，`.vercelignore`只允许规范化`current.json`进入金融数据发布路径，原始响应、截图和`.env.local`排除。公网私有路径`.env.local`、`.git/config`及`/data/snapshots/current.json`均返回404 |
| 边界修复复验 | 公网明确“今天”请求被筛选接口以409拒绝；20条件响应从旧版约6.3 MB压缩到新版约2.28 MB且HTTP 200；公网安全响应头包含禁止嵌入、类型防嗅探和来源策略 |
| 公开源码仓库 | [WESSELL0/stock-intent](https://github.com/WESSELL0/stock-intent)已建立；Git跟踪文件不含Key、原始响应或真实快照 |
| 刷新证据与复现 | 旧快照604份、首轮新快照599份、续跑快照604份原始引用均零缺失/零哈希错误；估值3批在续跑生成新路径，成功的298只财务与297只日K响应复用。干净检出无快照与Key时，健康和快照接口均返回503并明确原因 |
| 最终公网接口 | `/api/health`返回最新快照ID、300只股票、模型已配置；旧ISO市场日和旧年报要求由筛选接口返回409；“不要求今天”返回200。公网Playwright返回300总数、21 PASS、278 FAIL、1 UNKNOWN，真实DeepSeek非预设为62 PASS、238 FAIL、0 UNKNOWN |
| 演示视频 | `scripts/record-demo.ts`在公网真实页面录制模型解析、五条件编辑、筛选、PASS/FAIL/UNKNOWN证据和同快照比较；本机成片`artifacts/demo/stock-intent-final-demo.webm`为83.88秒，1440×900，抽查关键画面无阻挡，脚本报告无页面错误 |

## 尚未通过的题目验收

| 场景 | 当前状态 |
|---|---|
| 广泛自然语言效果 | 已实测非预设条件、合规及行业不支持请求、ISO日期、年报简写、时间否定等类别；样本有限，不能推断任意表达均准确 |
| 完整异常矩阵 | 已验证请求、传输、缓存、哈希及真实429最终失败/续跑；429退避只有故障注入测试，尚未实测退避期间供应商恢复；也未对全部业务错误码或进程被强制终止做真实演练 |
| 供应商数据公开展示许可 | 已核查官方公开材料，未找到当前用途的明确许可；详见`docs/DATA_LICENSE_REVIEW.md` |

题目所说“继续比较、保存、回测或转为监控任务”为选择项：当前实现同快照条件敏感性比较，未实现保存、回测或监控。公网URL与浏览器验收均已提供。
