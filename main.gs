// ==========================================================
// Main.gs : 学習支援Bot（GAS版・リッチ一覧＋ノート全文再送対応）
// ==========================================================

const PROP = PropertiesService.getScriptProperties().getProperties();
const LINE_ACCESS_TOKEN = PROP.LINE_ACCESS_TOKEN;
const GEMINI_API_KEY = PROP.GEMINI_API_KEY;
const SPREADSHEET_ID = PROP.SPREADSHEET_ID;

// ==========================================================
// ① Webhook受信
// ==========================================================
function doPost(e) {
  try {
    if (!e || !e.postData) return return200("no postData");
    const json = JSON.parse(e.postData.contents);
    const event = json.events && json.events[0];
    if (!event) return return200("no event");

    const userId = event.source.userId;
    const replyToken = event.replyToken;

    // 画像受信
    if (event.type === "message" && event.message.type === "image") {
      replyToLine(replyToken, "📸 画像を受け取りました！解析を開始します…");

      const messageId = event.message.id;
      const imageUrl = "https://api-data.line.me/v2/bot/message/" + messageId + "/content";

      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const taskSheet = ss.getSheetByName("Tasks") || ss.insertSheet("Tasks");
      taskSheet.appendRow([new Date(), userId, imageUrl, "pending"]);

      removeAllProcessTriggers();
      ScriptApp.newTrigger("processImageTask").timeBased().after(2000).create();
    }

    // テキスト受信
    if (event.type === "message" && event.message.type === "text") {
      handleTextCommand(userId, replyToken, event.message.text.trim());
    }

    return return200("OK");
  } catch (err) {
    Logger.log("doPost error: " + err);
    return return200("Error");
  }
}

// ==========================================================
// ② テキストコマンド処理
// ==========================================================
function handleTextCommand(userId, replyToken, text) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("Notes");
  if (!sheet) return replyToLine(replyToken, "❌ ノートデータがまだありません。");

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return replyToLine(replyToken, "❌ ノートがまだありません。");

  const data = rows.slice(1).reverse(); // 最新が先頭

  // コメント追加
  if (text.indexOf("コメント：") === 0) {
    const comment = text.replace("コメント：", "").trim();
    if (!comment) return replyToLine(replyToken, "⚠️ コメント内容を入力してください。");
    const lastRow = sheet.getLastRow();
    const prev = sheet.getRange(lastRow, 6).getValue() || "";
    sheet.getRange(lastRow, 6).setValue(prev ? prev + "\n" + comment : comment);
    return replyToLine(replyToken, "💬 コメントを追加しました。");
  }

  // 最新ノート / 復習
  if (text === "最新ノート" || text === "復習") {
    const latest = data[0];
    const fullText = formatNoteText(latest, "📘 最新ノート");
    return sendLongMessage(replyToken, userId, fullText);
  }

  // ノート一覧（リッチボタンで表示）
  if (text === "ノート一覧" || text === "過去ノート一覧") {
    const notes = data.slice(0, 5);
    const bubbles = notes.map(function (r, i) {
      const title = extractTitle(r[3]);
      const date = Utilities.formatDate(new Date(r[0]), "Asia/Tokyo", "MM/dd HH:mm");
      return {
        type: "bubble",
        size: "kilo",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: `📘 ${title}`, weight: "bold", size: "md", wrap: true },
            { type: "text", text: `🕒 ${date}`, size: "sm", color: "#888888" }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [{
            type: "button",
            style: "primary",
            color: "#4CAF50",
            action: {
              type: "message",
              label: "開く",
              text: "ノート " + (i + 1)
            }
          }]
        }
      };
    });

    const flexMsg = {
      type: "flex",
      altText: "過去ノート一覧",
      contents: { type: "carousel", contents: bubbles }
    };

    return replyFlex(replyToken, flexMsg);
  }

  // 「ノート 1」など指定されたとき
  const numMatch = text.match(/^ノート\s*(\d+)$/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (isNaN(n) || n < 1 || n > Math.min(5, data.length))
      return replyToLine(replyToken, "⚠️ 指定できるのは直近1〜5件までです。");
    const target = data[n - 1];
    const fullText = formatNoteText(target, "📓 ノート" + n);
    return sendLongMessage(replyToken, userId, fullText);
  }

  // その他案内
  return replyToLine(replyToken,
    "🪄 教材画像を送ると自動でノートを作成します！\n\n📘「復習」＝最新ノート再送\n📚「過去ノート一覧」＝ボタンから選択\n💬「コメント：○○」でメモ追加もできます。");
}

// ==========================================================
// ③ ノート整形＋タイトル抽出（E列＝本文対応版）
// ==========================================================
function formatNoteText(row, prefix) {
  const noteDate = Utilities.formatDate(new Date(row[0]), "Asia/Tokyo", "yyyy/MM/dd HH:mm");
  const title = row[3] || "（タイトルなし）"; // D列
  const noteBody = row[4] || "（本文なし）";  // ✅ E列
  const comments = row[5] || "";

  let msg = `${prefix} (${noteDate})\n\n【${title}】\n\n${noteBody}`;
  if (comments) msg += "\n\n💬 コメント:\n" + comments;
  return msg;
}

function extractTitle(noteText) {
  if (!noteText) return "無題ノート";
  const lines = noteText.split(/\n+/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.length > 5 && line.length < 40) return line.replace(/[！。]/g, "").slice(0, 25);
  }
  return noteText.slice(0, 20);
}

// ==========================================================
// ④ 長文分割送信
// ==========================================================
function sendLongMessage(replyToken, userId, text) {
  if (!text) return;
  var CHUNK = 950;
  var chunks = text.match(new RegExp('[\\s\\S]{1,' + CHUNK + '}', 'g')) || [text];
  var messages = chunks.map(function (t, i) {
    return { type: "text", text: t + (chunks.length > 1 ? "\n(" + (i + 1) + "/" + chunks.length + ")" : "") };
  });
  var replyUrl = "https://api.line.me/v2/bot/message/reply";
  UrlFetchApp.fetch(replyUrl, {
    method: "post",
    headers: { Authorization: "Bearer " + LINE_ACCESS_TOKEN },
    contentType: "application/json",
    payload: JSON.stringify({ replyToken: replyToken, messages: messages.slice(0, 5) }),
    muteHttpExceptions: true
  });
  if (messages.length > 5) {
    for (var i = 5; i < messages.length; i++) {
      Utilities.sleep(500);
      pushToLine(userId, messages[i].text);
    }
  }
}

// ==========================================================
// ⑤ 返信（テキスト / Flex）
// ==========================================================
function replyToLine(replyToken, text) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const payload = { replyToken: replyToken, messages: [{ type: "text", text: text }] };
  UrlFetchApp.fetch(url, {
    method: "post",
    headers: { Authorization: "Bearer " + LINE_ACCESS_TOKEN },
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function replyFlex(replyToken, flexMsg) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const payload = { replyToken: replyToken, messages: [flexMsg] };
  UrlFetchApp.fetch(url, {
    method: "post",
    headers: { Authorization: "Bearer " + LINE_ACCESS_TOKEN },
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// ==========================================================
// ⑥ Push送信
// ==========================================================
function pushToLine(userId, text) {
  const url = "https://api.line.me/v2/bot/message/push";
  const payload = { to: userId, messages: [{ type: "text", text: text }] };
  UrlFetchApp.fetch(url, {
    method: "post",
    headers: { Authorization: "Bearer " + LINE_ACCESS_TOKEN },
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// ==========================================================
// ⑦ OCR処理
// ==========================================================
function processImageTask() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const taskSheet = ss.getSheetByName("Tasks");
  if (!taskSheet) return;

  const rows = taskSheet.getDataRange().getValues();
  const i = rows.findIndex(r => r[3] === "pending");
  if (i === -1) return;

  const [timestamp, userId, imageUrl] = rows[i];
  taskSheet.getRange(i + 1, 4).setValue("processing");

  try {
    const ocrText = runGeminiOCR(imageUrl);
    const noteText = generateNoteFromGemini(ocrText);
    const titledNote = "【" + extractTitle(noteText) + "】\n\n" + noteText;
    saveNoteToSheet(userId, imageUrl, ocrText, titledNote);
    pushToLine(userId, "✅ ノートが完成しました！\n\n" + titledNote.slice(0, 900));
    taskSheet.getRange(i + 1, 4).setValue("done");
  } catch (err) {
    Logger.log("processImageTask error: " + err);
    taskSheet.getRange(i + 1, 4).setValue("failed");
    pushToLine(userId, "❌ ノート作成中にエラーが発生しました。");
  } finally {
    removeAllProcessTriggers();
  }
}

// ==========================================================
// ⑧ トリガー削除
// ==========================================================
function removeAllProcessTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "processImageTask") ScriptApp.deleteTrigger(t);
  });
}

// ==========================================================
// ⑨ 302対応
// ==========================================================
function return200(msg) {
  const output = ContentService.createTextOutput(msg);
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
  };
  for (var k in headers) output.setHeader(k, headers[k]);
  return output.setMimeType(ContentService.MimeType.TEXT);
}


