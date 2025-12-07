// ==========================================================
// OcrGemini.gs : Gemini OCR処理（画像URL → テキスト）
// ==========================================================

function runGeminiOCR(imageUrl) {
  const props = PropertiesService.getScriptProperties();
  const GEMINI_API_KEY = props.getProperty("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) throw new Error("⚠️ スクリプトプロパティに GEMINI_API_KEY が設定されていません。");

  try {
    // --- 画像データを取得 ---
    const imgResponse = UrlFetchApp.fetch(imageUrl, {
      headers: { Authorization: "Bearer " + props.getProperty("LINE_ACCESS_TOKEN") }
    });
    const base64Image = Utilities.base64Encode(imgResponse.getBlob().getBytes());

    // --- GeminiへのOCRリクエスト ---
    const prompt = `
あなたは「中小企業診断士」試験の教材をOCRで読み取り、
Markdown形式でノート化するアシスタントです。

【目的】
- 教材画像を正確にテキスト化し、学習ノートとして読みやすく構成する。
- 図や表も可能な範囲で文字や簡易ASCIIで再現。

【出力ルール】
- 章タイトル：## 
- 小見出し：### 
- 箇条書き：- または 1.
- 重要語句：**太字**
- 図や表はコードブロック（\`\`\`）で表現
`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: base64Image } }
          ]
        }
      ]
    };

    const res = UrlFetchApp.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY,
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      }
    );

    const data = JSON.parse(res.getContentText());
    const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();

    if (!text) {
      Logger.log("❌ OCR失敗: 応答なし");
      return "";
    }

    Logger.log("✅ OCR成功");
    return text;

  } catch (e) {
    Logger.log("❌ OCR中にエラー: " + e);
    return "";
  }
}

