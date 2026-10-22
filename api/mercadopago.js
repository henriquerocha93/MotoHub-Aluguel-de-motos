// ============================================================================
// VERCEL SERVERLESS API — INTEGRAÇÃO MERCADO PAGO PIX & AUTOMAÇÃO DE DESBLOQUEIO
// Gera cobranças PIX dinâmicas, recebe Webhooks do Mercado Pago e consulta status
// ============================================================================

if (!global.__facilitaMpPaymentsStore) {
    global.__facilitaMpPaymentsStore = {};
}

// Função utilitária CRC16-CCITT (0xFFFF) para gerar Payload PIX EMV (BRCode) válido
function calcularCRC16Pix(payload) {
    let crc = 0xFFFF;
    const polynomial = 0x1021;
    for (let i = 0; i < payload.length; i++) {
        crc ^= (payload.charCodeAt(i) << 8);
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = ((crc << 1) ^ polynomial) & 0xFFFF;
            } else {
                crc = (crc << 1) & 0xFFFF;
            }
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatEmvField(id, value) {
    const str = String(value || '');
    const len = str.length.toString().padStart(2, '0');
    return `${id}${len}${str}`;
}

function gerarPayloadPixBrCode({ chavePix, nomeBeneficiario, cidade, valor, txid, descricao }) {
    const chaveLimpa = String(chavePix || '85221619091').trim();
    const nomeLimpo = String(nomeBeneficiario || 'HENRIQUE ROCHA CLAVIJO')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().substring(0, 25);
    const cidadeLimpa = String(cidade || 'PORTO ALEGRE')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().substring(0, 15);
    const txidLimpo = String(txid || 'FACILITAMOTO').replace(/[^a-zA-Z0-9]/g, '').substring(0, 25) || 'FACILITAMOTO';
    const valorFormatado = (parseFloat(valor) || 0).toFixed(2);

    const gui = formatEmvField('00', 'br.gov.bcb.pix');
    const keyField = formatEmvField('01', chaveLimpa);
    const descField = descricao ? formatEmvField('02', String(descricao).substring(0, 25)) : '';
    const merchantAccount = formatEmvField('26', `${gui}${keyField}${descField}`);

    const payloadSemCrc =
        formatEmvField('00', '01') +
        formatEmvField('01', '12') +
        merchantAccount +
        formatEmvField('52', '0000') +
        formatEmvField('53', '986') +
        (parseFloat(valorFormatado) > 0 ? formatEmvField('54', valorFormatado) : '') +
        formatEmvField('58', 'BR') +
        formatEmvField('59', nomeLimpo) +
        formatEmvField('60', cidadeLimpa) +
        formatEmvField('62', formatEmvField('05', txidLimpo)) +
        '6304';

    const crc = calcularCRC16Pix(payloadSemCrc);
    return `${payloadSemCrc}${crc}`;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const mpStore = global.__facilitaMpPaymentsStore;

    // ========================================================================
    // 1. GET: CONSULTAR STATUS DO PIX (POLLING AUTOMÁTICO PARA DESBLOQUEAR MOTO)
    // ========================================================================
    if (req.method === 'GET') {
        const { contratoId, paymentId, accessToken } = req.query || {};
        const token = accessToken || process.env.MP_ACCESS_TOKEN || '';
        const keyRef = contratoId || paymentId || '';

        let charge = mpStore[keyRef] || Object.values(mpStore).find(c => String(c.paymentId) === String(paymentId) || String(c.contratoId) === String(contratoId)) || null;

        // Se houver token do Mercado Pago e um paymentId numérico real, consulta diretamente na API do Mercado Pago
        if (token && paymentId && /^\d+$/.test(String(paymentId))) {
            try {
                const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                if (mpResp.ok) {
                    const mpData = await mpResp.json();
                    const novoStatus = mpData.status || (charge ? charge.status : 'pending');
                    charge = Object.assign({}, charge || {}, {
                        paymentId: String(mpData.id),
                        contratoId: mpData.external_reference || contratoId || '',
                        status: novoStatus,
                        statusDetail: mpData.status_detail || '',
                        valor: mpData.transaction_amount || (charge ? charge.valor : 0),
                        approvedAt: mpData.date_approved || (novoStatus === 'approved' ? new Date().toISOString() : null),
                        provider: 'mercadopago_official'
                    });
                    if (charge.contratoId) mpStore[charge.contratoId] = charge;
                    mpStore[String(mpData.id)] = charge;
                }
            } catch (err) {
                // Mantém cache em caso de falha de rede momentânea
            }
        }

        return res.status(200).json({
            ok: true,
            charge: charge || null,
            timestamp: new Date().toISOString()
        });
    }

    // ========================================================================
    // 2. POST: CRIAR COBRANÇA PIX, RECEBER WEBHOOK OU CONFIRMAR PIX
    // ========================================================================
    if (req.method === 'POST') {
        let body = req.body || {};
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) { body = {}; }
        }

        const action = body.action || '';
        const token = body.accessToken || process.env.MP_ACCESS_TOKEN || '';

        // 2.1. Webhook Oficial do Mercado Pago (notificação automática quando cliente paga o PIX)
        if (body.type === 'payment' || (body.action && String(body.action).startsWith('payment.')) || (body.data && body.data.id && !action)) {
            const mpPaymentId = body.data?.id || body.id;
            if (mpPaymentId && token) {
                try {
                    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    if (mpResp.ok) {
                        const mpData = await mpResp.json();
                        const extRef = mpData.external_reference || '';
                        const updatedCharge = Object.assign({}, mpStore[extRef] || mpStore[String(mpPaymentId)] || {}, {
                            paymentId: String(mpData.id),
                            contratoId: extRef,
                            status: mpData.status || 'pending',
                            valor: mpData.transaction_amount,
                            approvedAt: mpData.date_approved || (mpData.status === 'approved' ? new Date().toISOString() : null),
                            updatedAt: new Date().toISOString()
                        });
                        if (extRef) mpStore[extRef] = updatedCharge;
                        mpStore[String(mpPaymentId)] = updatedCharge;
                    }
                } catch (e) {}
            }
            return res.status(200).json({ ok: true, webhookReceived: true });
        }

        // 2.2. Confirmar / Aprovar PIX (Webhook simulado ou confirmação imediata via API)
        if (action === 'confirm_pix') {
            const { contratoId, paymentId, valor } = body;
            const key = contratoId || paymentId || 'default';
            const existing = mpStore[key] || (paymentId ? mpStore[paymentId] : null) || {};
            const approvedCharge = Object.assign({}, existing, {
                paymentId: existing.paymentId || paymentId || `MP-${Date.now()}`,
                contratoId: contratoId || existing.contratoId || '',
                valor: parseFloat(valor || existing.valor || 0),
                status: 'approved',
                statusDetail: 'accredited',
                approvedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            if (contratoId) mpStore[contratoId] = approvedCharge;
            if (approvedCharge.paymentId) mpStore[approvedCharge.paymentId] = approvedCharge;

            return res.status(200).json({
                ok: true,
                message: 'Pagamento PIX confirmado com sucesso! Ordem de desbloqueio automático liberada.',
                charge: approvedCharge
            });
        }

        // 2.3. Criar Cobrança PIX Semanal (API Mercado Pago /v1/payments + Fallback BRCode PIX)
        if (action === 'create_pix' || !action) {
            const {
                contratoId,
                clienteNome,
                clienteCpf,
                clienteEmail,
                motoPlaca,
                motoModelo,
                valor,
                vencimento,
                chavePix,
                beneficiario
            } = body;

            const valorNum = parseFloat(valor) || 350.00;
            const descricaoCob = `Aluguel Semanal Moto ${motoModelo || ''} (${motoPlaca || ''}) - Venc: ${vencimento || 'Hoje'}`.trim();

            // Tenta criar na API Oficial do Mercado Pago se o Access Token estiver configurado
            if (token && token.length > 15) {
                try {
                    const cpfLimpo = String(clienteCpf || '').replace(/\D/g, '');
                    const partesNome = String(clienteNome || 'Locatario Facilita Moto').trim().split(' ');
                    const firstName = partesNome[0] || 'Cliente';
                    const lastName = partesNome.slice(1).join(' ') || 'Locatario';
                    const emailPagador = (clienteEmail && clienteEmail.includes('@'))
                        ? clienteEmail.trim()
                        : `locatario.${contratoId || 'moto'}@facilitamoto.com.br`;

                    const mpPayload = {
                        transaction_amount: Number(valorNum.toFixed(2)),
                        description: descricaoCob,
                        payment_method_id: 'pix',
                        external_reference: String(contratoId || ''),
                        payer: {
                            email: emailPagador,
                            first_name: firstName,
                            last_name: lastName,
                            identification: cpfLimpo.length === 11 ? {
                                type: 'CPF',
                                number: cpfLimpo
                            } : undefined
                        }
                    };

                    const idempotencyKey = `facilita-${contratoId || 'avulso'}-${vencimento || Date.now()}-${Math.floor(Date.now() / 60000)}`;
                    const mpResp = await fetch('https://api.mercadopago.com/v1/payments', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            'X-Idempotency-Key': idempotencyKey
                        },
                        body: JSON.stringify(mpPayload)
                    });

                    const mpData = await mpResp.json();
                    if (mpResp.ok && mpData && mpData.id) {
                        const txData = mpData.point_of_interaction?.transaction_data || {};
                        const copiaECola = txData.qr_code || '';
                        const qrCodeBase64 = txData.qr_code_base64 ? `data:image/png;base64,${txData.qr_code_base64}` : '';
                        const ticketUrl = txData.ticket_url || '';

                        const chargeObj = {
                            paymentId: String(mpData.id),
                            contratoId: String(contratoId || ''),
                            clienteNome: clienteNome || '',
                            motoPlaca: motoPlaca || '',
                            motoModelo: motoModelo || '',
                            valor: Number(valorNum.toFixed(2)),
                            vencimento: vencimento || '',
                            copiaECola,
                            qrCodeUrl: qrCodeBase64 || `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(copiaECola)}`,
                            ticketUrl,
                            status: mpData.status || 'pending',
                            provider: 'mercadopago_official',
                            createdAt: new Date().toISOString()
                        };

                        if (contratoId) mpStore[String(contratoId)] = chargeObj;
                        mpStore[String(mpData.id)] = chargeObj;

                        return res.status(200).json({
                            ok: true,
                            provider: 'mercadopago_official',
                            charge: chargeObj
                        });
                    }
                } catch (err) {
                    // Prossegue para gerador PIX BRCode EMV caso o token seja inválido ou sem conexão
                }
            }

            // Fallback Inteligente: Gera Payload PIX EMV (BRCode Copia e Cola) + QR Code compatível com Mercado Pago e qualquer banco
            const txid = `FM${String(motoPlaca || '').replace(/[^A-Z0-9]/gi, '')}${String(vencimento || '').replace(/\D/g, '')}`.substring(0, 25);
            const copiaEColaFallback = gerarPayloadPixBrCode({
                chavePix: chavePix || '85221619091',
                nomeBeneficiario: beneficiario || 'HENRIQUE ROCHA CLAVIJO',
                cidade: 'PORTO ALEGRE',
                valor: valorNum,
                txid,
                descricao: `ALUGUEL ${motoPlaca || 'MOTO'}`
            });

            const paymentIdGerado = `MP-${Date.now().toString().slice(-8)}`;
            const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(copiaEColaFallback)}`;

            const chargeFallback = {
                paymentId: paymentIdGerado,
                contratoId: String(contratoId || ''),
                clienteNome: clienteNome || '',
                motoPlaca: motoPlaca || '',
                motoModelo: motoModelo || '',
                valor: Number(valorNum.toFixed(2)),
                vencimento: vencimento || '',
                copiaECola: copiaEColaFallback,
                qrCodeUrl,
                ticketUrl: '',
                status: 'pending',
                provider: 'mercadopago_pix_brcode',
                createdAt: new Date().toISOString()
            };

            if (contratoId) mpStore[String(contratoId)] = chargeFallback;
            mpStore[paymentIdGerado] = chargeFallback;

            return res.status(200).json({
                ok: true,
                provider: 'mercadopago_pix_brcode',
                charge: chargeFallback
            });
        }
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
