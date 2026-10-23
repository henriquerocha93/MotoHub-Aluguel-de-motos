// ============================================================================
// VERCEL SERVERLESS API — INTEGRAÇÃO OFICIAL WHATSAPP BUSINESS CLOUD API (META)
// Disparo 100% Autônomo (Zero Intervenção Humana) de Cobranças PIX 08:00h,
// Aviso de Bloqueio 18:00h, Liberação Pós-PIX e Alertas de Troca de Óleo (1.000/1.100 km)
// ============================================================================

if (!global.__facilitaWhatsAppLogs) {
    global.__facilitaWhatsAppLogs = [];
}

function normalizarTelefoneBrasil(telefone) {
    const digitos = String(telefone || '').replace(/\D/g, '');
    if (!digitos) return '';
    // Se já começa com 55 e tem 12 ou 13 dígitos
    if (digitos.startsWith('55') && digitos.length >= 12) {
        return digitos;
    }
    // Se tem DDD + número (10 ou 11 dígitos), prefixa 55
    if (digitos.length === 10 || digitos.length === 11) {
        return `55${digitos}`;
    }
    return digitos;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const logs = global.__facilitaWhatsAppLogs;

    // ========================================================================
    // 1. GET: CONSULTAR FILA / HISTÓRICO DE DISPAROS AUTOMÁTICOS WHATSAPP API
    // ========================================================================
    if (req.method === 'GET') {
        const hasEnvMeta = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
        return res.status(200).json({
            ok: true,
            autonomousMode: true,
            envConfigured: hasEnvMeta,
            totalDisparos: logs.length,
            logs: logs.slice(0, 50)
        });
    }

    // ========================================================================
    // 2. POST: DISPARAR MENSAGEM AUTOMÁTICA EM BACKGROUND (ZERO INTERVENÇÃO)
    // ========================================================================
    if (req.method === 'POST') {
        let body = req.body || {};
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) { body = {}; }
        }

        const {
            telefone,
            clienteNome,
            motoPlaca,
            motoModelo,
            tipo, // 'cobranca_08h', 'bloqueio_18h', 'desbloqueio_pix', 'troca_oleo_1000km', 'bloqueio_motor_1100km', 'teste_api'
            mensagem,
            pixCopiaECola,
            config = {}
        } = body;

        const numeroDestino = normalizarTelefoneBrasil(telefone);
        if (!numeroDestino || numeroDestino.length < 10) {
            return res.status(400).json({
                ok: false,
                error: 'Número de WhatsApp do destinatário inválido ou não cadastrado.'
            });
        }

        const provider = config.provider || process.env.WHATSAPP_PROVIDER || 'meta_cloud';
        const metaToken = config.metaAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || '';
        const metaPhoneId = config.metaPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
        const metaVersion = config.metaApiVersion || 'v20.0';
        const gatewayUrl = config.gatewayUrl || process.env.WHATSAPP_GATEWAY_URL || '';
        const gatewayToken = config.gatewayToken || process.env.WHATSAPP_GATEWAY_TOKEN || '';

        let apiDelivered = false;
        let apiResponseData = null;
        let providerUsed = provider;
        let errorDetail = null;

        // --------------------------------------------------------------------
        // OPÇÃO A: API OFICIAL DO WHATSAPP BUSINESS CLOUD (META GRAPH API)
        // https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages
        // --------------------------------------------------------------------
        if (provider === 'meta_cloud' && metaToken && metaPhoneId) {
            try {
                const graphUrl = `https://graph.facebook.com/${metaVersion}/${encodeURIComponent(metaPhoneId)}/messages`;

                // 1º Disparo: Mensagem Principal (Cobrança 08h / Bloqueio 18h / Troca de Óleo / Recibo)
                const payloadPrincipal = {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: numeroDestino,
                    type: 'text',
                    text: {
                        preview_url: false,
                        body: String(mensagem || '')
                    }
                };

                const resp = await fetch(graphUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${metaToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payloadPrincipal)
                });

                const respJson = await resp.json();
                if (resp.ok && respJson && (respJson.messages || respJson.messaging_product)) {
                    apiDelivered = true;
                    apiResponseData = respJson;
                    providerUsed = 'Meta WhatsApp Cloud API Oficial';

                    // Se houver código PIX Copia e Cola separado, envia em seguida facilitando copiar no celular
                    if (pixCopiaECola && String(pixCopiaECola).trim().length > 15) {
                        await fetch(graphUrl, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${metaToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                messaging_product: 'whatsapp',
                                recipient_type: 'individual',
                                to: numeroDestino,
                                type: 'text',
                                text: {
                                    preview_url: false,
                                    body: String(pixCopiaECola).trim()
                                }
                            })
                        }).catch(() => {});
                    }
                } else {
                    errorDetail = respJson?.error?.message || 'Credenciais Meta Cloud API pendentes de verificação';
                }
            } catch (err) {
                errorDetail = err.message;
            }
        }

        // --------------------------------------------------------------------
        // OPÇÃO B: GATEWAY REST AUTOMÁTICO (Z-API / EVOLUTION API / ULTRAMSG / WEBHOOK)
        // --------------------------------------------------------------------
        if (!apiDelivered && gatewayUrl && gatewayUrl.startsWith('http')) {
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (gatewayToken) {
                    headers['Authorization'] = `Bearer ${gatewayToken}`;
                    headers['Client-Token'] = gatewayToken;
                    headers['apikey'] = gatewayToken;
                }

                // Formato universal compatível com Z-API, Evolution API e Webhooks n8n/Make
                const gatewayPayload = {
                    phone: numeroDestino,
                    number: numeroDestino,
                    to: numeroDestino,
                    message: String(mensagem || ''),
                    text: String(mensagem || ''),
                    textMessage: { text: String(mensagem || '') },
                    pixCopiaECola: pixCopiaECola || '',
                    clienteNome: clienteNome || '',
                    motoPlaca: motoPlaca || '',
                    motoModelo: motoModelo || '',
                    tipoEvento: tipo || 'notificacao_automatica',
                    origem: 'FACILITA_MOTO_AUTONOMO'
                };

                const gwResp = await fetch(gatewayUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(gatewayPayload)
                });

                if (gwResp.ok) {
                    apiDelivered = true;
                    providerUsed = 'WhatsApp Gateway API (Automático)';
                    try { apiResponseData = await gwResp.json(); } catch (e) { apiResponseData = { status: 'sent' }; }
                } else {
                    errorDetail = `Gateway HTTP ${gwResp.status}`;
                }
            } catch (err) {
                errorDetail = err.message;
            }
        }

        // Registra no Log de Disparos Autônomos do Servidor
        const logEntry = {
            id: `WA-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            telefone: numeroDestino,
            clienteNome: clienteNome || 'Locatário',
            motoPlaca: motoPlaca || '-',
            motoModelo: motoModelo || 'Moto',
            tipo: tipo || 'notificacao_automatica',
            status: apiDelivered ? 'ENVIADO_API_OFICIAL' : 'REGISTRADO_FILA_AUTONOMA',
            provider: apiDelivered ? providerUsed : 'Fila Autônoma Cloud (Aguardando Token Meta/Gateway)',
            mensagemResumo: String(mensagem || '').substring(0, 140) + (String(mensagem || '').length > 140 ? '...' : ''),
            mensagemCompleta: String(mensagem || ''),
            pixCopiaECola: pixCopiaECola || '',
            apiMessageId: apiResponseData?.messages?.[0]?.id || apiResponseData?.messageId || null,
            errorDetail,
            disparadoEm: new Date().toISOString()
        };

        logs.unshift(logEntry);
        if (logs.length > 200) logs.length = 200;

        return res.status(200).json({
            ok: true,
            autonomous: true,
            deliveredViaExternalApi: apiDelivered,
            log: logEntry
        });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
