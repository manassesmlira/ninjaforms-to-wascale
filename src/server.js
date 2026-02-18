import express from "express";
import axios from "axios";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const WASCALE_TOKEN = process.env.WASCALE_TOKEN || "";
const WASCALE_BASE = process.env.WASCALE_BASE || "https://api-whatsapp.wascript.com.br";

// Coloque aqui o endpoint REAL do Wascale quando você confirmar na doc
// Exemplos fictícios: "/api/messages/sendText" ou "/messages/send"
const WASCALE_SEND_ENDPOINT = process.env.WASCALE_SEND_ENDPOINT || "";

// ===== util =====
const digits = (v) => String(v || "").replace(/\D/g, "");

function toE164BR(raw) {
  const d = digits(raw);
  if (!d) return "";
  if (d.startsWith("55")) return `+${d}`;
  if (d.length >= 10) return `+55${d}`;
  return "";
}



function pickFieldValue(payload, labelContains, keyContains = "") {
  const data = payload?.form_submit_data || {};
  const wantedLabel = labelContains.toLowerCase();
  const wantedKey = keyContains.toLowerCase();

  for (const k of Object.keys(data)) {
    const item = data[k];
    const label = String(item?.label || "").toLowerCase();
    const key = String(item?.key || "").toLowerCase();

    if (label.includes(wantedLabel)) return item?.value ?? "";
    if (wantedKey && key.includes(wantedKey)) return item?.value ?? "";
  }
  return "";
}

// dedupe simples em memória (pra evitar repetição em caso de reenvio)
// para produção top, a gente pode trocar por arquivo/redis, mas aqui já ajuda
const seen = new Map(); // last6 -> timestamp
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

function cleanupSeen() {
  const now = Date.now();
  for (const [k, t] of seen.entries()) {
    if (now - t > TTL_MS) seen.delete(k);
  }
}
setInterval(cleanupSeen, 1000 * 60 * 30).unref();

app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/webhook/ninja", async (req, res) => {
  console.log("CHEGOU WEBHOOK /webhook/ninja", new Date().toISOString());
  console.log(JSON.stringify(req.body));
  
});

app.post("/webhook/ninja", async (req, res) => {
  try {
    // 1) segurança simples por header
    const incomingSecret = req.header("x-webhook-secret") || "";
    if (WEBHOOK_SECRET && incomingSecret !== WEBHOOK_SECRET) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    // 2) extrair campos
console.log("ENTROU NO HANDLER");

const nameRaw = pickFieldValue(req.body, "Primeiro nome", "firstname");
const phoneRaw = pickFieldValue(req.body, "Telefone", "phone");

console.log("EXTRAIDO:", { nameRaw, phoneRaw });




    const name = String(nameRaw || "").trim();
    const phone = toE164BR(phoneRaw);

    if (!name || !phone) {
      return res.status(400).json({
        ok: false,
        error: "missing name/phone",
        name,
        phoneRaw
      });
    }

    const last6 = digits(phone).slice(-6);

    // 3) dedupe: se chegar igual (últimos 6) de novo, ignora
    if (seen.has(last6)) {
      return res.json({ ok: true, deduped: true, contact: { name, phone, last6 } });
    }
    seen.set(last6, Date.now());

console.log("VOU ENVIAR:", url);


    
    // 4) se você ainda não definiu endpoint do Wascale, só confirma recebimento
    if (!WASCALE_SEND_ENDPOINT || !WASCALE_TOKEN) {
      return res.json({
        ok: true,
        warning: "WASCALE_SEND_ENDPOINT ou WASCALE_TOKEN não configurado ainda",
        contact: { name, phone, last6 }
      });
    }

    // 5) chamar Wascale - geralmente enviar uma msg cria o contato no painel
    // Ajuste o BODY conforme a doc do Wascale
    const payload = {
      to: phone,
      text: `Graça e paz, ${name}! Recebi seu cadastro. Já já te envio o material por aqui.`
    };

const url = `${WASCALE_BASE}${WASCALE_SEND_ENDPOINT}/${WASCALE_TOKEN}`;

const mensagem = `Olá! 👋
Graça e Paz ${name.split(" ")[0]} 🕊️

Acompanhe todo nosso trabalho pelo 💛 CANAL WHATSAPP
👉👉 - Clique aqui https://pregadormanasses.com/canal 


⚠️🚨muito importante🚨⚠️
➡️ Salva o meu Contato ✉️

➡️ Baixe nosso guia de Pregação Passo a Passo

Link na Bio do Canal

att,,
Pregador Manasses
Levando Avivamento🔥 Trazendo Almas a Cristo ✝️`;

console.log("VOU ENVIAR WASCALE:", url, digits(phone));

const resp = await axios.post(url, null, {
  params: { phone: digits(phone), message: mensagem },
  timeout: 15000
});

console.log("WASCALE OK:", resp.status, resp.data);





// ===== ENVIAR CONTATO (vCard) =====
await new Promise(r => setTimeout(r, 2000));
const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Pregador Manassés
ORG:Clube de Pregadores
TEL;TYPE=CELL:+5511956005068
URL:https://clubedepregadores.com.br
END:VCARD`;

const base64Vcard = Buffer.from(vcard).toString("base64");

const urlDoc = `${WASCALE_BASE}/api/enviar-documento/${WASCALE_TOKEN}`;

await axios.post(urlDoc, {
  phone: digits(phone),
  base64: `data:text/vcard;base64,${base64Vcard}`,
  name: "Pregador-Manasses.vcf"
});


    return res.json({ ok: true, sent: true, contact: { name, phone, last6 }, wascale: resp.data });
  } catch (err) {
    console.log("WASCALE ERR:", err?.response?.status, err?.response?.data || err.message);

    const details = err?.response?.data || err.message;
    return res.status(500).json({ ok: false, error: details });
  }
});

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
