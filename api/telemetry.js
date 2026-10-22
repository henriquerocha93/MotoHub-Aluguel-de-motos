// Vercel Serverless API — Receptor Webhook & Proxy Autônomo de Telemetria Chip IoT (M2M)
// Suporta: Suntech / J16 / GT06 / Traccar / OsmAnd / Softruck / Mobiltracker / Getrak / Webhook JSON
let memoryTelemetryStore = {
    "00018E1B": {
        id: "00018E1B",
        iccid: "89555480000080813880",
        placa: "IPU2I57",
        updatedAt: null
    }
};

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

        // Se o CRM solicitou proxy para consultar uma API externa de rastreamento (evitando bloqueio CORS no navegador)
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

        // Recebimento de pacote do Rastreador via POST ou GET (Protocols: OsmAnd, Traccar, Suntech, J16, Webhook)
        const deviceId = String(payload.id || payload.deviceid || payload.imei || payload.deviceId || '00018E1B').toUpperCase();
        const hasIncomingTelemetry = payload.lat !== undefined || payload.latitude !== undefined || payload.ignicao !== undefined || payload.ignition !== undefined || payload.powerCut !== undefined || payload.bateriaRemovida !== undefined;

        if (req.method === 'POST' || hasIncomingTelemetry) {
            const lat = parseFloat(payload.lat ?? payload.latitude);
            const lng = parseFloat(payload.lon ?? payload.lng ?? payload.longitude);
            const speed = parseFloat(payload.speed ?? payload.velocidade ?? 0);

            // Identificação autônoma de Ignição (Ligada / Desligada)
            let ignicao = false;
            if (payload.ignicao !== undefined) ignicao = payload.ignicao === true || payload.ignicao === 'true' || payload.ignicao === '1' || payload.ignicao === 1;
            else if (payload.ignition !== undefined) ignicao = payload.ignition === true || payload.ignition === 'true' || payload.ignition === '1' || payload.ignition === 1;
            else if (payload.acc !== undefined) ignicao = payload.acc === true || payload.acc === 'true' || payload.acc === '1' || payload.acc === 1 || payload.acc === 'ON';
            else if (speed > 2) ignicao = true;

            // Identificação autônoma de Remoção do Cabo da Bateria / Corte de Alimentação Principal
            const extVolt = parseFloat(payload.power ?? payload.extVolt ?? payload.tensao ?? payload.batteryVoltage ?? (payload.bateriaRemovida ? 0 : 12.8));
            const powerCutFlag = payload.powerCut === true || payload.powerCut === 'true' || payload.powerCut === '1' ||
                                 payload.bateriaRemovida === true || payload.bateriaRemovida === 'true' ||
                                 payload.alarm === 'powerCut' || payload.alarm === 'powerOff' ||
                                 (payload.charge !== undefined && (payload.charge === false || payload.charge === 'false' || payload.charge === '0')) ||
                                 (!isNaN(extVolt) && extVolt < 5.0);

            const current = memoryTelemetryStore[deviceId] || { id: deviceId, iccid: "89555480000080813880", placa: "IPU2I57" };
            if (!isNaN(lat) && !isNaN(lng)) {
                current.lat = lat;
                current.lng = lng;
            }
            current.velocidade = isNaN(speed) ? 0 : Math.round(speed);
            current.ignicao = ignicao;
            current.bateriaRemovida = powerCutFlag;
            current.tensaoExterna = powerCutFlag ? 0.0 : (isNaN(extVolt) ? (ignicao ? 13.8 : 12.6) : extVolt);
            current.tensaoBackup = 3.7;
            if (payload.odometer || payload.kmAtual) {
                current.kmAtual = parseInt(payload.odometer || payload.kmAtual);
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
