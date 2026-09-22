# superai-console

一块面板，盯着 SuperAI 在干什么。

四个小面板，数据全部来自后端已有的遥测流，不改后端一行：

| 面板 | 来源 |
|---|---|
| Voice | 浏览器麦克风。`AnalyserNode` 的 RMS 驱动 three.js 造型，Web Speech 把说的话转写后发 `SendChat` |
| Memory | `pulse:frame` 里的工具事件，按后端 `isMemoryTool` 同一条规则过滤 |
| Task | `PulseRun` —— 在飞的轮次、正在做什么、推理的尾巴 |
| In · Out | 整条事件流：模型轮次带 token 数，工具调用带耗时 |

## 跑起来

```
cp .env.example .env.local   # 填后端地址和 token
npm install
npm run dev                  # http://localhost:43917
```

`.env.local`：

```
SUPERAI_URL=http://192.168.123.65:43118
SUPERAI_TOKEN=<superai 的 auth.json 里的 token>
```

## 为什么必须有这个代理

SuperAI 的 serve 模式**不发任何 CORS 头**，而且凭据只认 `Authorization`
头——`EventSource` 恰恰不能设头。所以这个页面不可能直接连后端：跨域过不去，
事件流也开不了。

`vite.config.ts` 里的代理同时解决两件事：页面对自己的 `/api` 说话（同源），
token 在 Vite 进程里加上（不进浏览器）。将来真要部署，把同样的改写放进前面
那层反代即可，应用一个字不用改。

## 已知的边界

- **Web Speech 只有 Chrome 有**，而且音频要发给 Google。别的浏览器里造型
  照常跟着你的声音动，只是不转写——界面会明说。
- 麦克风需要 HTTPS 或 localhost。
