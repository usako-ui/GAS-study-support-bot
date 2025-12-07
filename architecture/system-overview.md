# 🏗 System Overview

本システムは Google Apps Script（GAS）、Gemini API、LINE Messaging API、Google Spreadsheet を連携させた学習サポート Bot です。

## 全体構成図（Mermaid）

```mermaid
flowchart TD

A[ユーザー / LINE] --> B[LINE Messaging API]
B --> C[GAS Webhook doPost()]
C --> D[Gemini API 解析（非公開ロジック）]
D --> E[スプレッドシート保存]
E --> F[GAS 応答生成]
F --> A
モジュール構成
/src/pseudo-main.gs
→ 全体の処理フロー（擬似コード）

/src/example-handler.gs
→ 安全な範囲のハンドラ実装例

/src/data-schema.md
→ スプレッドシート設計

rust
コードをコピーする

---

# 3️⃣ architecture/sequence-diagram.md

```md
# 🔄 Sequence Diagram（処理の流れ）

```mermaid
sequenceDiagram
    participant U as User
    participant L as LINE API
    participant G as GAS
    participant A as Gemini
    participant S as Spreadsheet

    U->>L: メッセージ送信
    L->>G: Webhook doPost()
    G->>A: テキスト解析（抽出/分類）
    A->>G: 解析結果
    G->>S: 保存処理
    G->>L: 返信メッセージ送信
    L->>U: AIからの返信表示
csharp
コードをコピーする

---

# 4️⃣ src/example-handler.gs（安全に公開できる部分コード）

```js
/**
 * LINE メッセージの body を安全に整形する例
 * 主要ロジックは含めていません。
 */

function parseLineEvent(e) {
  try {
    const json = JSON.parse(e.postData.contents);
    const event = json.events[0];
    return {
      userId: event.source.userId,
      text: event.message.text,
      timestamp: event.timestamp,
    };
  } catch (error) {
    console.error("parseLineEvent error:", error);
    return null;
  }
}

/**
 * Spreadsheet の指定シートに1行追加する例
 */
function appendRow(sheetName, values) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  sheet.appendRow(values);
}
