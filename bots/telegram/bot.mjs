// Aetheria Telegram bot - the co-pilot as a chat bot.
//
// Bridges Telegram to the deployed Aetheria API: free-text messages go
// through the AI intent engine (same Anthropic/0G provider the dApp uses)
// and come back as trade tickets with deep links into the dApp to execute.
// The bot never holds keys and never signs anything - execution always
// happens in the user's own wallet on the dApp.
//
// Zero dependencies (Node 18+): Telegram Bot API via long polling.
//
// Setup:
//   1. Create a bot with @BotFather on Telegram -> copy the token
//   2. TELEGRAM_BOT_TOKEN=123:abc AETHERIA_API_URL=https://your-app node bots/telegram/bot.mjs
//
// Env:
//   TELEGRAM_BOT_TOKEN   from @BotFather (required)
//   AETHERIA_API_URL     deployed frontend base URL (default http://localhost:3003)

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = (process.env.AETHERIA_API_URL ?? "http://localhost:3003").replace(/\/+$/, "");
const TG = `https://api.telegram.org/bot${TOKEN}`;

if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is required - create a bot with @BotFather first.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[TG-BOT ${new Date().toISOString()}] ${msg}`);

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
  log("SIGINT - shutting down");
});

async function tg(method, payload) {
  const res = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`);
  return json.result;
}

async function fetchMarkets() {
  const res = await fetch(`${API_URL}/api/markets`);
  if (!res.ok) throw new Error(`markets API ${res.status}`);
  return res.json();
}

// Market titles come off the chain, so they are escaped before going into
// an HTML-parsed message - an unescaped "&" or "<" would break the whole
// listing, not just one line.
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function marketLine(m) {
  const status =
    m.status === 1 ? ` - RESOLVED ${m.outcome ? "YES" : "NO"}` : m.status === 2 ? " - CANCELLED" : "";
  // The heading links straight to this market on the venue, so a reader can
  // go from the list to the exact market instead of the front page.
  const link = `${API_URL}/?market=${m.id}`;
  const head = `<a href="${link}">#${m.id} [${esc(m.category)}] ${esc(m.title)}</a>`;
  return `${head}\n    YES ${m.yesPct}% | NO ${100 - m.yesPct}% | pool ${(Number(m.yesPoolOkb) + Number(m.noPoolOkb)).toFixed(2)} OKB${status}`;
}

const HELP = [
  "Aetheria Exchange - AI market co-pilot on X Layer.",
  "",
  "Just tell me a position in plain language:",
  '  "bet 2 OKB YES on market 0 and hedge it"',
  '  "which market has the best risk/reward?"',
  '  "create a market about the next ETH upgrade"',
  "",
  "Commands:",
  "  /markets - live markets and odds",
  "  /help - this message",
  "",
  "I never hold funds - every trade is signed in your own wallet on the dApp.",
].join("\n");

async function handleMessage(chatId, text) {
  if (text === "/start" || text === "/help") {
    await tg("sendMessage", { chat_id: chatId, text: HELP });
    return;
  }

  if (text === "/markets") {
    const { markets } = await fetchMarkets();
    const open = markets.filter((m) => m.status === 0);
    // Telegram caps messages at 4096 chars - chunk the listing and attach
    // the keyboard to the final chunk only.
    const chunks = [];
    let current = "LIVE MARKETS";
    for (const m of open) {
      const line = `\n\n${marketLine(m)}`;
      // Lower than the 4096 cap by a wide margin: the anchor tags are part
      // of the payload Telegram counts, and titles vary in length.
      if (current.length + line.length > 3000) {
        chunks.push(current);
        current = line.trimStart();
      } else {
        current += line;
      }
    }
    chunks.push(open.length === 0 ? "No open markets right now." : current);
    for (let i = 0; i < chunks.length; i++) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: chunks[i],
        parse_mode: "HTML",
        // Every title is a link; without this Telegram would attach a card
        // for the first one and push the listing down the screen.
        disable_web_page_preview: true,
        ...(i === chunks.length - 1
          ? {
              reply_markup: {
                inline_keyboard: [[{ text: "Open Aetheria ↗", url: API_URL }]],
              },
            }
          : {}),
      });
    }
    return;
  }

  // Free text -> the AI intent engine, with live market context.
  await tg("sendChatAction", { chat_id: chatId, action: "typing" });
  let context = [];
  try {
    const { markets } = await fetchMarkets();
    // Tradable only: an ended-but-unresolved market still reports status 0
    // but rejects new stakes, and the co-pilot treats its context as live.
    const nowSec = Math.floor(Date.now() / 1000);
    context = markets
      .filter((m) => m.status === 0 && m.endTime > nowSec)
      .map((m) => ({
        id: m.id,
        title: m.title,
        category: m.category,
        yesPoolOkb: m.yesPoolOkb,
        noPoolOkb: m.noPoolOkb,
        endTime: m.endTime,
      }));
  } catch {
    /* market context is best-effort */
  }

  const res = await fetch(`${API_URL}/api/ai/intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: text, userWallet: null, currentMarketContext: context }),
  });
  if (!res.ok) throw new Error(`intent API ${res.status}`);
  const intent = await res.json();

  const lines = [intent.explanation];
  const buttons = [];
  if (intent.outcomeTrade) {
    const t = intent.outcomeTrade;
    lines.push("", `TICKET: ${t.amount} OKB ${t.isYes ? "YES" : "NO"} on market #${t.marketId}`);
    buttons.push([{ text: `Execute on Aetheria ↗`, url: `${API_URL}/?market=${t.marketId}` }]);
  }
  if (intent.dexTrade) {
    const d = intent.dexTrade;
    lines.push(`HEDGE: ${d.amount} ${d.tokenIn} -> ${d.tokenOut} via OKX DEX`);
  }
  if (intent.marketDraft) {
    lines.push("", `MARKET DRAFT: ${intent.marketDraft.title}`);
    buttons.push([{ text: "Deploy on Aetheria ↗", url: API_URL }]);
  }
  if (buttons.length === 0) {
    buttons.push([{ text: "Open Aetheria ↗", url: API_URL }]);
  }

  await tg("sendMessage", {
    chat_id: chatId,
    text: lines.join("\n"),
    reply_markup: { inline_keyboard: buttons },
  });
}

async function main() {
  const me = await tg("getMe", {});
  log(`online as @${me.username} · API ${API_URL}`);

  let offset = 0;
  while (!stopping) {
    try {
      const updates = await tg("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message"],
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg?.text) continue;
        try {
          await handleMessage(msg.chat.id, msg.text.trim());
        } catch (err) {
          log(`handler error: ${err.message}`);
          await tg("sendMessage", {
            chat_id: msg.chat.id,
            text: "Something went wrong - try again in a moment.",
          }).catch(() => {});
        }
      }
    } catch (err) {
      log(`poll error: ${err.message} - backing off`);
      await sleep(5000);
    }
  }
  log("offline");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
