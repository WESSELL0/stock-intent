# AI使用与验证记录

更新：2026-09-29。执行者为Codex Agent；候选人本人尚未完成最终人工复核。产品内DeepSeek真实模型已在本机及公网调用成功，但少量样本不能证明任意自然语言都能正确理解。

## AI参与和职责边界

Agent辅助阅读题目、检查已安装的`hithink-finance` Skill与真实接口、编写Next.js/TypeScript/Zod代码、测试及文档，并执行命令和浏览器验收。产品运行时，完整预设短语由显式规则解释；其他输入由服务端DeepSeek解释。模型只能输出可校验的意图JSON，不能计算金融指标或决定股票PASS/FAIL；后两者由确定性程序完成。

## 发现、纠错和复核

| 初始问题 | 实测与修正 |
|---|---|
| 将净利润同比视作同一口径 | 供应商实际返回归母净利润同比字段；改用`parent_holder_net_profit_yoy_growth_ratio`，没有冒充合并净利润同比 |
| 文档字段可直接映射 | 用五个不同行业股票的本期与上年同期利润表原值，独立复算营业收入同比和归母净利润同比；10项最大差异为0.000000489个百分点，建立明确的原始字段映射 |
| `null`可当作筛选失败 | 引擎改为PASS/FAIL/UNKNOWN三态；有已知FAIL时保留未知条件，Near Miss只收数据完整的FAIL股票 |
| 60个收盘价足以计算60日波动率 | 改用61个连续价格产生60个收益率，以样本标准差和`sqrt(252)`年化；TypeScript与Python独立复算一致 |
| 一个时间可代表全部数据 | 分离`as_of`、`retrieved_at`、`report_period`；供应商未给披露日时明确标未知，估值批次时间不冒充单股精确时间 |
| 编辑条件后展示值可能对应旧条件 | 筛选响应保存`applied_conditions`，敏感性和Near Miss说明使用已运行条件；浏览器验证重新运行后新增/剔除变化 |
| 预设匹配过宽会吞掉附加要求 | 改为完整句子匹配；“不要银行”“保证涨停”等附加要求会进入模型解释，模型未配置时明确报错 |
| 模型可能伪称用户手填或遗漏冲突 | 严格校验`origin`、假设确认状态和同指标确定性冲突；非法结果拒绝而不进入筛选 |

这些均为Agent与程序交叉检查，不替代候选人本人的判断。原始响应保存在Git忽略的`data/verification/`，逐条核验在本地`artifacts/finance-crosscheck-5.json`。

## 已执行与未执行

最新工程检查：lint、typecheck、29项测试、build通过；本机Playwright主链路通过。真实沪深300快照含300只股票，七指标覆盖见`data/snapshots/<snapshot-id>-coverage.json`。测试细节见[TEST_PLAN.md](TEST_PLAN.md)。

真实模型验证：DeepSeek `deepseek-flash`将非预设“营收同比至少8%、PB不高于2倍”解析为两项条件；浏览器用本地真实快照筛出300只中62只PASS、238只FAIL、0只UNKNOWN。另测“保证明天涨停”标为`compliance_boundary`，“不要银行”标为当前股票池不支持；两者均要求澄清。记录在本地`artifacts/phase3-llm-e2e.json`及`artifacts/acceptance/browser.json`。密钥位于Git忽略的本机服务器环境文件，且已按用户明确授权添加为Vercel生产Secret；未写入源码、测试产物或仓库。

公网验证：2026-09-29，Playwright在[生产地址](https://stock-intent.vercel.app)通过预设编辑、PASS/FAIL/UNKNOWN证据、同快照条件变化、真实DeepSeek非预设解析和异常HTTP请求测试；无页面错误。[源代码仓库](https://github.com/WESSELL0/stock-intent)已公开。未完成：广泛提示词效果评测及候选人本人最终逐项签核。
