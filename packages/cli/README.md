# @metatell/cli

CLI tool for Metatell bot development and testing.

## Installation

```bash
npm install -g @metatell/cli
```

## Usage

### Interactive Mode (Default)

```bash
# 未ログインで入室
metatell-cli https://metatell.app/ROOM_ID

# ログイン済みユーザーとして入室
metatell-cli https://metatell.app/ROOM_ID -t "your-auth-token"
```

Interactive mode provides:
- Real-time event monitoring
- Simple chat interface
- Commands: `status`, `users`, `quit`

### Connect Command

Quick connection test:

```bash
# 未ログインで接続テスト
metatell-cli connect https://metatell.app/ROOM_ID
```

### Inspect Command

Room inspection and monitoring:

```bash
# ルーム情報の確認
metatell-cli inspect https://metatell.app/ROOM_ID
```

### Options

- `-t, --token <token>`: Authentication token (optional - 未ログインでも入室可能)
- `-n, --name <name>`: Bot display name (interactive mode)
- `-d, --debug`: Enable debug logging

### Environment Variables

- `METATELL_TOKEN`: Default authentication token (optional)

## Features

- Simple connection testing
- Room state inspection
- Interactive command-line interface
- User presence monitoring
- Message activity tracking
- Clean implementation using SDK facade API