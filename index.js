const express = require("express");
const fs = require("fs-extra");
const acme = require("acme-client");
const path = require("path");
const app = express();

app.use(express.json());

const directoryUrl = acme.directory.letsencrypt.production; 
const sessions = new Map();

const certsDir = path.join(__dirname, "certs");
fs.ensureDirSync(certsDir);

app.get("/.well-known/acme-challenge/:token", (req, res) => {
    const token = req.params.token;
    for (const session of sessions.values()) {
        if (session.challenge && session.challenge.token === token) {
            return res.send(session.keyAuth);
        }
    }
    res.status(404).send("Challenge token not found");
});

app.get("/download/:domain/:file", (req, res) => {
    const filePath = path.join(certsDir, req.params.domain, req.params.file);
    if (fs.existsSync(filePath)) res.download(filePath);
    else res.status(404).send("File not found");
});

app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>ACME Pro Panel</title>
    <style>
        :root { --bg: #0b0e14; --card: #151921; --primary: #00ff88; --error: #ff4d4d; --text: #e0e0e0; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .container { background: var(--card); padding: 40px; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.7); width: 100%; max-width: 450px; border: 1px solid #2d333b; }
        h2 { text-align: center; margin-bottom: 25px; color: var(--primary); letter-spacing: 1px; }
        .input-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-size: 13px; color: #8b949e; }
        input, select { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #30363d; background: #0d1117; color: #fff; font-size: 15px; box-sizing: border-box; outline: none; transition: 0.3s; }
        input:focus { border-color: var(--primary); box-shadow: 0 0 8px rgba(0,255,136,0.2); }
        .btns { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
        button { padding: 14px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s; font-size: 14px; text-transform: uppercase; }
        #btnStart { background: var(--primary); color: #000; }
        #btnVerify { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; }
        #btnVerify:not(:disabled) { background: #1f6feb; color: #fff; }
        button:hover:not(:disabled) { transform: translateY(-2px); opacity: 0.9; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .dns-info { background: #1c2128; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #58a6ff; display: none; }
        code { color: #ff7b72; font-family: monospace; word-break: break-all; background: #000; padding: 2px 4px; }
        pre { background: #000; padding: 15px; border-radius: 8px; height: 120px; overflow-auto; font-size: 12px; color: #79c0ff; border: 1px solid #30363d; margin-top: 20px; }
        .dl-zone { display: none; margin-top: 20px; text-align: center; border-top: 1px dashed #30363d; padding-top: 20px; }
        .dl-btn { color: var(--primary); text-decoration: none; display: block; margin: 10px 0; font-size: 14px; border: 1px solid var(--primary); padding: 10px; border-radius: 6px; }
        .dl-btn:hover { background: rgba(0,255,136,0.1); }
    </style>
</head>
<body>
    <div class="container">
        <h2>🔐 ACME SSL PRO</h2>
        
        <div class="input-group">
            <label>Домен (domain.com)</label>
            <input id="domain" placeholder="example.com">
        </div>
        
        <div class="input-group">
            <label>Email для уведомлений</label>
            <input id="email" placeholder="admin@example.com">
        </div>

        <div class="input-group">
            <label>Метод проверки</label>
            <select id="type">
                <option value="http-01">HTTP-01 (Файл на сервере)</option>
                <option value="dns-01">DNS-01 (TXT запись)</option>
            </select>
        </div>

        <div id="dnsBox" class="dns-info">
            <b>TXT Host:</b> <code id="dHost"></code><br>
            <b>TXT Value:</b> <code id="dValue"></code>
        </div>

        <div class="btns">
            <button id="btnStart" onclick="doStart()">Шаг 1: Запросить проверку</button>
            <button id="btnVerify" onclick="doVerify()" disabled>Шаг 2: Проверить и Выпустить</button>
        </div>

        <div id="dlZone" class="dl-zone">
            <a id="linkCrt" class="dl-btn" href="#">📄 Скачать Сертификат (.CRT)</a>
            <a id="linkKey" class="dl-btn" href="#">🔑 Скачать Приватный ключ (.KEY)</a>
        </div>

        <pre id="log">Система готова...</pre>
    </div>

    <script>
        const logBox = document.getElementById("log");
        function log(m) { 
            logBox.innerText += "\\n> " + m; 
            logBox.scrollTop = logBox.scrollHeight;
        }

        async function doStart() {
            const domain = document.getElementById("domain").value;
            const email = document.getElementById("email").value;
            const type = document.getElementById("type").value;
            
            if(!domain || !email) return alert("Заполни все поля!");
            
            document.getElementById("btnStart").disabled = true;
            log("Отправка запроса в Let's Encrypt...");

            try {
                const r = await fetch("/start", {
                    method: "POST",
                    headers: {"Content-Type":"application/json"},
                    body: JSON.stringify({domain, email, type})
                });
                const data = await r.json();

                if (data.ok) {
                    document.getElementById("btnVerify").disabled = false;
                    if (type === "dns-01") {
                        document.getElementById("dnsBox").style.display = "block";
                        document.getElementById("dHost").innerText = "_acme-challenge." + domain;
                        document.getElementById("dValue").innerText = data.token;
                        log("Добавьте TXT запись в DNS и подождите 1-2 минуты.");
                    } else {
                        log("Проверка файлом готова. Убедитесь, что порт 80 открыт.");
                    }
                } else {
                    log("ОШИБКА: " + data.error);
                }
            } catch(e) {
                log("СЕТЕВАЯ ОШИБКА: " + e.message);
            } finally {
                document.getElementById("btnStart").disabled = false;
            }
        }

        async function doVerify() {
            const domain = document.getElementById("domain").value;
            document.getElementById("btnVerify").disabled = true;
            log("Начинаем верификацию... Это может занять время.");

            try {
                const r = await fetch("/verify", {
                    method: "POST",
                    headers: {"Content-Type":"application/json"},
                    body: JSON.stringify({domain})
                });
                const data = await r.json();

                  if (data.ok) {
                    log("УСПЕХ! Сертификаты выпущены.");
                    document.getElementById("dlZone").style.display = "block";
                    // Обновляем ссылки на скачивание
                    document.getElementById("linkCrt").href = "/download/" + domain + "/" + domain + ".crt";
                    document.getElementById("linkKey").href = "/download/" + domain + "/" + domain + ".key";
                } else {
                    log("ОШИБКА: " + data.error);
                }
            } catch(e) {
                log("СЕТЕВАЯ ОШИБКА: " + e.message);
            } finally {
                document.getElementById("btnVerify").disabled = false;
            }
        }
    </script>
</body>
</html>
    `);
});

app.post("/start", async (req, res) => {
    const { domain, email, type } = req.body;
    try {
        log(`[${domain}] Создание аккаунта...`);
        const accountKey = await acme.forge.createPrivateKey();
        const client = new acme.Client({ directoryUrl, accountKey });
        await client.createAccount({ termsOfServiceAgreed: true, contact: [`mailto:${email}`] });

        log(`[${domain}] Создание заказа...`);
        const order = await client.createOrder({ identifiers: [{ type: "dns", value: domain }] });
        const authorizations = await client.getAuthorizations(order);
        const challenge = authorizations[0].challenges.find(c => c.type === type);
        const keyAuth = await client.getChallengeKeyAuthorization(challenge);

        sessions.set(domain, { client, order, challenge, keyAuth });
        res.json({ ok: true, token: keyAuth });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.post("/verify", async (req, res) => {
    const { domain } = req.body;
    const session = sessions.get(domain);
    if (!session) return res.status(404).json({ error: "Сессия не найдена" });

    try {
        const { client, order, challenge } = session;
        log(`[${domain}] Подтверждение владения...`);
        await client.completeChallenge(challenge);
        await client.waitForValidStatus(challenge);

        log(`[${domain}] Генерация CSR и выпуск...`);
        const [key, csr] = await acme.forge.createCsr({ commonName: domain });
        await client.finalizeOrder(order, csr);
        const cert = await client.getCertificate(order);

        const dir = path.join(certsDir, domain);
        await fs.ensureDir(dir);
        
        await fs.writeFile(path.join(dir, `${domain}.crt`), cert);
        await fs.writeFile(path.join(dir, `${domain}.key`), key);

        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

function log(msg) { console.log(`[ACME] ${msg}`); }

app.listen(3000, () => console.log("Панель запущена: http://localhost:3000"));
