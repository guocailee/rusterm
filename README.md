# rusterm

一个基于 **Tauri 2 + React + TypeScript + Rust** 的桌面终端应用原型，目标是逐步演进为类似 Termius 的远程连接工具。

当前版本已经完成第一阶段基础骨架：
- Host 配置管理
- 多 tab / 多 panel 工作区
- 应用内加密 Vault
- SSH shell 会话后端
- Tauri 事件驱动的会话输出流

## 当前能力

### 已实现
- 桌面工作区界面
  - 左侧 Host 列表
  - Vault 控制区
  - 中间 Workspace / Tab / Panel 布局
- Host 配置管理
  - 新增、编辑、删除 Host
  - 支持 `ssh` / `sftp` / `ftp` 协议字段建模
- Workspace 持久化
  - tabs / panels 布局保存到本地配置
- 应用内加密 Vault
  - 初始化 Vault
  - 解锁 / 上锁 Vault
  - 敏感值加密存储，并通过 `secretRef` 关联到 Host
- SSH 后端会话
  - password 认证
  - private key 文本认证
  - 打开 shell session
  - 输入写入
  - resize
  - 关闭 session
- 会话输出事件
  - 后端通过 `session:data` 推送 stdout 到前端

### 还未完成
- xterm.js 终端渲染
- 前端实时键盘输入绑定
- 更完整的 SSH 状态事件（如 connected / closed / error）
- Host key 校验策略
- SFTP / FTP 实际协议实现
- Vault 与 private key passphrase 的更细粒度模型

## 技术栈

### 前端
- React 19
- TypeScript
- Vite
- `@tauri-apps/api`

### 后端
- Rust
- Tauri 2
- `russh`：SSH 客户端会话
- `tokio`：异步 runtime
- `aes-gcm` + `pbkdf2`：Vault 加密
- `serde` / `serde_json`：配置序列化

## 项目结构

```text
.
├── src/
│   ├── App.tsx                 # 主界面：Host、Vault、Workspace、Panel
│   ├── App.css                 # 应用样式
│   ├── lib/
│   │   └── tauri.ts            # 前端到 Tauri 的 typed API + event 订阅
│   ├── state/
│   │   └── app-state.ts        # 前端状态与 reducer
│   └── types/
│       └── app.ts              # 前端类型定义
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs              # Tauri app 入口与 command 注册
│   │   ├── commands/           # Tauri commands
│   │   ├── models/             # Host / Session / Config / Vault 数据模型
│   │   ├── protocols/
│   │   │   └── ssh.rs          # SSH 协议接入
│   │   └── services/           # config store / vault / session manager
│   └── Cargo.toml
└── package.json
```

## 关键模块

### 前端入口
- `src/App.tsx`
  - 加载配置
  - 订阅 `session:data`
  - 管理 Host / Vault / Workspace 交互

### Tauri 入口
- `src-tauri/src/lib.rs`
  - 初始化 `ConfigStore`
  - 初始化 `VaultStore`
  - 初始化 `SessionManager`
  - 注册 commands：
    - `load_config`
    - `save_host`
    - `delete_host`
    - `save_workspace`
    - `init_vault`
    - `unlock_vault`
    - `lock_vault`
    - `upsert_vault_item`
    - `open_ssh_session`
    - `send_session_input`
    - `resize_session`
    - `close_session`

### 配置持久化
- `src-tauri/src/services/config_store.rs`
  - 负责本地配置文件读写
  - 保存 Host 与 Workspace 状态

### Vault
- `src-tauri/src/services/vault_store.rs`
  - 负责加密敏感数据
  - Vault 使用 AES-GCM + PBKDF2
  - Host 只保存 `secretRef`，不直接保存明文 secret

### SSH 会话
- `src-tauri/src/protocols/ssh.rs`
  - 建立 SSH 连接
  - 打开 shell channel
  - 写入输入
  - resize
  - 读取远端输出
- `src-tauri/src/services/session_manager.rs`
  - 管理 session registry
  - 将会话输出通过 Tauri event 发给前端

## 本地开发

### 安装依赖
```bash
pnpm install
```

### 启动前端开发
```bash
pnpm dev
```

### 启动 Tauri 桌面应用
```bash
pnpm tauri dev
```

### 前端构建
```bash
pnpm build
```

### 类型检查
```bash
pnpm exec tsc --noEmit
```

### Rust 检查
```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## 当前使用方式

1. 启动应用
2. 在左侧初始化或解锁 Vault
3. 新建一个 Host
   - 输入 `label`
   - 输入 `hostname`
   - 输入 `username`
   - 设置 `port`
   - 选择认证方式
   - 在敏感字段中填写 password 或 private key 文本
4. 在 Workspace 中给某个 panel 选择 Host
5. 点击 `Connect`
6. 后端建立 SSH shell，并把输出流回前端

> 说明：当前前端还没有接入真实终端组件，因此输出暂时显示在 panel 的文本区域中。

## 安全说明

当前实现是 **应用内加密 Vault** 模型：
- 非敏感配置单独持久化
- 敏感信息加密后写入 Vault 文件
- 前端通过 `secretRef` 关联敏感项

当前阶段的限制：
- SSH server host key 还未校验，暂时默认信任
- private key passphrase 与 password 还没有拆分建模
- 尚未接入 macOS Keychain

因此当前版本更适合原型开发与功能迭代，不建议直接作为生产级安全工具使用。

## 下一步规划

优先级建议：
1. 接入 xterm.js，替换当前文本输出区
2. 前端绑定实时键盘输入和 resize
3. 增加 session 状态事件与错误反馈
4. 加入 host key 校验
5. 实现 SFTP
6. 实现 FTP

## 已验证

当前代码已经通过：
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `pnpm exec tsc --noEmit`
- `pnpm exec vite build`
