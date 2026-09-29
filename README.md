# 条件研究室 · Stock Intent

自然语言智能选股与策略解释器。公开可操作版本：[stock-intent.vercel.app](https://stock-intent.vercel.app)。支持预设或DeepSeek解释意图、编辑条件、运行真实沪深300快照筛选、查看逐项证据及同快照条件变化；2026-09-29已完成公网浏览器验收。

详细方案见 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)，真实验证见 [数据验证记录](docs/DATA_VERIFICATION.md)。

## Target User

能用自然语言表达选股研究意图，但不熟悉金融指标字段、口径和筛选语法的个人研究者。

## Problem

“经营改善、估值合理、走势稳定”没有唯一指标定义。产品需要让用户检查默认解释、修改条件、用真实数据执行，并理解入选、排除和条件修改的影响。

## Why AI / Why not rules only

AI用于理解不同表达、显式提出假设、发现歧义和提出澄清。固定规则用于比较、计数、冲突检测、波动率与候选集变化。完整示例走预设并展示默认假设；包含附加要求时必须调用已配置的LLM，未配置时明确报错。DeepSeek非预设输入已在公网实测。

## AI / deterministic engine / financial data responsibilities

| 层 | 负责 | 不负责 |
|---|---|---|
| LLM（公网已验证DeepSeek） | 意图映射、澄清、假设解释、不支持项 | 计算指标、决定股票入选、生成股票事实 |
| 确定性引擎 | 比较、三态判断、冲突、计数、集合差分 | 自行扩展用户意图 |
| 金融数据层 | 真实成分、财务、估值、行情及证据 | 投资判断 |

## Architecture

Next.js App Router + React + TypeScript strict + Zod。`src/domain`存放指标白名单、schema和筛选引擎；`src/lib/finance`负责取数及规范化；`scripts`构建快照；Web读取版本化snapshot，不在用户筛选时调用金融API。

当前已实现：300只真实成分的partial快照、7项指标、编辑器、入选/排除/未知证据、敏感性比较。完整排期保留在第一阶段实施计划。

## Data sources

使用用户已安装的 `hithink-finance` CLI 0.1.13，数据源为扶摇/同花顺金融数据服务。契约从已安装Skill和CLI schema读取，并用真实请求验证；以真实响应为准。

- [扶摇文档](https://fuyao.aicubes.cn/docs/)
- [官方仓库](https://github.com/HiThink-Tech/Financial-API)
- iFinD MCP尚未接入或验证；本MVP不依赖它。

本地原始数据位于 `data/verification/`，由Git忽略。公开产品只上传规范化快照，逐项证据在页面展示；原始响应和Key不进入公开仓库或`public/`。用户已明确批准这次公开展示；供应商条款下的独立再分发权限尚未核验。

## Metric definitions

| 字段 | 定义 / 单位 | 当前验证情况 |
|---|---|---|
| operating_income_yoy_growth_ratio | 营业收入同比 / % | 映射`calculate_operating_income_yoy_growth_ratio`；300/300 |
| parent_holder_net_profit_yoy_growth_ratio | 归母净利润同比 / % | 映射`calculate_parent_holder_net_profit_yoy_growth_ratio`；300/300 |
| index_weighted_avg_roe | 报告期加权ROE / % | 300/300，不年化 |
| sale_gross_margin | 报告期毛利率 / % | 252/300；null不补零 |
| pe_ttm | 市盈率TTM / 倍 | 300/300 |
| pb_mrq | 市净率MRQ / 倍 | 300/300 |
| volatility_60d | 前复权60日年化波动率 / % | 296/300；缺口不填充 |

所有百分数在程序中以10表示10%，波动率为`sample_std(60 daily returns, ddof=1) * sqrt(252) * 100`。需要61个连续交易日价格。样本标准差、单位转换、缺口处理见源代码及测试。

## Setup

要求 Node.js 22+ 和npm；金融验证另需已安装的官方 `hithink-finance` CLI、有效API Key和网络连接。实测环境Node 24.14.0、npm 11.9.0，依赖版本由lockfile固定。

```bash
npm ci
npm run dev
```

本地打开 [http://localhost:3000](http://localhost:3000)。首次运行需先构建真实快照；示例意图不需要LLM Key。

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run release:check
npm start
```

## Environment variables

`.env.example`只列名称，不包含凭据。实际Key配置在Git忽略的本机`.env.local`或托管平台服务器Secret中，绝不提交或打包。

| 变量 | 用途 | 本阶段是否必需 |
|---|---|---|
| HITHINK_FINANCE_API_KEY | 仅金融维护脚本使用的进程Secret | 可由用户级凭据文件或CLI系统凭据代替 |
| HITHINK_CREDENTIALS_FILE | 用户级凭据文件位置覆盖 | 否 |
| LLM_API_KEY / LLM_MODEL / LLM_BASE_URL | 可选服务端意图解析 | 示例预设不需要；其他表达需要 |
| SNAPSHOT_PATH | Web只读快照路径 | 默认data/snapshots/current.json |

金融脚本读取环境变量、标准用户级`hithink-finance/credentials.env`，再兼容旧变量/CLI系统凭据。macOS标准位置为`~/Library/Application Support/hithink-finance/credentials.env`。不打印、复制或持久化Key到工程。Node维护脚本不会自动加载Next.js的`.env.local`；请使用上述来源。禁止使用`NEXT_PUBLIC_`保存Secret。

DeepSeek使用服务端`LLM_BASE_URL=https://api.deepseek.com`与`LLM_MODEL=deepseek-flash`；本机已按[官方模型说明](https://api-docs.deepseek.com/quick_start/pricing/)验证真实调用。不要将密钥放在URL、命令参数、Git、截图或客户端变量中。

## Validation

```bash
# 少量真实请求；不是全量建库。财报期显式指定。
npm run verify:data -- --report 2026-2

# 重放已有真实响应，不访问网络；路径换成实际输出目录。
npm run verify:data -- --offline-dir data/verification/2026-09-28T10-56-31-806Z --report 2026-2

# 零网络、零snapshot写入的构建计划。
npm run snapshot:plan

# 真实构建，支持同一日期/财报期缓存续跑。
npm run snapshot:build -- --report 2026-2
```

`verify:data`退出码：0=请求与当前已核验字段映射通过；1=调用失败；2=请求成功但指标契约有缺口。第一阶段原样字段检查返回过2；五行业交叉核验完成后已改用明确映射。

真实构建已在本地保存300只成分的partial快照；报告在Git忽略的`data/snapshots/<snapshot-id>-coverage.json`。2026-09-28批次请求失败0次，耗时约94秒。毛利率和波动率缺失项在产品中保留UNKNOWN。

## Test cases

已有29项自动测试，覆盖指标白名单、模型传输异常、附加要求不被预设吞掉、请求体上限、金融接口重试与缓存续跑、失败刷新保留旧快照、三态筛选和波动率边界。

本机生产构建可运行`npm run test:e2e`复测浏览器主链路；服务器配置DeepSeek密钥时还会测试非预设输入。2026-09-29已针对公网地址完成此验收，记录位于本地`artifacts/acceptance/browser.json`与截图。

## Deployment

推荐使用支持Next.js服务端Route Handler的托管平台。发布前依次运行四项质量检查、`npm run build`和`npm run release:check`；后者验证本地真实300只成分快照和七项覆盖，并检查三个服务端路由均已追踪规范化快照且未追踪原始响应、验证产物或本机环境文件。`/api/health`实时报告快照ID、股票数、质量及LLM是否配置。应用筛选时只读取已构建的快照，不在公开请求中使用金融API Key。

已部署至[Vercel生产环境](https://stock-intent.vercel.app)，并将`LLM_API_KEY`配置为生产Secret。部署清单70个文件中仅`data/snapshots/current.json`是金融数据文件；`.vercelignore`排除原始接口响应、验证产物及本机环境文件。快照由Git忽略，不进入源码仓库。线上`/api/health`返回300只股票、正确snapshot ID及已配置模型；公网Playwright主链路通过。

## Failure handling

不把null转0，不把错误转空的正常候选集。两个同比字段通过五行业真实样本交叉核验后建立明确映射，原始字段保留在证据中。缺失/错误/冲突/过期保留质量状态与原因；存在明确FAIL时同时保留未知项。

估值时间为批次最大上游时间，财务指标接口缺少披露时间，均显式标注。不将retrieved_at作为as_of，不混用报告期。构建被阻断时归档诊断快照并保留旧版；当前没有自动刷新。

## Compliance

页面固定显示：**本工具用于研究与筛选条件解释，不构成投资建议。**

不提供确定性涨跌预测、收益承诺、直接买卖建议或自动交易。LLM层严格限制指标白名单和JSON结构；真实DeepSeek实测对“保证明天涨停”和“不要银行”均标记不支持并要求澄清。

## Privacy

不收集账户、持仓或联系方式。当前输入和条件只保存在页面内存中，刷新即清除；不会写入浏览器本地存储。原始自然语言的服务端日志默认关闭；生产错误日志需脱敏。用户级Key不会进入Web bundle、API返回或Git。数据及截图目录默认Git忽略。

## Known limitations

- 远端源码仓库尚未建立；真实LLM只验证了少量输入，不能由此推断任意描述都正确。供应商对规范化数据公开展示的独立许可尚未核验。
- 快照为partial；毛利率48只缺失、波动率4只缺失。历史披露日语义尚未核验，不支持回测。
- 最新成分/最新估值不能支持无前视偏差的历史回测。
- 供应商不提供的精确时点/报告期只能标未知。
- 银行毛利率可能不适用；跨行业统一预设有局限，需要展示假设。

## What I intentionally did not build

回测、交易、持仓、投资推荐、全市场筛选、新闻情绪、监控、账户体系、多代理和营销首页。没有创建demo行情。

## AI usage & human verification record

AI参与需求梳理、Skill/接口检查、基础代码、数据模型、文档、测试与错误诊断。工具复验包括真实CLI调用、Zod校验、Python独立复算和构建检查。候选人本人尚需人工核对关键口径和最终交互；不能把Agent自检包装成人类复核。

详细记录及待人工确认事项见 [AI_USAGE.md](docs/AI_USAGE.md)。后续逐项补入实际使用的LLM模型、提示词版本、错误修正与人工验证证据。
