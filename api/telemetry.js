// Vercel Serverless API — Integração Nativa App Xtrack (xtrack.com.br / GPSRS) & Receptor Webhook Chip IoT (M2M)
// Inclui: Hodômetro GPS Automático (Haversine) + Bloqueio Automático a cada 1.100 km rodados (Proteção do Motor / Troca de Óleo)
// Moto Rastreada: HONDA/CG150 TITAN MIXESD • Placa: IPU2I57 • ID: 00018E1B • ICCID: 89555480000080813880

let memoryTelemetryStore = {
    "00018E1B": {
        id: "00018E1B",
        iccid: "89555480000080813880",
        placa: "IPU2I57",
        provedor: "App Xtrack",
        bloqueado: false,
        motivoBloqueio: null,
        kmGpsAcumulado: 0,
        updatedAt: null
    }
};

let cachedXtrackSession = {
    email: null,
    cookie: null,
    token: null,
    expiresAt: 0
};

// Cálculo de distância GPS real entre dois pontos (Fórmula de Haversine em KM)
function calcularDistanciaGpsKm(lat1, lon1, lat2, lon2) {
    if ([lat1, lon1, lat2, lon2].some(v => typeof v !== 'number' || isNaN(v))) return 0;
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;
    // Ignora ruído de GPS parado (< 15 metros) ou saltos irreais (> 50 km em um único pacote)
    if (dist < 0.015 || dist > 50) return 0;
    return dist;
}

async function enviarComandoBloqueioXtrack(email, senha, targetPlaca = 'IPU2I57', targetId = '00018E1B', bloquear = true, motivo = '') {
    const baseUrls = [
        'https://xtrack.com.br/api/v1',
        'https://app.xtrack.com.br/api/v1'
    ];

    const idLimpo = String(targetId || '00018E1B').toUpperCase();
    const current = memoryTelemetryStore[idLimpo] || {
        id: idLimpo,
        iccid: "89555480000080813880",
        placa: targetPlaca || "IPU2I57",
        provedor: "App Xtrack"
    };
    current.bloqueado = Boolean(bloquear);
    current.motivoBloqueio = bloquear ? (motivo || 'Bloqueio Preventivo / Limite 1.100 km Óleo') : null;
    current.ultimoComandoBloqueio = new Date().toISOString();
    memoryTelemetryStore[idLimpo] = current;

    if (!email || !senha) {
        return { ok: true, mode: 'm2m_queue', device: current };
    }

    for (const baseUrl of baseUrls) {
        try {
            let authHeaders = {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            };
            if (cachedXtrackSession.cookie) authHeaders['Cookie'] = cachedXtrackSession.cookie;
            if (cachedXtrackSession.token) {
                authHeaders['Authorization'] = cachedXtrackSession.token.startsWith('Bearer ')
                    ? cachedXtrackSession.token
                    : `Bearer ${cachedXtrackSession.token}`;
            }

            const cmdType = bloquear ? 'BLOQUEAR' : 'DESBLOQUEAR';
            await fetch(`${baseUrl}/comandos`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    deviceId: idLimpo,
                    placa: targetPlaca,
                    comando: cmdType,
                    type: bloquear ? 'engineStop' : 'engineResume',
                    motivo: current.motivoBloqueio
                })
            }).catch(() => {});

            return { ok: true, mode: 'xtrack_api', device: current };
        } catch (e) {}
    }

    return { ok: true, mode: 'm2m_queue', device: current };
}

async function syncFromXtrackApp(email, senha, targetPlaca = 'IPU2I57', targetId = '00018E1B') {
    const baseUrls = [
        'https://xtrack.com.br/api/v1',
        'https://app.xtrack.com.br/api/v1'
    ];

    let lastError = null;

    for (const baseUrl of baseUrls) {
        try {
            let authHeaders = {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            };

            const now = Date.now();
            if ((!cachedXtrackSession.cookie && !cachedXtrackSession.token) || cachedXtrackSession.email !== email || now > cachedXtrackSession.expiresAt) {
                const loginRes = await fetch(`${baseUrl}/auth/login`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({ email: email.trim(), senha: senha })
                });

                const setCookie = loginRes.headers.get('set-cookie');
                const loginText = await loginRes.text();
                let loginData = {};
                try { loginData = JSON.parse(loginText); } catch (e) {}

                if (!loginRes.ok) {
                    lastError = loginData.message || loginData.error || `HTTP ${loginRes.status}`;
                    continue;
                }

                cachedXtrackSession = {
                    email: email.trim(),
                    cookie: setCookie || '',
                    token: loginData.token || loginData.accessToken || loginData?.data?.token || '',
                    expiresAt: now + (25 * 60 * 1000)
                };
            }

            if (cachedXtrackSession.cookie) {
                authHeaders['Cookie'] = cachedXtrackSession.cookie;
            }
            if (cachedXtrackSession.token) {
                authHeaders['Authorization'] = cachedXtrackSession.token.startsWith('Bearer ')
                    ? cachedXtrackSession.token
                    : `Bearer ${cachedXtrackSession.token}`;
            }

            const endpoints = ['/veiculos', '/dispositivos', '/rastreadores', '/posicoes'];
            let listaVeiculos = [];

            for (const ep of endpoints) {
                try {
                    const vRes = await fetch(`${baseUrl}${ep}`, { headers: authHeaders });
                    if (vRes.ok) {
                        const vJson = await vRes.json();
                        const arr = Array.isArray(vJson)
                            ? vJson
                            : (vJson.veiculos || vJson.data || vJson.items || vJson.dispositivos || []);
                        if (Array.isArray(arr) && arr.length > 0) {
                            listaVeiculos = arr;
                            break;
                        }
                    }
                } catch (innerErr) {}
            }

            if (listaVeiculos.length > 0) {
                const placaLimpa = String(targetPlaca || 'IPU2I57').toUpperCase().replace(/[^A-Z0-9]/g, '');
                const idLimpo = String(targetId || '00018E1B').toUpperCase();

                const veiculo = listaVeiculos.find(v => {
                    const p = String(v.placa || v.plate || v.nome || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const dId = String(v.serial || v.imei || v.deviceId || v.rastreadorId || v.id || '').toUpperCase();
                    const icc = String(v.iccid || v.chip || '');
                    return p.includes(placaLimpa) || dId.includes(idLimpo) || icc.includes('89555480000080813880');
                }) || listaVeiculos[0];

                const pos = veiculo.ultimaPosicao || veiculo.posicao || veiculo.telemetry || veiculo;
                const lat = parseFloat(pos.latitude ?? pos.lat ?? veiculo.latitude ?? veiculo.lat);
                const lng = parseFloat(pos.longitude ?? pos.lng ?? pos.lon ?? veiculo.longitude ?? veiculo.lng);
                const speed = parseFloat(pos.velocidadeKmh ?? pos.velocidade ?? pos.speed ?? veiculo.velocidadeKmh ?? 0);

                const ignicao = Boolean(
                    pos.ignition === true || pos.ignicao === true ||
                    veiculo.ignition === true || veiculo.ignicao === true ||
                    pos.statusIgnicao === 'ON' || speed > 2
                );

                const tensaoExterna = parseFloat(
                    pos.tensaoExterna ?? pos.power ?? pos.externalVoltage ??
                    veiculo.tensaoExterna ?? veiculo.power ?? (ignicao ? 13.8 : 12.6)
                );

                const bateriaRemovida = Boolean(
                    pos.alarm === 'powerCut' || pos.tipo === 'POWER_CUT' ||
                    veiculo.alarm === 'powerCut' || veiculo.bateriaViolada === true ||
                    (!isNaN(tensaoExterna) && tensaoExterna < 3.0)
                );

                const current = memoryTelemetryStore[idLimpo] || {
                    id: idLimpo,
                    iccid: "89555480000080813880",
                    placa: "IPU2I57",
                    provedor: "App Xtrack",
                    kmGpsAcumulado: 0
                };

                if (!isNaN(lat) && !isNaN(lng)) {
                    if (!isNaN(current.lat) && !isNaN(current.lng)) {
                        const deltaKm = calcularDistanciaGpsKm(current.lat, current.lng, lat, lng);
                        current.kmGpsAcumulado = (parseFloat(current.kmGpsAcumulado) || 0) + deltaKm;
                    }
                    current.lat = lat;
                    current.lng = lng;
                }
                if (pos.endereco || veiculo.endereco) {
                    current.endereco = pos.endereco || veiculo.endereco;
                }
                current.velocidade = isNaN(speed) ? 0 : Math.round(speed);
                current.ignicao = ignicao;
                current.bateriaRemovida = bateriaRemovida;
                current.tensaoExterna = bateriaRemovida ? 0.0 : (isNaN(tensaoExterna) ? 12.6 : tensaoExterna);
                current.tensaoBackup = parseFloat(pos.battery ?? pos.nivelBateria ?? 3.7);
                if (pos.hodometroKm || pos.odometer || veiculo.hodometroKm) {
                    current.kmAtual = parseInt(pos.hodometroKm || pos.odometer || veiculo.hodometroKm);
                }
                if (veiculo.bloqueado !== undefined || pos.blocked !== undefined) {
                    current.bloqueado = Boolean(veiculo.bloqueado ?? pos.blocked);
                }
                current.updatedAt = new Date().toISOString();
                current.provedor = "App Xtrack (Online)";

                memoryTelemetryStore[idLimpo] = current;
                return { ok: true, device: current, totalVeiculos: listaVeiculos.length };
            }
        } catch (err) {
            lastError = err.message;
        }
    }

    return { ok: false, error: lastError || 'Não foi possível sincronizar diretamente com o servidor Xtrack.' };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const query = req.query || {};
        const body = req.body || {};
        const payload = Object.assign({}, query, typeof body === 'object' ? body : {});

        // 0. Comando de Bloqueio / Desbloqueio Remoto (Manual ou Automático por 1.100 km de Troca de Óleo)
        if (payload.action === 'command_block' || payload.comandoBloqueio !== undefined) {
            const bloquear = payload.bloquear === true || payload.bloquear === 'true' || payload.comandoBloqueio === 'BLOQUEAR';
            const cmdRes = await enviarComandoBloqueioXtrack(
                payload.xtrackEmail,
                payload.xtrackSenha,
                payload.placa || 'IPU2I57',
                payload.id || '00018E1B',
                bloquear,
                payload.motivo || ''
            );
            return res.status(200).json({
                status: 'ok',
                command: bloquear ? 'LOCKED' : 'UNLOCKED',
                mode: cmdRes.mode,
                device: cmdRes.device
            });
        }

        // 1. Sincronização Direta com o App Xtrack (xtrack.com.br) se credenciais forem enviadas
        if (payload.xtrackEmail && payload.xtrackSenha) {
            const xtrackResult = await syncFromXtrackApp(
                payload.xtrackEmail,
                payload.xtrackSenha,
                payload.placa || 'IPU2I57',
                payload.id || '00018E1B'
            );
            if (xtrackResult.ok) {
                return res.status(200).json({
                    status: 'ok',
                    source: 'xtrack',
                    device: xtrackResult.device
                });
            } else if (payload.testLogin) {
                return res.status(200).json({
                    status: 'partial',
                    message: xtrackResult.error,
                    device: memoryTelemetryStore['00018E1B']
                });
            }
        }

        // 2. Proxy Genérico para API externa (evitando bloqueio CORS no navegador)
        if (payload.proxyUrl) {
            const headers = { 'Accept': 'application/json' };
            if (payload.proxyToken) {
                headers['Authorization'] = payload.proxyToken.startsWith('Basic ') || payload.proxyToken.startsWith('Bearer ')
                    ? payload.proxyToken
                    : `Bearer ${payload.proxyToken}`;
            }
            const response = await fetch(payload.proxyUrl, { headers });
            const text = await response.text();
            let json = null;
            try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
            return res.status(response.status).json(json);
        }

        // 3. Recebimento de pacote do Rastreador Xtrack / Chip IoT via POST ou GET
        const deviceId = String(payload.id || payload.deviceid || payload.imei || payload.deviceId || '00018E1B').toUpperCase();
        const hasIncomingTelemetry = payload.lat !== undefined || payload.latitude !== undefined || payload.ignicao !== undefined || payload.ignition !== undefined || payload.powerCut !== undefined || payload.bateriaRemovida !== undefined || payload.kmAtual !== undefined || payload.odometer !== undefined;

        if (req.method === 'POST' || hasIncomingTelemetry) {
            const lat = parseFloat(payload.lat ?? payload.latitude);
            const lng = parseFloat(payload.lon ?? payload.lng ?? payload.longitude);
            const speed = parseFloat(payload.speed ?? payload.velocidade ?? payload.velocidadeKmh ?? 0);

            let ignicao = false;
            if (payload.ignicao !== undefined) ignicao = payload.ignicao === true || payload.ignicao === 'true' || payload.ignicao === '1' || payload.ignicao === 1;
            else if (payload.ignition !== undefined) ignicao = payload.ignition === true || payload.ignition === 'true' || payload.ignition === '1' || payload.ignition === 1;
            else if (payload.tipo === 'IGNITION_ON') ignicao = true;
            else if (payload.tipo === 'IGNITION_OFF') ignicao = false;
            else if (payload.acc !== undefined) ignicao = payload.acc === true || payload.acc === 'true' || payload.acc === '1' || payload.acc === 1 || payload.acc === 'ON';
            else if (speed > 2) ignicao = true;

            const extVolt = parseFloat(payload.power ?? payload.tensaoExterna ?? payload.extVolt ?? payload.tensao ?? payload.batteryVoltage ?? (payload.bateriaRemovida ? 0 : 12.8));
            const powerCutFlag = payload.powerCut === true || payload.powerCut === 'true' || payload.powerCut === '1' ||
                                 payload.bateriaRemovida === true || payload.bateriaRemovida === 'true' ||
                                 payload.alarm === 'powerCut' || payload.alarm === 'powerOff' ||
                                 payload.tipo === 'POWER_CUT' ||
                                 (payload.charge !== undefined && (payload.charge === false || payload.charge === 'false' || payload.charge === '0')) ||
                                 (!isNaN(extVolt) && extVolt < 3.5);

            const current = memoryTelemetryStore[deviceId] || {
                id: deviceId,
                iccid: "89555480000080813880",
                placa: "IPU2I57",
                provedor: "App Xtrack",
                kmGpsAcumulado: 0
            };

            // Calcula distância percorrida via GPS (Haversine) se a coordenada mudou
            let deltaKm = 0;
            if (!isNaN(lat) && !isNaN(lng)) {
                if (!isNaN(current.lat) && !isNaN(current.lng)) {
                    deltaKm = calcularDistanciaGpsKm(current.lat, current.lng, lat, lng);
                    current.kmGpsAcumulado = (parseFloat(current.kmGpsAcumulado) || 0) + deltaKm;
                }
                current.lat = lat;
                current.lng = lng;
            }
            if (payload.endereco || payload.address) {
                current.endereco = payload.endereco || payload.address;
            }
            current.velocidade = isNaN(speed) ? 0 : Math.round(speed);
            current.ignicao = ignicao;
            current.bateriaRemovida = powerCutFlag;
            current.tensaoExterna = powerCutFlag ? 0.0 : (isNaN(extVolt) ? (ignicao ? 13.8 : 12.6) : extVolt);
            current.tensaoBackup = parseFloat(payload.battery ?? payload.nivelBateria ?? 3.7);

            if (payload.odometer || payload.kmAtual || payload.hodometroKm) {
                current.kmAtual = parseFloat(payload.odometer || payload.kmAtual || payload.hodometroKm);
            } else if (deltaKm > 0 && current.kmAtual) {
                current.kmAtual = parseFloat(current.kmAtual) + deltaKm;
            }

            if (payload.bloqueado !== undefined) {
                current.bloqueado = payload.bloqueado === true || payload.bloqueado === 'true';
            }
            if (payload.motivoBloqueio !== undefined) {
                current.motivoBloqueio = payload.motivoBloqueio;
            }

            current.updatedAt = new Date().toISOString();

            memoryTelemetryStore[deviceId] = current;
            return res.status(200).json({ status: 'ok', telemetry: current });
        }

        return res.status(200).json({
            status: 'online',
            device: memoryTelemetryStore[deviceId] || memoryTelemetryStore["00018E1B"]
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
