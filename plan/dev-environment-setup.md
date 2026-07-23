# Python & Rust 開發環境安裝紀錄

> 日期：2026-07-16　平台：macOS（Apple Silicon / aarch64）

## 1. 安裝前環境檢查

| 項目 | 安裝前狀態 |
|---|---|
| Homebrew | 已安裝（6.0.11） |
| Xcode Command Line Tools | 已安裝 |
| Python | 僅系統內建 `/usr/bin/python3`，版本 3.9.6（過舊） |
| Rust | 完全未安裝（rustc / cargo / rustup 皆無） |
| uv / pyenv | 皆無 |

## 2. 工具選型

| 面向 | 選擇 | 原因 |
|---|---|---|
| Python 工具鏈 | **uv** | Astral 推出的現代工具，同時管理 Python 版本與虛擬環境/套件，速度快，一個工具搞定 |
| Rust 安裝方式 | **rustup** | Rust 官方安裝工具，方便管理 stable/nightly 版本與 rustc/cargo 更新，是官方建議的標準做法 |

## 3. 安裝步驟

### 3.1 uv（Python）

```bash
brew install uv
```

安裝後透過 uv 安裝獨立的 Python 版本，取代系統舊版 3.9.6：

```bash
uv python install 3.13
```

### 3.2 rustup（Rust）

使用官方安裝腳本（`sh.rustup.rs`），下載後檢查內容再執行：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o rustup-init.sh
sh rustup-init.sh -y --default-toolchain stable --profile default
```

rustup 會自動在 `~/.zshenv` 加入：

```bash
. "$HOME/.cargo/env"
```

讓每次開啟新終端機都能載入 `cargo` / `rustc` 的 PATH。

## 4. 安裝結果

| 工具 | 版本 |
|---|---|
| uv | 0.11.29 |
| Python（uv 管理） | 3.13.14（`~/.local/bin/python3.13`） |
| rustup | 1.29.0 |
| rustc | 1.97.0 (stable) |
| cargo | 1.97.0 (stable) |

已安裝的 Rust component（`default` profile）：

- `rustc`
- `cargo`
- `clippy`（linter）
- `rustfmt`（格式化工具）
- `rust-std`
- `rust-docs`

## 5. 快速上手指令

### Python（uv）

```bash
uv init myproject && cd myproject
uv add requests          # 加套件
uv run python main.py    # 在虛擬環境中執行
```

### Rust（cargo）

```bash
cargo new myproject && cd myproject
cargo build
cargo run
```

## 6. 備註

- 系統內建的 `/usr/bin/python3`（3.9.6）保留不動，僅新增 uv 管理的獨立 Python 版本，不影響系統既有相依。
- `~/.local/bin` 已存在於 `~/.zshrc` 的 `PATH` 設定中，uv 安裝的 Python 執行檔可直接被找到。
- rustup 偵測到 `~/.rustup/settings.toml` 已存在（先前殘留設定），沿用其設定，未造成安裝問題。
