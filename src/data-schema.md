# 🧰 Setup Guide — 学習サポートBot

このガイドでは、誰でも LINE Bot を動かせるように  
**GAS × LINE × スプレッドシート連携のセットアップ手順** をまとめています。

---

## 1. スプレッドシートを作成
1. Google スプレッドシートを新規作成  
2. 必要なシートを追加（`learning_log` など）  
3. `/src/data-schema.md` の構造に列を用意

---

## 2. Google Apps Script を作成
1. メニュー → 拡張機能 → Apps Script
2. プロジェクト作成
3. 公開されている部分コードを貼り付け（例：`example-handler.gs`）

---

## 3. Script Properties を設定
- LINE_CHANNEL_ACCESS_TOKEN
- LINE_CHANNEL_SECRET
- GEMINI_API_KEY（必要な場合）

詳細は `/docs/env-settings.md` 参照。

---

## 4. Web アプリとしてデプロイ
1. デプロイ → 新しいデプロイ
2. タイプ「ウェブアプリ」
3. 公開範囲「全員（匿名ユーザー含む）」

---

## 5. LINE Developers コンソール設定
1. Messaging API → Webhook URL に GAS の URL を登録
2. Webhook → 有効化
3. Bot 追加して動作確認

---

## 6. 完了！
これで、ユーザーが LINE でメッセージすると  
GAS → Gemini → スプレッドシート → LINE のサイクルで動作します。
