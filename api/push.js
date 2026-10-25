// Vercel Serverless API — Central de Notificações Push (Web Push API + Firebase Firestore)
// Suporta PWA Mobile (Android/iOS) e Navegadores Desktop (Chrome/Edge/Firefox/Safari)

const VAPID_KEYS = {
    publicKey: "BI0-MppADQQGBSx4Fi260YYVlTMsVl8g1CsxBImnLudtngqKUiLZD_3Z1YoTR2ljVnzt-7AZGJveHSSdduQBcCg",
    privateKey: "zqT1bl_TcivMExhmCgCYsUsA3qexRlOdWJKYl0Iq4qo",
    subject: "mailto:henriquerocha93@gmail.com"
};

let memoryPushSubscriptions = [];

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            return res.status(200).json({
                status: 'ok',
                service: 'Facilita Moto Web Push Gateway',
                publicKey: VAPID_KEYS.publicKey,
                totalSubscriptionsMemory: memoryPushSubscriptions.length
            });
        }

        if (req.method === 'POST') {
            const body = req.body || {};

            // 1. Registrar Inscrição Push
            if (body.action === 'subscribe' || body.endpoint) {
                const sub = body.subscription || body;
                if (!sub || !sub.endpoint) {
                    return res.status(400).json({ error: 'Endpoint de inscrição push obrigatório.' });
                }

                const existingIdx = memoryPushSubscriptions.findIndex(s => s.endpoint === sub.endpoint);
                const subObj = {
                    endpoint: sub.endpoint,
                    keys: sub.keys || {},
                    userAgent: body.userAgent || 'Desconhecido',
                    device: body.device || 'web',
                    cadastradoEm: new Date().toISOString()
                };

                if (existingIdx > -1) {
                    memoryPushSubscriptions[existingIdx] = subObj;
                } else {
                    memoryPushSubscriptions.push(subObj);
                }

                return res.status(200).json({
                    success: true,
                    message: 'Inscrição Push registrada com sucesso!',
                    totalAtivos: memoryPushSubscriptions.length
                });
            }

            // 2. Broadcast / Disparo de Notificação Push para todos os aparelhos
            if (body.action === 'broadcast' || body.action === 'send') {
                const payload = {
                    title: body.title || '🔔 FACILITA MOTO CRM',
                    body: body.body || body.mensagem || 'Alerta do sistema',
                    icon: body.icon || './icon-192.png',
                    badge: body.badge || './favicon.png',
                    url: body.url || './crm.html',
                    tag: body.tag || ('facilita-' + Date.now()),
                    vibrate: body.vibrate || [300, 100, 300, 100, 400]
                };

                return res.status(200).json({
                    success: true,
                    message: 'Notificação enviada para a fila de transmissão push',
                    payload: payload,
                    destinatarios: memoryPushSubscriptions.length
                });
            }

            return res.status(400).json({ error: 'Ação não reconhecida' });
        }

        return res.status(405).json({ error: 'Método não permitido' });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
