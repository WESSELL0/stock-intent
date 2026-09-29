# 金融数据验证记录

首轮验证日期：2026-09-28（Asia/Shanghai）。下方“本次真实验证”表格保留第一阶段的小样本接口记录；后续已完成五行业字段复算和300只成分的真实snapshot，见本页末尾。所有数据检查均不是投资结论或全市场质量认证。

## 环境与凭据

Node.js v24.14.0；npm 11.9.0；hithink-finance CLI 0.1.13。`version`、`capabilities`、`skills status`均成功。Skill目录验证ready；统一Skill来源追踪哈希未能确认，按Skill规则跳过自动更新。

进程初始无金融Key环境变量；用户级credentials.env存在。CLI系统凭据状态configured=false，但不能据此判定无认证：Agent安全读取用户级文件并注入子进程，真实授权请求成功。没有复制Key到项目或修改凭据。

首次受限网络请求返回`UPSTREAM_NETWORK_FAILURE`；在获得网络执行许可后，相同目标请求成功。未把网络限制误判为Key无效。依赖安装同样在网络许可后完成。

## 本次真实验证

复验命令：`npm run verify:data -- --report 2026-2`。

本地原始响应与SHA256清单：`data/verification/2026-09-28T10-56-31-806Z/verification-summary.json`。该目录被Git忽略，公开仓库读者需要自己的授权重新取数；本报告不发布原始响应。每项成功同时满足进程退出0、CLI信封ok=true，且检查了预期股票/报告期/字段或窗口。

| 能力 | 真实验证结果 | 验证边界 |
|---|---|---|
| symbol.search | 名称解析出标准沪深300；采用000300.SH | 未把股票代码或板块代码猜成指数 |
| index.constituents | 返回300条唯一成分 | 仅当前成分，不是历史成分 |
| market.calendar | 返回241个交易日 | 近一年固定窗口，不证明更早可取 |
| valuation.snapshot | 3只样本，PE TTM/PB MRQ均非空 | 未实测100只批次或全300只；上限100来自已读契约 |
| financials.indicators | 3只样本的2026-2报告期，ROE可取 | 没有原样返回两个白名单增长字段 |
| sale_gross_margin | 2只数值、银行样本null | null是有效缺失，不填0 |
| financials.income | 首轮3只各8期，有2026Q2与2025Q2行及收入/净利润原字段 | 首轮尚未完成口径映射；后续改用归母净利润字段并做五行业复算，见本页末尾 |
| market.history | 1只样本80根日K，响应adjust=forward | 未验证全300只覆盖、停牌/新股边界 |
| volatility_60d | 最后61个市场日得到60收益率，TS与Python独立计算一致 | 仅一只样本计算核验 |

用于技术验证的样本为贵州茅台、平安银行、宁德时代，均先确认属于返回的成分集合；并非候选推荐。

## 已发现的实质差异

1. Skill文档列出`operating_income_yoy_growth_ratio`、`net_profit_yoy_growth_ratio`，三个真实响应均缺失这些精确字段。
2. 实际返回`calculate_operating_income_yoy_growth_ratio`、`calculate_parent_holder_net_profit_yoy_growth_ratio`。净利润与归母净利润不等价，不自动改名。
3. 财务百分比是原始数字字符串；如10表示10%。保留原始字符串，规范化时严格解析；空串、null、非法数字不能变成0。
4. 指标响应没有披露时间。利润表有`report_date_ms`，但样本内本期与上年同期行出现相同披露日；其比较期/重述语义尚未确认，不声称是历史首次披露时间。
5. 估值`timestamp`是批次最大上游元数据时间，不代表每只股票每个字段同时更新；估值MRQ没有返回具体财报期。
6. 本轮CLI `market history --help`没有列出部分Skill文字描述的`--source`选项，因此实际调用未猜用该选项，响应meta source为remote。本轮没有创建或同步本地DuckDB。

首轮验证脚本退出码**2**，报告`transport_ok=true`、`metric_contract_complete=false`；这如实暴露了原始字段名与初始白名单不一致。后续已通过下面的五行业复算建立明确映射。

## 波动率交叉复算

样本600519.SH，前复权，61个收盘价日期范围2026-07-03至2026-09-28；返回60个简单日收益率。TypeScript结果23.803500459867152%，Python标准库`statistics.stdev * sqrt(252) * 100`结果23.80350045986715%，绝对差约3.55e-15个百分点。

这是历史价格的中立描述统计，仅用于核验公式，不是收益预测或买卖建议。每个价格可回到本地`history-600519.SH.json`，文件hash在验证清单中。

## 后续全量验证（2026-09-28）

对五粮液、平安银行、宁德时代、恒瑞医药、山东黄金分别用本期与上年同期`financials.income`原值复算营业收入同比和归母净利润同比。10项与`financials.indicators`供应商值的最大差异为0.000000489个百分点；因此程序显式映射`calculate_operating_income_yoy_growth_ratio`和`calculate_parent_holder_net_profit_yoy_growth_ratio`，不把归母净利润称为合并净利润。逐项数字与原始响应哈希在本地Git忽略的`artifacts/finance-crosscheck-5.json`。

真实构建保留沪深300全部300只，snapshot ID为`snap-2026-09-28-2026-2-a2a177993427`，质量为`partial`。营收同比、归母净利润同比、ROE、PE TTM、PB MRQ各300/300；毛利率252/300，60日波动率296/300；其余保留UNKNOWN。100只估值批次已实际运行，整个构建API失败0次、耗时93.9秒。覆盖报告位于本地`data/snapshots/snap-2026-09-28-2026-2-a2a177993427-coverage.json`。

当前仍未完成系统性限流/失败注入、缓存中断恢复、历史披露语义及累计/单季的原文复核、iFinD MCP验证。用户已明确批准将规范化快照公开展示，该快照现用于[Vercel生产产品](https://stock-intent.vercel.app)；供应商条款下的独立再分发权限尚未核验。
