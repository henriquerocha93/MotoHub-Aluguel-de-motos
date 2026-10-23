// ==========================================
// FIREBASE CLOUD CONFIGURATIONS & HYBRID SYNC
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyDp8U3HYT_XAbZ30dSQlKoh8zw02DLeIvc",
    authDomain: "motohub-9e839.firebaseapp.com",
    projectId: "motohub-9e839",
    storageBucket: "motohub-9e839.firebasestorage.app",
    messagingSenderId: "200673709108",
    appId: "1:200673709108:web:e84d8fdb824cf18fd5ce61"
};

// Initialize Firebase if not already
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = (typeof firebase !== 'undefined') ? firebase.firestore() : null;
window.db = db;
window.isFirebaseSyncing = false; // Flag to prevent echo loops

// Start continuous Realtime synchronization
if (db) {
    if (!localStorage.getItem('crm_cloud_migrated')) {
        let hasData = false;
        const batch = db.batch();
        ['crm_clientes', 'crm_motos', 'crm_contratos', 'crm_admins', 'crm_pagamentos'].forEach(col => {
            const data = JSON.parse(localStorage.getItem(col)) || [];
            if (data.length > 0) {
                hasData = true;
                data.forEach(item => {
                    if (item && item.id) {
                        batch.set(db.collection(col).doc(item.id), item);
                    }
                });
            }
        });
        if (hasData) batch.commit();
        localStorage.setItem('crm_cloud_migrated', 'true');
    }
    ['crm_clientes', 'crm_motos', 'crm_contratos', 'crm_admins', 'crm_pagamentos'].forEach(colName => {
        db.collection(colName).onSnapshot((snapshot) => {
            const arr = [];
            snapshot.forEach(doc => arr.push(doc.data()));

            // Pausa a injeção local de db para evitar loop
            window.isFirebaseSyncing = true;
            localStorage.setItem(colName, JSON.stringify(arr));
            window.isFirebaseSyncing = false;

            // Atualiza a tela se o usuário estiver lá
            if (typeof updateViews === 'function') {
                updateViews();
            }
        }, (error) => {
            console.error("Erro sincronizando " + colName + ": ", error);
        });
    });
}

// ==========================================
// STATE MANAGEMENT (Hybrid LocalStorage)
// ==========================================
function getDb(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || [];
    } catch (e) {
        return [];
    }
}

function saveDb(key, data) {
    // 1. Sempre salva local pra ter UI instantânea
    localStorage.setItem(key, JSON.stringify(data));

    // 2. Sobe a alteração pra nuvem se não vier de sync
    if (!window.isFirebaseSyncing && db) {
        const batch = db.batch();
        data.forEach(item => {
            if (item && item.id) {
                const docRef = db.collection(key).doc(item.id);
                batch.set(docRef, item);
            }
        });
        batch.commit().catch(e => console.error("Batch Cloud erro:", e));
    }
}

function getTrackerConfig() {
    const def = {
        provedor: 'xtrack',
        url: 'https://xtrack.com.br/api/v1 (App Xtrack M2M Ativo)',
        token: '',
        xtrackEmail: '',
        xtrackSenha: '',
        intervaloOleo: 1000,
        avisoAntecipado: 150,
        limiteBloqueioOleo: 1100,
        autoKm: true,
        autoBloqueioOleo: true
    };
    try {
        const saved = JSON.parse(localStorage.getItem('crm_tracker_config'));
        if (!saved) return def;
        if (!saved.provedor || saved.provedor === 'traccar') {
            saved.provedor = 'xtrack';
            saved.url = 'https://xtrack.com.br/api/v1 (App Xtrack M2M Ativo)';
        }
        return Object.assign({}, def, saved);
    } catch (e) {
        return def;
    }
}

function getMercadoPagoConfig() {
    const def = {
        accessToken: 'APP_USR-6194243169013538-102220-43c64ed326354129ba6d2d512a427b04-213948720',
        chavePix: '85221619091',
        beneficiario: 'HENRIQUE ROCHA CLAVIJO',
        horaNotificacao: '08:00',
        horaBloqueio: '18:00',
        autoNotificar08h: true,
        autoBloquear18h: true,
        autoDesbloquearPix: true
    };
    try {
        const saved = JSON.parse(localStorage.getItem('crm_mercadopago_config'));
        if (!saved) return def;
        // Se houver configuração salva mas o token estiver vazio, preenche com o token oficial de produção
        if (!saved.accessToken || saved.accessToken.trim() === '') {
            saved.accessToken = def.accessToken;
            localStorage.setItem('crm_mercadopago_config', JSON.stringify(saved));
        }
        return Object.assign({}, def, saved);
    } catch (e) {
        return def;
    }
}

function getWhatsAppConfig() {
    const def = {
        provider: 'gateway_rest',
        metaToken: '',
        metaPhoneNumberId: '',
        metaWabaId: '',
        metaTemplateName: 'cobranca_aluguel_moto',
        gatewayUrl: 'https://facilita-whatsapp-bot.onrender.com/send-message',
        gatewayToken: '',
        autoDisparo08h: true,
        autoDisparo18h: true,
        autoDisparoDesbloqueio: true,
        autoDisparoOleo: true
    };
    try {
        const saved = JSON.parse(localStorage.getItem('crm_whatsapp_config'));
        if (!saved) return def;
        // Se a URL do gateway estiver vazia ou com valor antigo, atualiza com o robô em nuvem da Facilita Moto
        if (!saved.gatewayUrl || saved.gatewayUrl.includes('z-api')) {
            saved.gatewayUrl = def.gatewayUrl;
            saved.provider = 'gateway_rest';
            localStorage.setItem('crm_whatsapp_config', JSON.stringify(saved));
        }
        return Object.assign({}, def, saved);
    } catch (e) {
        return def;
    }
}

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// Initial Data Structure
if (!localStorage.getItem('crm_clientes')) saveDb('crm_clientes', []);
if (!localStorage.getItem('crm_motos')) saveDb('crm_motos', []);
if (!localStorage.getItem('crm_contratos')) saveDb('crm_contratos', []);
if (!localStorage.getItem('crm_pagamentos')) saveDb('crm_pagamentos', []);
let currentAdmins = [];
try {
    currentAdmins = JSON.parse(localStorage.getItem('crm_admins'));
} catch (e) {}

if (!currentAdmins || !Array.isArray(currentAdmins)) {
    currentAdmins = [];
}

const temHenrique = currentAdmins.find(a => a.email === 'henrique_rocha@live.com');
if (!temHenrique) {
    currentAdmins.push({ id: generateId(), nome: 'Henrique Rocha', email: 'henrique_rocha@live.com', senha: 'Rike1234', role: 'admin' });
    saveDb('crm_admins', currentAdmins);
}

// ==========================================
// AUTH GUARD
// ==========================================
if (window.location.href.includes('crm.html') || window.location.pathname.endsWith('crm.html')) {
    const sessionUrl = localStorage.getItem('crm_session');
    if (!sessionUrl) {
        window.location.href = 'index.html';
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            const userSpan = document.getElementById('logged-user-name');
            const userAvatar = document.getElementById('logged-user-avatar');
            if (userSpan) {
                const sObj = JSON.parse(sessionUrl);
                userSpan.innerText = sObj.nome;

                if (userAvatar) {
                    userAvatar.src = sObj.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(sObj.nome)}&background=6366f1&color=fff`;
                }

                if (sObj.role === 'funcionario') {
                    const navUsers = document.querySelector('.nav-item[data-target="usuarios"]');
                    if (navUsers) navUsers.style.display = 'none';
                }
            }
        });
    }
}

function fazerLogout() {
    localStorage.removeItem('crm_session');
    window.location.href = 'index.html';
}

// ==========================================
// ROUTING & NAVIGATION
// ==========================================
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('show');
    }
}

function navegarParaView(target) {
    const navItem = document.querySelector(`.nav-item[data-target="${target}"]`);
    if (navItem) {
        navItem.click();
    }
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();

        // Remove active from all
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));

        // Add active to clicked target
        item.classList.add('active');
        const target = item.getAttribute('data-target');
        const viewEl = document.getElementById(`view-${target}`);
        if (viewEl) viewEl.classList.add('active');

        // Update Page Title
        const cleanTitle = item.innerText.replace(/\d+$/, '').trim();
        document.getElementById('page-title').innerText = cleanTitle;

        // Re-render specific view data
        updateViews();

        // Fechar sidebar no mobile automatico
        if (window.innerWidth <= 768) {
            const sidebar = document.querySelector('.sidebar');
            const overlay = document.querySelector('.sidebar-overlay');
            if (sidebar && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                overlay.classList.remove('show');
            }
        }
    });
});

// ==========================================
// MODAL CONTROLS
// ==========================================
function openModal(id) {
    const modalEl = document.getElementById(id);
    if (!modalEl) return;
    modalEl.classList.add('show');

    // Clear form if needed
    if (id === 'modal-cliente') {
        document.getElementById('form-cliente').reset();
        document.getElementById('cli-id').value = '';
        document.getElementById('cli-cnh-base64').value = '';
        document.getElementById('cli-cnh-preview').style.display = 'none';
        document.getElementById('btn-remover-foto-cnh').style.display = 'none';
    }
    if (id === 'modal-usuario') {
        document.getElementById('form-usuario').reset();
        document.getElementById('usr-id').value = '';
        document.getElementById('modal-usuario-title').innerText = 'Novo Usuário Admin';
    }
    if (id === 'modal-moto') {
        document.getElementById('form-moto').reset();
        document.getElementById('modal-moto-title').innerText = 'Nova Moto';
        document.getElementById('moto-id').value = '';
        document.getElementById('moto-foto-base64').value = '';
        document.getElementById('moto-foto-preview').src = '';
        document.getElementById('moto-foto-preview').style.display = 'none';
        document.getElementById('moto-foto-placeholder').style.display = 'flex';
        document.getElementById('btn-remover-foto-moto').style.display = 'none';
        document.getElementById('moto-km-atual').value = '0';
        document.getElementById('moto-km-ultima-troca').value = '0';
        document.getElementById('moto-km-proxima-troca').value = '1000';
        if (document.getElementById('moto-km-bloqueio-oleo')) {
            document.getElementById('moto-km-bloqueio-oleo').value = '1100';
        }
        if (document.getElementById('moto-auto-bloqueio-km')) {
            document.getElementById('moto-auto-bloqueio-km').checked = true;
        }
        popularSelectClienteModalMoto('');
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        if (document.getElementById('moto-vencimento-aluguel')) {
            document.getElementById('moto-vencimento-aluguel').value = nextWeek.toISOString().split('T')[0];
        }
    }
    if (id === 'modal-contrato') {
        document.getElementById('form-contrato').reset();
        document.getElementById('cont-id').value = '';
        document.getElementById('btn-encerrar-contrato').style.display = 'none';
        document.getElementById('cont-status').value = 'ativo';
        document.getElementById('cont-status').disabled = true;
        document.getElementById('cont-cliente').disabled = false;
        document.getElementById('cont-moto').disabled = false;
        const todayStr = new Date().toISOString().split('T')[0];
        document.getElementById('cont-inicio').value = todayStr;
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        document.getElementById('cont-prox-venc').value = nextWeek.toISOString().split('T')[0];
        populateContratoSelects();
        calculateDiariaDisplay();
    }
    if (id === 'modal-config-rastreador-global') {
        const cfg = getTrackerConfig();
        document.getElementById('cfg-gps-provedor').value = cfg.provedor || 'xtrack';
        document.getElementById('cfg-gps-url').value = cfg.url || 'https://xtrack.com.br/api/v1 (App Xtrack M2M Ativo)';
        document.getElementById('cfg-gps-token').value = cfg.token || '';
        if (document.getElementById('cfg-xtrack-email')) document.getElementById('cfg-xtrack-email').value = cfg.xtrackEmail || '';
        if (document.getElementById('cfg-xtrack-senha')) document.getElementById('cfg-xtrack-senha').value = cfg.xtrackSenha || '';
        document.getElementById('cfg-gps-intervalo-oleo').value = cfg.intervaloOleo || 1000;
        document.getElementById('cfg-gps-aviso-antecipado').value = cfg.avisoAntecipado || 150;
        if (document.getElementById('cfg-gps-limite-bloqueio-oleo')) {
            document.getElementById('cfg-gps-limite-bloqueio-oleo').value = cfg.limiteBloqueioOleo || 1100;
        }
        document.getElementById('cfg-gps-auto-km').checked = cfg.autoKm !== false;
        if (document.getElementById('cfg-gps-auto-bloqueio-oleo')) {
            document.getElementById('cfg-gps-auto-bloqueio-oleo').checked = cfg.autoBloqueioOleo !== false;
        }
    }
    if (id === 'modal-config-mercadopago') {
        const cfgMp = getMercadoPagoConfig();
        if (document.getElementById('cfg-mp-access-token')) document.getElementById('cfg-mp-access-token').value = cfgMp.accessToken || '';
        if (document.getElementById('cfg-mp-chave-pix')) document.getElementById('cfg-mp-chave-pix').value = cfgMp.chavePix || '85221619091';
        if (document.getElementById('cfg-mp-beneficiario')) document.getElementById('cfg-mp-beneficiario').value = cfgMp.beneficiario || 'HENRIQUE ROCHA CLAVIJO';
        if (document.getElementById('cfg-mp-hora-notif')) document.getElementById('cfg-mp-hora-notif').value = cfgMp.horaNotificacao || '08:00';
        if (document.getElementById('cfg-mp-hora-bloqueio')) document.getElementById('cfg-mp-hora-bloqueio').value = cfgMp.horaBloqueio || '18:00';
        if (document.getElementById('cfg-mp-auto-notif-08h')) document.getElementById('cfg-mp-auto-notif-08h').checked = cfgMp.autoNotificar08h !== false;
        if (document.getElementById('cfg-mp-auto-bloqueio-18h')) document.getElementById('cfg-mp-auto-bloqueio-18h').checked = cfgMp.autoBloquear18h !== false;
        if (document.getElementById('cfg-mp-auto-desbloqueio-pix')) document.getElementById('cfg-mp-auto-desbloqueio-pix').checked = cfgMp.autoDesbloquearPix !== false;
    }
    if (id === 'modal-config-whatsapp') {
        const cfgWa = getWhatsAppConfig();
        if (document.getElementById('cfg-wa-provider')) document.getElementById('cfg-wa-provider').value = cfgWa.provider || 'meta_cloud';
        if (document.getElementById('cfg-wa-phone-id')) document.getElementById('cfg-wa-phone-id').value = cfgWa.metaPhoneNumberId || '';
        if (document.getElementById('cfg-wa-waba-id')) document.getElementById('cfg-wa-waba-id').value = cfgWa.metaWabaId || '';
        if (document.getElementById('cfg-wa-meta-token')) document.getElementById('cfg-wa-meta-token').value = cfgWa.metaToken || '';
        if (document.getElementById('cfg-wa-gateway-url')) document.getElementById('cfg-wa-gateway-url').value = cfgWa.gatewayUrl || '';
        if (document.getElementById('cfg-wa-gateway-token')) document.getElementById('cfg-wa-gateway-token').value = cfgWa.gatewayToken || '';
        if (document.getElementById('cfg-wa-auto-08h')) document.getElementById('cfg-wa-auto-08h').checked = cfgWa.autoDisparo08h !== false;
        if (document.getElementById('cfg-wa-auto-18h')) document.getElementById('cfg-wa-auto-18h').checked = cfgWa.autoDisparo18h !== false;
        if (document.getElementById('cfg-wa-auto-desbloqueio')) document.getElementById('cfg-wa-auto-desbloqueio').checked = cfgWa.autoDisparoDesbloqueio !== false;
        if (document.getElementById('cfg-wa-auto-oleo')) document.getElementById('cfg-wa-auto-oleo').checked = cfgWa.autoDisparoOleo !== false;
        alternarCamposProviderWhatsApp();
        carregarLogsWhatsAppOficial();
    }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
    if (id === 'modal-rastreador' && window.rastLiveInterval) {
        clearInterval(window.rastLiveInterval);
        window.rastLiveInterval = null;
    }
    if (id === 'modal-cobranca-pix-mp' && window.mpPixModalInterval) {
        clearInterval(window.mpPixModalInterval);
        window.mpPixModalInterval = null;
    }
}

// =========================================================================
// HELPERS: TROCA DE ÓLEO (1.000 KM), HODÔMETRO GPS & BLOQUEIO MOTOR (1.100 KM)
// =========================================================================
function calcularDistanciaGpsHaversineKm(lat1, lon1, lat2, lon2) {
    if ([lat1, lon1, lat2, lon2].some(v => typeof v !== 'number' || isNaN(v))) return 0;
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;
    // Ignora oscilação parado (< 15m) ou salto irreal (> 60 km)
    if (dist < 0.015 || dist > 60) return 0;
    return dist;
}

function getMotoOleoInfo(moto) {
    const cfg = getTrackerConfig();
    const intervalo = parseInt(cfg.intervaloOleo) || 1000;
    const avisoAntecipado = parseInt(cfg.avisoAntecipado) || 150;
    const limiteBloqueio = parseInt(cfg.limiteBloqueioOleo) || 1100;

    const kmAtual = parseInt(moto.kmAtual) || 0;
    let kmUltimaTroca = parseInt(moto.kmUltimaTroca) || 0;

    // Se a moto ainda estava com base 0 (recém cadastrada) e foi informado o KM atual real da moto (ex: 26094 km),
    // usa o KM atual como ponto de partida do ciclo de 1.000 km (Próxima troca = KM atual + 1.000 km)
    const semHistoricoPrevio = !moto.historicoOleo || moto.historicoOleo.length === 0;
    if (kmUltimaTroca === 0 && kmAtual > limiteBloqueio && semHistoricoPrevio) {
        kmUltimaTroca = kmAtual;
    }

    const kmProximaTroca = (parseInt(moto.kmProximaTroca) && parseInt(moto.kmUltimaTroca) > 0)
        ? parseInt(moto.kmProximaTroca)
        : (kmUltimaTroca + intervalo);

    const kmBloqueioMotor = kmUltimaTroca + limiteBloqueio;
    const kmRodadosCiclo = Math.max(0, kmAtual - kmUltimaTroca);
    const kmRestantes = kmProximaTroca - kmAtual;
    const kmRestantesBloqueio = kmBloqueioMotor - kmAtual;
    const percentual = Math.min(100, Math.max(0, Math.round((kmRodadosCiclo / intervalo) * 100)));
    const atingiuBloqueioKm = (kmAtual >= kmBloqueioMotor || kmRodadosCiclo >= limiteBloqueio) && (kmUltimaTroca > 0 || kmAtual >= limiteBloqueio);

    let status = 'ok'; // ok, aviso, vencido, bloqueio_km
    let label = `Em dia (Faltam ${kmRestantes} km)`;
    let cor = 'var(--success)';
    let badgeBg = '#d1fae5';
    let badgeColor = '#065f46';

    if (atingiuBloqueioKm) {
        status = 'vencido';
        const excesso = Math.max(0, kmAtual - kmProximaTroca);
        label = `🛑 BLOQUEIO MOTOR (${kmRodadosCiclo} km rodados • +${excesso} km s/ óleo)`;
        cor = '#991b1b';
        badgeBg = '#7f1d1d';
        badgeColor = '#ffffff';
    } else if (kmAtual >= kmProximaTroca || kmRodadosCiclo >= intervalo) {
        status = 'vencido';
        const excesso = Math.max(0, kmAtual - kmProximaTroca);
        label = excesso > 0 ? `TROCA VENCIDA (+${excesso} km • Bloqueia em ${Math.max(0, kmRestantesBloqueio)} km)` : `TROCA IMEDIATA (1.000 km • Bloqueia em ${Math.max(0, kmRestantesBloqueio)} km)`;
        cor = 'var(--danger)';
        badgeBg = '#fee2e2';
        badgeColor = '#991b1b';
    } else if (kmRestantes <= avisoAntecipado) {
        status = 'aviso';
        label = `Aviso: Faltam ${kmRestantes} km`;
        cor = 'var(--warning)';
        badgeBg = '#fef3c7';
        badgeColor = '#92400e';
    }

    return {
        kmAtual,
        kmUltimaTroca,
        kmProximaTroca,
        kmBloqueioMotor,
        limiteBloqueio,
        kmRodadosCiclo,
        kmRestantes,
        kmRestantesBloqueio,
        atingiuBloqueioKm,
        percentual,
        intervalo,
        status,
        label,
        cor,
        badgeBg,
        badgeColor
    };
}

function verificarEAplicarBloqueioAutomaticoPorKm(moto, salvarNoBanco = true) {
    if (!moto) return false;
    const cfg = getTrackerConfig();
    if (cfg.autoBloqueioOleo === false || moto.autoBloqueioKm === false) return false;

    const oleo = getMotoOleoInfo(moto);
    if (!oleo.atingiuBloqueioKm) return false;

    const jaEstavaBloqueadaPorKm = moto.rastreadorBloqueado === true && moto.bloqueadoPorKmOleo === true;
    moto.rastreadorBloqueado = true;
    moto.bloqueadoPorKmOleo = true;
    moto.motivoBloqueioAutomatico = `PROTEÇÃO DE MOTOR: ${oleo.kmRodadosCiclo} km rodados sem troca de óleo (Limite: ${oleo.limiteBloqueio} km)`;
    moto.rastreadorUltimaSync = new Date().toISOString();

    if (salvarNoBanco) {
        let motos = getDb('crm_motos');
        const idx = motos.findIndex(m => m.id === moto.id);
        if (idx > -1) {
            motos[idx] = moto;
            saveDb('crm_motos', motos);
        }
    }

    // Dispara comando de bloqueio remoto para o rastreador/bloqueador App Xtrack / Chip IoT
    if (!jaEstavaBloqueadaPorKm) {
        fetch('/api/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'command_block',
                id: moto.rastreadorImei || '00018E1B',
                placa: moto.placa,
                bloquear: true,
                motivo: moto.motivoBloqueioAutomatico,
                xtrackEmail: cfg.xtrackEmail || '',
                xtrackSenha: cfg.xtrackSenha || ''
            })
        }).catch(() => {});

        if (typeof mostrarToastNotificacao === 'function') {
            mostrarToastNotificacao({
                titulo: `🛑 BLOQUEIO AUTOMÁTICO DE MOTOR (${moto.placa})`,
                mensagem: `${moto.modelo} atingiu ${oleo.kmRodadosCiclo} km rodados sem troca de óleo (${oleo.kmAtual} km). Comando de bloqueio enviado ao rastreador para evitar fundir o motor!`,
                cor: '#dc2626',
                icone: 'fa-lock'
            });
        }
    }
    return true;
}

function getCondutorContratoAtivo(motoId, contratos, clientes) {
    const cAtivo = contratos.find(c => c.motoId === motoId && c.status === 'ativo');
    if (!cAtivo) return { contrato: null, cliente: null };
    const cli = clientes.find(x => x.id === cAtivo.clienteId) || null;
    return { contrato: cAtivo, cliente: cli };
}

function formatarDataBr(isoDate) {
    if (!isoDate) return '-';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getInfoVencimentoContrato(cont) {
    if (!cont || cont.status !== 'ativo' || !cont.dataProxVenc) {
        return { texto: 'Sem vencimento ativo', htmlBadge: '<span class="badge badge-encerrado">-</span>', diffDays: null };
    }
    const todayDateObj = new Date();
    todayDateObj.setHours(0, 0, 0, 0);
    const vencDateObj = new Date(cont.dataProxVenc + 'T00:00:00');
    const diffTime = vencDateObj.getTime() - todayDateObj.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const dataBr = formatarDataBr(cont.dataProxVenc);

    if (diffDays < 0) {
        return {
            texto: dataBr,
            diffDays,
            htmlBadge: `<span class="badge badge-alugada" style="display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-triangle-exclamation"></i> ${dataBr} (Atrasado ${Math.abs(diffDays)}d)</span>`
        };
    } else if (diffDays === 0) {
        return {
            texto: dataBr,
            diffDays,
            htmlBadge: `<span class="badge badge-manutencao" style="display:inline-flex; align-items:center; gap:4px;"><i class="fa-regular fa-clock"></i> ${dataBr} (Vence Hoje!)</span>`
        };
    } else {
        return {
            texto: dataBr,
            diffDays,
            htmlBadge: `<span class="badge badge-disponivel" style="display:inline-flex; align-items:center; gap:4px;"><i class="fa-regular fa-calendar-check"></i> ${dataBr} (Em ${diffDays}d)</span>`
        };
    }
}

// ==========================================
// MODULE: DASHBOARD
// ==========================================
function sincronizarDadosPadraoRastreadoresFrota() {
    let motos = getDb('crm_motos');
    let mudou = false;
    const jaLimpouOutrasMotos = localStorage.getItem('crm_only_ipu2i57_clean_v1') === 'true';

    motos.forEach(m => {
        const placaLimpa = (m.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

        // Remove qualquer coordenada padrão antiga (Parque Farroupilha / Osvaldo Aranha -30.0346, -51.2177) que tenha ficado salva
        const latNum = parseFloat(m.rastreadorLat);
        const lngNum = parseFloat(m.rastreadorLng);
        if (!isNaN(latNum) && !isNaN(lngNum)) {
            if (Math.abs(latNum - (-30.0346)) < 0.005 && Math.abs(lngNum - (-51.2177)) < 0.005) {
                m.rastreadorLat = '';
                m.rastreadorLng = '';
                m.rastreadorEndereco = '';
                mudou = true;
            }
        }

        // SOMENTE a moto de placa IPU2I57 possui rastreador instalado atualmente
        if (placaLimpa === 'IPU2I57') {
            if (m.rastreadorImei !== '00018E1B') {
                m.rastreadorImei = '00018E1B';
                mudou = true;
            }
            if (m.rastreadorChip !== '89555480000080813880') {
                m.rastreadorChip = '89555480000080813880';
                mudou = true;
            }
            if (!m.rastreadorModelo || m.rastreadorModelo === 'Traccar / GPS' || m.rastreadorModelo === 'Chip IoT M2M Multi-Operadora') {
                m.rastreadorModelo = 'Chip IoT M2M';
                mudou = true;
            }
        } else {
            // As demais motos (ex: IMJ6E36, IOG2G34) ainda NÃO possuem rastreador instalado
            if (!jaLimpouOutrasMotos || m.rastreadorImei === '00018E1B' || m.rastreadorChip === '89555480000080813880' || m.rastreadorChip === 'Traccar / GPS') {
                if (m.rastreadorImei || m.rastreadorChip || m.rastreadorLat || m.rastreadorLng || m.rastreadorEndereco) {
                    m.rastreadorImei = '';
                    m.rastreadorChip = '';
                    m.rastreadorModelo = '';
                    m.rastreadorLat = '';
                    m.rastreadorLng = '';
                    m.rastreadorEndereco = '';
                    m.rastreadorBloqueado = false;
                    mudou = true;
                }
            }
        }
    });

    if (!jaLimpouOutrasMotos) {
        localStorage.setItem('crm_only_ipu2i57_clean_v1', 'true');
    }

    if (mudou) {
        saveDb('crm_motos', motos);
    }
    return motos;
}

function renderDashboard() {
    sincronizarDadosPadraoRastreadoresFrota();
    const clientes = getDb('crm_clientes');
    const motos = getDb('crm_motos');
    const contratos = getDb('crm_contratos');

    // Metrics
    const motosAlugadas = motos.filter(m => m.status === 'alugada').length;
    document.getElementById('dash-motos-alugadas').innerHTML = `${motosAlugadas} <span class="text-sm">/ ${motos.length} Total</span>`;
    document.getElementById('dash-clientes').innerText = clientes.length;

    const leadsNoFunil = clientes.filter(c => c.status !== 'fechado').length;
    document.getElementById('dash-leads').innerText = leadsNoFunil;

    // Calc Faturamento (Contratos ativos)
    let faturamentoMensal = 0;
    contratos.filter(c => c.status === 'ativo').forEach(cont => {
        const moto = motos.find(m => m.id === cont.motoId);
        if (cont.valorSemanal && parseFloat(cont.valorSemanal) > 0) {
            faturamentoMensal += parseFloat(cont.valorSemanal) * 4.2857;
        } else if (moto) {
            faturamentoMensal += parseFloat(moto.valor || 0) * 30;
        }
    });
    document.getElementById('dash-faturamento').innerText = `R$ ${faturamentoMensal.toFixed(2)}`;

    // Contabilizar alertas de troca de óleo (1.000 km)
    let qtdOleoVencido = 0;
    let qtdOleoAviso = 0;
    const ulOleoList = document.getElementById('dash-alertas-oleo-list');
    if (ulOleoList) ulOleoList.innerHTML = '';

    motos.forEach(m => {
        const oleo = getMotoOleoInfo(m);
        const { cliente } = getCondutorContratoAtivo(m.id, contratos, clientes);
        const nomeCondutor = cliente ? cliente.nome : 'No Pátio / Sem condutor';

        if (oleo.status === 'vencido' || oleo.status === 'aviso') {
            if (oleo.status === 'vencido') qtdOleoVencido++;
            if (oleo.status === 'aviso') qtdOleoAviso++;

            if (ulOleoList) {
                let btnWhatsOleo = '';
                if (cliente && cliente.telefone) {
                    const numW = cliente.telefone.replace(/\D/g, '');
                    const msgOleo = `Olá, ${cliente.nome}! Tudo bem? O sistema da FACILITA MOTO identificou que a moto ${m.modelo} (${m.placa}) está com ${oleo.kmAtual} km (revisão programada de 1.000 em 1.000 km aos ${oleo.kmProximaTroca} km). Precisamos agendar a troca de óleo!`;
                    btnWhatsOleo = `<a href="https://wa.me/55${numW}?text=${encodeURIComponent(msgOleo)}" target="_blank" class="btn btn-secondary btn-sm" style="padding:4px 8px;" title="Avisar Condutor no WhatsApp"><i class="fa-brands fa-whatsapp" style="color:#25d366;"></i></a>`;
                }
                ulOleoList.innerHTML += `
                    <li style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <div>
                            <strong style="color:${oleo.cor};">${m.modelo} (${m.placa})</strong> — ${oleo.kmAtual} km / ${oleo.kmProximaTroca} km<br>
                            <small style="color:var(--text-muted);">Com: ${nomeCondutor} • ${oleo.label}</small>
                        </div>
                        <div style="display:flex; gap:5px; align-items:center;">
                            ${btnWhatsOleo}
                            <button class="btn btn-primary btn-sm" style="padding:4px 8px;" onclick="abrirModalTrocaOleo('${m.id}')" title="Registrar Troca de Óleo"><i class="fa-solid fa-oil-can"></i> Trocar</button>
                        </div>
                    </li>
                `;
            }
        }
    });

    const totalAlertasOleo = qtdOleoVencido + qtdOleoAviso;
    const dashOleoResumo = document.getElementById('dash-oleo-resumo');
    if (dashOleoResumo) {
        dashOleoResumo.innerHTML = `${totalAlertasOleo} <span class="text-sm">${qtdOleoVencido > 0 ? `(${qtdOleoVencido} venc.)` : 'Alertas'}</span>`;
    }
    const navBadgeOleo = document.getElementById('nav-badge-oleo');
    if (navBadgeOleo) {
        if (totalAlertasOleo > 0) {
            navBadgeOleo.style.display = 'inline-block';
            navBadgeOleo.innerText = totalAlertasOleo;
        } else {
            navBadgeOleo.style.display = 'none';
        }
    }
    if (totalAlertasOleo === 0 && ulOleoList) {
        ulOleoList.innerHTML = `<li class="empty-state">Todas as motos estão com óleo em dia (ciclo de 1.000 km).</li>`;
    }

    // Banner de Alerta Crítico no Topo do Dashboard caso o Cabo da Bateria seja removido
    const bateriaBannerContainer = document.getElementById('dash-bateria-banner-container');
    if (bateriaBannerContainer) {
        const motosVioladas = motos.filter(m => m.rastreadorImei && m.rastreadorBateriaRemovida === true);
        if (motosVioladas.length > 0) {
            const mV = motosVioladas[0];
            bateriaBannerContainer.innerHTML = `
                <div class="alert-banner-oleo" style="background:#fef2f2; border:2px solid #dc2626; margin-bottom:16px;">
                    <div style="display:flex; align-items:center; gap:14px;">
                        <div style="font-size:1.9rem; color:#dc2626;">
                            <i class="fa-solid fa-car-battery"></i>
                        </div>
                        <div>
                            <strong style="font-size:0.98rem; color:#7f1d1d; display:block;">
                                🚨 ALERTA DE VIOLAÇÃO: CABO DA BATERIA REMOVIDO NA MOTO ${mV.modelo} (PLACA: ${mV.placa})!
                            </strong>
                            <span style="font-size:0.84rem; color:#991b1b;">
                                O rastreador (ID: <strong>${mV.rastreadorImei}</strong> • ICCID: <strong>${mV.rastreadorChip || '-'}</strong>) detectou corte de energia 12V e ativou a bateria interna de backup (3.7V).
                            </span>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button class="btn btn-danger btn-sm" onclick="abrirPainelRastreadorMoto('${mV.id}')">
                            <i class="fa-solid fa-location-crosshairs"></i> Abrir Rastreador Agora
                        </button>
                    </div>
                </div>
            `;
        } else {
            bateriaBannerContainer.innerHTML = '';
        }
    }

    // Banner de Alerta no Topo do Dashboard
    const bannerContainer = document.getElementById('dash-oleo-banner-container');
    if (bannerContainer) {
        if (qtdOleoVencido > 0 || qtdOleoAviso > 0) {
            const isCritico = qtdOleoVencido > 0;
            bannerContainer.innerHTML = `
                <div class="alert-banner-oleo ${isCritico ? '' : 'warning-only'}">
                    <div style="display:flex; align-items:center; gap:14px;">
                        <div style="font-size:1.8rem; color:${isCritico ? 'var(--danger)' : 'var(--warning)'};">
                            <i class="fa-solid fa-oil-can"></i>
                        </div>
                        <div>
                            <strong style="font-size:0.98rem; color:#111827; display:block;">
                                ${isCritico
                                    ? `🚨 ATENÇÃO: ${qtdOleoVencido} moto(s) atingiram o limite de 1.000 km para Troca de Óleo!`
                                    : `⚠️ AVISO PREVENTIVO: ${qtdOleoAviso} moto(s) estão próximas da revisão de 1.000 km (Troca de Óleo).`}
                            </strong>
                            <span style="font-size:0.84rem; color:#4b5563;">
                                O controle de manutenção é feito de 1.000 em 1.000 km. Verifique o KM atualizado pelo rastreador ou registre a troca realizada.
                            </span>
                        </div>
                    </div>
                    <button class="btn ${isCritico ? 'btn-danger' : 'btn-primary'} btn-sm" onclick="navegarParaView('oleo')">
                        <i class="fa-solid fa-wrench"></i> Abrir Área de Troca de Óleo
                    </button>
                </div>
            `;
        } else {
            bannerContainer.innerHTML = '';
        }
    }

    // =========================================================================
    // TABELA CENTRAL DO DASHBOARD: COM QUEM ESTÁ CADA MOTO, VENCIMENTO, ÓLEO & GPS
    // =========================================================================
    const tbodyFrotaDash = document.getElementById('dash-table-frota-controle');
    if (tbodyFrotaDash) {
        tbodyFrotaDash.innerHTML = '';
        if (motos.length === 0) {
            tbodyFrotaDash.innerHTML = `<tr><td colspan="6" class="empty-state" style="padding:25px;">Nenhuma motocicleta cadastrada na frota. Clique em "Frota & Rastreador" para cadastrar.</td></tr>`;
        } else {
            motos.forEach(m => {
                const { contrato, cliente } = getCondutorContratoAtivo(m.id, contratos, clientes);
                const oleo = getMotoOleoInfo(m);

                // Foto miniatura
                let photoHtml = `<div style="width:42px; height:36px; border-radius:6px; border:1px solid var(--border); display:flex; align-items:center; justify-content:center; color:var(--text-muted); background:#f1f5f9;"><i class="fa-solid fa-motorcycle"></i></div>`;
                if (m.foto) {
                    photoHtml = `<img src="${m.foto}" onclick="verFotoMotoCrm('${m.id}')" title="Ampliar foto" style="width:44px; height:36px; object-fit:cover; border-radius:6px; border:1px solid var(--border); cursor:pointer;">`;
                }

                // Com quem está
                let locatarioHtml = '';
                if (m.status === 'alugada' && cliente) {
                    const numW = cliente.telefone ? cliente.telefone.replace(/\D/g, '') : '';
                    const linkW = numW ? `<a href="https://wa.me/55${numW}" target="_blank" title="Falar no WhatsApp" style="color:#25d366; margin-left:6px; font-size:1rem;"><i class="fa-brands fa-whatsapp"></i></a>` : '';
                    locatarioHtml = `
                        <div>
                            <strong style="color:var(--text-main); font-size:0.92rem;"><i class="fa-solid fa-user-check" style="color:var(--primary);"></i> ${cliente.nome}</strong> ${linkW}
                            <button class="btn btn-secondary btn-sm" style="padding:2px 7px; font-size:0.7rem; margin-left:6px;" onclick="abrirVinculoClienteMoto('${m.id}')" title="Trocar cliente ou devolver moto">
                                <i class="fa-solid fa-user-pen"></i> Alterar
                            </button><br>
                            <span style="font-size:0.78rem; color:var(--text-muted);">Tel: ${cliente.telefone || 'S/N'} • <a href="#" onclick="abrirContratoNoEditorGov('${contrato.id}'); return false;" style="color:var(--primary); font-weight:600;">Ver Contrato Gov.br</a></span>
                        </div>
                    `;
                } else if (m.status === 'manutencao') {
                    locatarioHtml = `
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span class="badge badge-manutencao"><i class="fa-solid fa-screwdriver-wrench"></i> Em Manutenção</span>
                            <button class="btn btn-primary btn-sm" style="padding:3px 8px; font-size:0.72rem;" onclick="abrirVinculoClienteMoto('${m.id}')">
                                <i class="fa-solid fa-user-plus"></i> Apontar Cliente
                            </button>
                        </div>
                    `;
                } else {
                    locatarioHtml = `
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span class="badge badge-disponivel"><i class="fa-solid fa-circle-check"></i> Disponível</span>
                            <button class="btn btn-primary btn-sm" style="padding:4px 10px; font-size:0.75rem;" onclick="abrirVinculoClienteMoto('${m.id}')">
                                <i class="fa-solid fa-user-plus"></i> Apontar Cliente
                            </button>
                        </div>
                    `;
                }

                // Vencimento do Aluguel
                let vencimentoHtml = '<span style="color:var(--text-muted); font-size:0.82rem;">Moto sem contrato ativo</span>';
                if (contrato && contrato.status === 'ativo') {
                    const vInfo = getInfoVencimentoContrato(contrato);
                    vencimentoHtml = `
                        <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
                            ${vInfo.htmlBadge}
                            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                                <button class="btn btn-primary btn-sm" style="padding:2px 8px; font-size:0.72rem; background:#009ee3; color:#fff; border:none;" onclick="abrirModalPixMercadoPago('${contrato.id}')" title="Abrir PIX Mercado Pago, Enviar Aviso 08:00h e Desbloquear Automaticamente">
                                    <i class="fa-solid fa-qrcode"></i> PIX MP
                                </button>
                                <button class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:0.72rem; background:#10b981; color:#fff;" onclick="registrarPagamento('${contrato.id}')" title="Confirmar pagamento semanal (+7 dias)">
                                    <i class="fa-solid fa-sack-dollar"></i> +7 Dias
                                </button>
                                <span style="font-size:0.75rem; color:var(--text-muted);">R$ ${parseFloat(contrato.valorSemanal || (m.valor * 7) || 0).toFixed(2)}</span>
                            </div>
                        </div>
                    `;
                }

                // Troca de Óleo (1.000 em 1.000 km)
                const oleoHtml = `
                    <div class="km-progress-wrap">
                        <div style="display:flex; justify-content:space-between; font-size:0.78rem; font-weight:600;">
                            <span>Atual: <strong>${oleo.kmAtual} km</strong></span>
                            <span style="color:var(--text-muted);">Próx: ${oleo.kmProximaTroca} km</span>
                        </div>
                        <div class="km-progress-bar">
                            <div class="km-progress-fill" style="width:${oleo.percentual}%; background:${oleo.cor};"></div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:4px;">
                            <span style="font-size:0.72rem; padding:1px 6px; border-radius:4px; background:${oleo.badgeBg}; color:${oleo.badgeColor}; font-weight:700;">
                                ${oleo.label}
                            </span>
                            <button class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:0.7rem;" onclick="abrirModalTrocaOleo('${m.id}')" title="Atualizar KM ou Registrar Troca de Óleo">
                                <i class="fa-solid fa-oil-can"></i> Óleo
                            </button>
                        </div>
                    </div>
                `;

                // Rastreador Chip IoT (M2M) — Somente motos com rastreador instalado (ex: IPU2I57)
                const temRastreador = !!(m.rastreadorImei && m.rastreadorImei.trim() !== '');
                const isBloqueada = (temRastreador && m.rastreadorBloqueado === true) || m.bloqueadoPorInadimplencia === true;

                let rastreadorHtml = '';
                let btnRastrearHtml = '';

                if (temRastreador) {
                    const batRemovida = m.rastreadorBateriaRemovida === true;
                    const ignicaoLigada = m.rastreadorIgnicao === true;
                    const tensao = batRemovida ? '0.0V (Backup 3.7V)' : (ignicaoLigada ? '13.8V' : '12.6V');

                    const gpsPillClass = (isBloqueada || batRemovida) ? 'gps-blocked' : 'gps-online';
                    const gpsText = batRemovida
                        ? '🚨 Bateria Removida!'
                        : (isBloqueada
                            ? (m.bloqueadoPorInadimplencia ? '🛑 Bloqueada (Falta PIX 18h)' : (m.bloqueadoPorKmOleo ? '🛑 Bloqueada (1.100km Óleo)' : '🔒 Bloqueada (Xtrack)'))
                            : 'Chip IoT Online');
                    const imeiInfo = `ID: <strong>${m.rastreadorImei}</strong>`;
                    const iccidInfo = m.rastreadorChip ? `<br>ICCID (Linha): <strong>${m.rastreadorChip}</strong>` : '';
                    const ignicaoHtml = ignicaoLigada
                        ? `<br><span style="color:#059669; font-weight:700;"><i class="fa-solid fa-key"></i> Moto Ligada (ACC ON)</span>`
                        : `<br><span style="color:#475569; font-weight:600;"><i class="fa-solid fa-power-off"></i> Moto Desligada (ACC OFF)</span>`;
                    const bateriaHtml = batRemovida
                        ? `<br><span style="color:#dc2626; font-weight:800;"><i class="fa-solid fa-triangle-exclamation"></i> CABO BATERIA REMOVIDO (${tensao})</span>`
                        : `<br><span style="color:#059669; font-weight:600;"><i class="fa-solid fa-car-battery"></i> Bateria Conectada (${tensao})</span>`;
                    const endCurto = m.rastreadorEndereco ? `<br><span style="color:#0284c7; font-weight:600;"><i class="fa-solid fa-location-dot"></i> ${m.rastreadorEndereco.split(',').slice(0, 2).join(',')}</span>` : '';

                    rastreadorHtml = `
                        <div>
                            <span class="gps-pill ${gpsPillClass}">
                                <span class="gps-dot"></span> ${gpsText}
                            </span>
                            <div style="font-size:0.73rem; color:var(--text-muted); margin-top:4px; line-height:1.4;">
                                ${imeiInfo}${iccidInfo}${ignicaoHtml}${bateriaHtml}${endCurto}
                            </div>
                        </div>
                    `;
                    btnRastrearHtml = `
                        <button class="btn btn-primary btn-sm" onclick="abrirPainelRastreadorMoto('${m.id}')" title="Abrir Mapa, Telemetria e Bloqueio do Rastreador (${m.placa})" style="background:#0284c7;">
                            <i class="fa-solid fa-location-crosshairs"></i> Rastrear
                        </button>
                    `;
                } else {
                    rastreadorHtml = `
                        <div>
                            <span class="gps-pill" style="background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1;">
                                <i class="fa-solid fa-ban" style="font-size:0.68rem;"></i> Sem Rastreador
                            </span>
                            <div style="font-size:0.72rem; color:#94a3b8; margin-top:4px; line-height:1.3;">
                                Não instalado nesta moto
                            </div>
                        </div>
                    `;
                    btnRastrearHtml = '';
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                            ${photoHtml}
                            <div>
                                <strong style="color:var(--text-main);">${m.modelo}</strong><br>
                                <span style="font-size:0.78rem; color:var(--text-muted);">Placa: <strong>${m.placa}</strong> • ${m.cor || ''}</span>
                            </div>
                        </div>
                    </td>
                    <td>${locatarioHtml}</td>
                    <td>${vencimentoHtml}</td>
                    <td>${oleoHtml}</td>
                    <td>${rastreadorHtml}</td>
                    <td>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            ${btnRastrearHtml}
                            <button class="btn btn-secondary btn-sm" onclick="abrirModalTrocaOleo('${m.id}')" title="Registrar Troca de Óleo / Atualizar KM">
                                <i class="fa-solid fa-gauge-high"></i> KM
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="abrirEdicaoMoto('${m.id}')" title="Editar Moto / Instalar Rastreador">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbodyFrotaDash.appendChild(tr);
            });
        }
    }

    // ==================
    // CICLO DE COBRANÇAS
    // ==================
    const ulAtrasados = document.getElementById('dash-atrasados');
    const ulVenceHoje = document.getElementById('dash-vence-hoje');
    if (ulAtrasados) ulAtrasados.innerHTML = '';
    if (ulVenceHoje) ulVenceHoje.innerHTML = '';

    let temAtrasado = false;
    let temHoje = false;

    const todayDateObj = new Date();
    todayDateObj.setHours(0, 0, 0, 0);

    contratos.filter(c => c.status === 'ativo').forEach(cont => {
        if (cont.dataProxVenc) {
            const vencDateObj = new Date(cont.dataProxVenc + 'T00:00:00');
            const cli = clientes.find(x => x.id === cont.clienteId);
            const nomeCli = cli ? cli.nome : 'Desconhecido';
            const mInfo = motos.find(m => m.id === cont.motoId);
            const strMoto = mInfo ? `${mInfo.modelo} (${mInfo.placa})` : `moto`;

            const splitD = cont.dataProxVenc.split('-');
            const dataStr = `${splitD[2]}/${splitD[1]}`;

            const diffTime = vencDateObj.getTime() - todayDateObj.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                temAtrasado = true;
                if (ulAtrasados) {
                    let btnWhats = '';
                    if (cli && cli.telefone) {
                        const numWhats = cli.telefone.replace(/\D/g, '');
                        let msgAtraso = `Olá, ${cli.nome}! Como você está? Passando por aqui pois identificamos que o pagamento semanal da sua locação (${strMoto}) consta em aberto desde ${dataStr} no nosso sistema. Conseguimos verificar isso hoje?`;
                        let linkWhats = `https://wa.me/55${numWhats}?text=${encodeURIComponent(msgAtraso)}`;
                        btnWhats = `<a href="${linkWhats}" target="_blank" title="Cobrar no WhatsApp" style="float:right;"><i class="fa-brands fa-whatsapp" style="color:#25d366; font-size:1.2rem;"></i></a>`;
                    }
                    ulAtrasados.innerHTML += `<li style="display:flex; justify-content:space-between; align-items:center;"><span><strong>${nomeCli} (${strMoto}):</strong> Atrasado desde ${dataStr} (${Math.abs(diffDays)} dias)</span> ${btnWhats}</li>`;
                }
            } else if (diffDays >= 0 && diffDays <= 7) {
                temHoje = true;
                if (ulVenceHoje) {
                    let btnWhats = '';
                    if (cli && cli.telefone) {
                        const numWhats = cli.telefone.replace(/\D/g, '');
                        let msgHoje = diffDays === 0
                            ? `Olá, ${cli.nome}! Passando para lembrar que o pagamento semanal da sua locação (${strMoto}) vence hoje (${dataStr}). Aguardo o envio do comprovante!`
                            : `Olá, ${cli.nome}! Tudo bem? Lembrando que o próximo vencimento semanal da sua moto (${strMoto}) será no dia ${dataStr}.`;
                        let linkWhatsHoje = `https://wa.me/55${numWhats}?text=${encodeURIComponent(msgHoje)}`;
                        btnWhats = `<a href="${linkWhatsHoje}" target="_blank" title="Lembrar no WhatsApp" style="float:right;"><i class="fa-brands fa-whatsapp" style="color:#25d366; font-size:1.2rem;"></i></a>`;
                    }
                    const labelDia = diffDays === 0 ? `<strong style="color:var(--warning);">Vence HOJE (${dataStr})</strong>` : `Vence em ${diffDays}d (${dataStr})`;
                    ulVenceHoje.innerHTML += `<li style="display:flex; justify-content:space-between; align-items:center;"><span><strong>${nomeCli} (${strMoto}):</strong> ${labelDia}</span> ${btnWhats}</li>`;
                }
            }
        }
    });

    if (!temAtrasado && ulAtrasados) ulAtrasados.innerHTML = `<li class="empty-state">Nenhum cliente em atraso.</li>`;
    if (!temHoje && ulVenceHoje) ulVenceHoje.innerHTML = `<li class="empty-state">Nenhum vencimento para hoje ou próximos 7 dias.</li>`;

    // Follow ups
    const today = new Date().toISOString().split('T')[0];
    const ulReminders = document.getElementById('today-reminders');
    if (ulReminders) {
        ulReminders.innerHTML = '';
        let hasReminder = false;

        clientes.forEach(c => {
            if (c.notas) {
                c.notas.forEach(n => {
                    if (n.date === today && n.date !== "") {
                        hasReminder = true;
                        ulReminders.innerHTML += `<li><strong>${c.nome}:</strong> ${n.text}</li>`;
                    }
                });
            }
        });

        if (!hasReminder) {
            ulReminders.innerHTML = `<li class="empty-state">Nenhum lembrete para hoje.</li>`;
        }
    }
}

// ==========================================
// MODULE: CLIENTES
// ==========================================
document.getElementById('form-cliente')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const idObj = document.getElementById('cli-id').value;
    const cliente = {
        id: idObj || generateId(),
        nome: document.getElementById('cli-nome').value,
        telefone: document.getElementById('cli-telefone').value,
        email: document.getElementById('cli-email').value,
        cpf: document.getElementById('cli-cpf').value,
        rg: document.getElementById('cli-rg') ? document.getElementById('cli-rg').value : '',
        cnh: document.getElementById('cli-cnh').value,
        cnhCat: document.getElementById('cli-cnh-cat') ? document.getElementById('cli-cnh-cat').value : 'A',
        cnhValidade: document.getElementById('cli-cnh-val') ? document.getElementById('cli-cnh-val').value : '',
        endereco: document.getElementById('cli-endereco').value,
        fotoCnh: document.getElementById('cli-cnh-base64').value,
        status: document.getElementById('cli-status').value,
        notas: []
    };

    let clientes = getDb('crm_clientes');

    if (idObj) {
        const oldC = clientes.find(c => c.id === idObj);
        cliente.notas = oldC ? oldC.notas : [];
        clientes = clientes.map(c => c.id === idObj ? cliente : c);
    } else {
        clientes.push(cliente);
    }

    saveDb('crm_clientes', clientes);
    closeModal('modal-cliente');
    updateViews();
});

function renderClientes() {
    const clientes = getDb('crm_clientes');
    const query = document.getElementById('search-cliente') ? document.getElementById('search-cliente').value.toLowerCase() : '';
    const filtered = clientes.filter(c => (c.nome || '').toLowerCase().includes(query) || (c.telefone || '').includes(query) || (c.cpf || '').includes(query));

    const tbody = document.getElementById('table-clientes');
    if (!tbody) return;
    tbody.innerHTML = '';

    const labelStatusMap = {
        'novo': 'Novo Lead',
        'contato': 'Contato Feito',
        'proposta': 'Proposta Enviada',
        'fechado': 'Fechado'
    };

    filtered.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${c.nome}</strong><br><small style="color:var(--text-muted);">${c.email || ''}</small></td>
            <td>${c.telefone}</td>
            <td>CPF: ${c.cpf || '-'}<br><small style="color:var(--text-muted);">CNH: ${c.cnh || '-'} (${c.cnhCat || 'A'})</small></td>
            <td><span class="badge badge-primary" style="background:#e0e7ff; color:#4f46e5">${labelStatusMap[c.status] || c.status}</span></td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="abrirPerfilCliente('${c.id}')" title="Ver Perfil"><i class="fa-solid fa-eye"></i></button>
                <button class="btn btn-primary btn-sm" onclick="abrirEdicaoCliente('${c.id}')" title="Editar Cliente"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger btn-sm" onclick="deletarCliente('${c.id}')" title="Deletar"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deletarCliente(id) {
    if (!confirm("Tem certeza que deseja excluir o cliente? (Contratos associados devem ser apagados manualmente)")) return;
    let clientes = getDb('crm_clientes');
    clientes = clientes.filter(c => c.id !== id);
    localStorage.setItem('crm_clientes', JSON.stringify(clientes));
    if (!window.isFirebaseSyncing && window.db) { window.db.collection('crm_clientes').doc(id).delete(); }
    updateViews();
}

function abrirEdicaoCliente(id) {
    openModal('modal-cliente');

    const c = getDb('crm_clientes').find(x => x.id === id);
    if (!c) return;

    document.getElementById('cli-id').value = c.id;
    document.getElementById('cli-nome').value = c.nome || '';
    document.getElementById('cli-telefone').value = c.telefone || '';
    document.getElementById('cli-email').value = c.email || '';
    document.getElementById('cli-cpf').value = c.cpf || '';
    if (document.getElementById('cli-rg')) document.getElementById('cli-rg').value = c.rg || '';
    document.getElementById('cli-cnh').value = c.cnh || '';
    if (document.getElementById('cli-cnh-cat')) document.getElementById('cli-cnh-cat').value = c.cnhCat || 'A';
    if (document.getElementById('cli-cnh-val')) document.getElementById('cli-cnh-val').value = c.cnhValidade || '';
    document.getElementById('cli-endereco').value = c.endereco || '';
    document.getElementById('cli-status').value = c.status || 'novo';

    if (c.fotoCnh) {
        document.getElementById('cli-cnh-base64').value = c.fotoCnh;
        document.getElementById('cli-cnh-preview').src = c.fotoCnh;
        document.getElementById('cli-cnh-preview').style.display = 'block';
        document.getElementById('btn-remover-foto-cnh').style.display = 'inline-block';
    }
}

let currentClienteId = null;

function abrirPerfilCliente(id) {
    const c = getDb('crm_clientes').find(x => x.id === id);
    if (!c) return;
    currentClienteId = c.id;

    document.getElementById('perf-nome').innerText = c.nome;
    document.getElementById('perf-telefone').innerText = c.telefone;
    document.getElementById('perf-email').innerText = c.email || 'Nenhum email';
    document.getElementById('perf-cpf').innerText = c.cpf || 'Não informado';
    if (document.getElementById('perf-rg')) document.getElementById('perf-rg').innerText = c.rg || 'Não informado';
    document.getElementById('perf-cnh').innerText = `${c.cnh || 'Não informado'} (Cat: ${c.cnhCat || 'A'})`;
    document.getElementById('perf-endereco').innerText = c.endereco || 'Não informado';

    const cnhDiv = document.getElementById('perf-cnh-anexo');
    const cnhImg = document.getElementById('perf-foto-cnh');
    if (c.fotoCnh) {
        cnhDiv.style.display = 'block';
        cnhImg.src = c.fotoCnh;
    } else {
        cnhDiv.style.display = 'none';
        cnhImg.src = '';
    }

    const labelStatusMap = { 'novo': 'Novo Lead', 'contato': 'Contato Feito', 'proposta': 'Proposta Enviada', 'fechado': 'Fechado' };
    document.getElementById('perf-status').innerText = labelStatusMap[c.status] || c.status;

    renderNotas(c);
    openModal('modal-perfil-cliente');
}

function renderNotas(cliente) {
    const box = document.getElementById('perf-notas');
    box.innerHTML = '';
    if (!cliente.notas || cliente.notas.length === 0) {
        box.innerHTML = '<span class="empty-state">Nenhuma anotação.</span>';
        return;
    }

    cliente.notas.forEach(n => {
        let dateHtml = n.date ? `<span class="date"><i class="fa-regular fa-calendar"></i> Follow-up: ${n.date.split('-').reverse().join('/')}</span>` : '';
        box.innerHTML += `
            <div class="note-item">
                ${dateHtml}
                ${n.text}
            </div>
        `;
    });
}

function addNote() {
    const textObj = document.getElementById('new-note-text');
    const dateObj = document.getElementById('new-note-date');

    if (!textObj.value.trim()) return;

    let clientes = getDb('crm_clientes');
    let idx = clientes.findIndex(c => c.id === currentClienteId);

    if (idx > -1) {
        if (!clientes[idx].notas) clientes[idx].notas = [];
        clientes[idx].notas.push({
            text: textObj.value,
            date: dateObj.value
        });
        saveDb('crm_clientes', clientes);
        renderNotas(clientes[idx]);
        textObj.value = '';
        dateObj.value = '';
        updateViews();
    }
}

// ==========================================
// MODULE: PIPELINE (KANBAN)
// ==========================================
function renderPipeline() {
    const clientes = getDb('crm_clientes');
    const kNovo = document.getElementById('k-novo-lead');
    if (!kNovo) return;

    const columns = {
        'novo': document.getElementById('k-novo-lead').querySelector('.kanban-cards'),
        'contato': document.getElementById('k-contato').querySelector('.kanban-cards'),
        'proposta': document.getElementById('k-proposta').querySelector('.kanban-cards'),
        'fechado': document.getElementById('k-fechado').querySelector('.kanban-cards')
    };

    Object.keys(columns).forEach(k => columns[k].innerHTML = '');
    const counts = { 'novo': 0, 'contato': 0, 'proposta': 0, 'fechado': 0 };

    clientes.forEach(c => {
        const col = columns[c.status];
        if (counts[c.status] !== undefined) counts[c.status]++;
        if (col) {
            col.innerHTML += `
                <div class="k-card" draggable="true" ondragstart="drag(event)" id="card-${c.id}" data-id="${c.id}">
                    <h4>${c.nome}</h4>
                    <p><i class="fa-solid fa-phone"></i> ${c.telefone}</p>
                    <div class="meta">
                        <span>#${c.id.substring(0, 4).toUpperCase()}</span>
                    </div>
                </div>
            `;
        }
    });

    Object.keys(counts).forEach(k => {
        const el = document.getElementById(`count-${k}`);
        if (el) el.innerText = counts[k];
    });
}

function allowDrop(ev) { ev.preventDefault(); }
function drag(ev) { ev.dataTransfer.setData("text", ev.currentTarget.dataset.id); }
function drop(ev) {
    ev.preventDefault();
    const id = ev.dataTransfer.getData("text");
    let targetZone = ev.target;
    while (targetZone && !targetZone.classList.contains('kanban-cards')) {
        targetZone = targetZone.parentNode;
        if (!targetZone || targetZone.tagName === 'BODY') return;
    }
    const newStatus = targetZone.parentNode.getAttribute('data-stage');
    let clientes = getDb('crm_clientes');
    const idx = clientes.findIndex(c => c.id === id);
    if (idx > -1) {
        clientes[idx].status = newStatus;
        saveDb('crm_clientes', clientes);
        updateViews();
    }
}

// ==========================================
// MODULE: FROTA, RASTREADOR & TROCA DE ÓLEO
// ==========================================
function previewMotoPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('moto-foto-preview').src = e.target.result;
        document.getElementById('moto-foto-preview').style.display = 'inline-block';
        document.getElementById('moto-foto-base64').value = e.target.result;
        document.getElementById('moto-foto-placeholder').style.display = 'none';
        document.getElementById('btn-remover-foto-moto').style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
}

function removerFotoMoto() {
    document.getElementById('moto-foto-base64').value = '';
    document.getElementById('moto-foto-preview').src = '';
    document.getElementById('moto-foto-preview').style.display = 'none';
    document.getElementById('moto-foto-placeholder').style.display = 'flex';
    document.getElementById('btn-remover-foto-moto').style.display = 'none';
    document.getElementById('moto-foto').value = '';
}

function calcularProxTrocaModalMoto() {
    const cfg = getTrackerConfig();
    const intervalo = parseInt(cfg.intervaloOleo) || 1000;
    const limiteBloqueio = parseInt(cfg.limiteBloqueioOleo) || 1100;
    const kmUltima = parseInt(document.getElementById('moto-km-ultima-troca')?.value) || 0;
    const proxInput = document.getElementById('moto-km-proxima-troca');
    if (proxInput) {
        proxInput.value = kmUltima + intervalo;
    }
    const bloqInput = document.getElementById('moto-km-bloqueio-oleo');
    if (bloqInput) {
        bloqInput.value = kmUltima + limiteBloqueio;
    }
}

function popularSelectClienteModalMoto(selectedClienteId = '') {
    const sel = document.getElementById('moto-cliente-vinculado');
    if (!sel) return;
    const clientes = getDb('crm_clientes');
    sel.innerHTML = '<option value="">-- Nenhum (Disponível no Pátio) --</option>';
    clientes.forEach(c => {
        sel.innerHTML += `<option value="${c.id}" ${c.id === selectedClienteId ? 'selected' : ''}>${c.nome} (${c.telefone || 'S/N'})</option>`;
    });
}

function onSelectClienteModalMoto() {
    const selCli = document.getElementById('moto-cliente-vinculado');
    const selStatus = document.getElementById('moto-status');
    const inputSemanal = document.getElementById('moto-valor-semanal');
    const inputDiaria = document.getElementById('moto-valor');
    if (!selCli || !selStatus) return;

    if (selCli.value) {
        selStatus.value = 'alugada';
        if (inputSemanal && !inputSemanal.value && inputDiaria && inputDiaria.value) {
            inputSemanal.value = (parseFloat(inputDiaria.value) * 7).toFixed(2);
        }
    } else if (selStatus.value === 'alugada') {
        selStatus.value = 'disponivel';
    }
}

function onChangeStatusModalMoto() {
    const selStatus = document.getElementById('moto-status');
    const selCli = document.getElementById('moto-cliente-vinculado');
    if (selStatus && selCli && selStatus.value !== 'alugada') {
        selCli.value = '';
    }
}

function sincronizarContratoVinculoMoto(motoId, clienteId, dataInicio, dataProxVenc, valorSemanal, valorCaucao, diariaVal) {
    let contratos = getDb('crm_contratos');
    const cAtivoIdx = contratos.findIndex(c => c.motoId === motoId && c.status === 'ativo');

    if (!clienteId) {
        if (cAtivoIdx > -1) {
            contratos[cAtivoIdx].status = 'encerrado';
            contratos[cAtivoIdx].fim = new Date().toISOString().split('T')[0];
            saveDb('crm_contratos', contratos);
        }
        return null;
    }

    const hoje = new Date().toISOString().split('T')[0];
    const dProx = dataProxVenc || (() => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d.toISOString().split('T')[0];
    })();

    let contratoSalvo = null;
    if (cAtivoIdx > -1) {
        contratos[cAtivoIdx].clienteId = clienteId;
        contratos[cAtivoIdx].dataProxVenc = dProx;
        if (valorSemanal) contratos[cAtivoIdx].valorSemanal = valorSemanal;
        if (valorCaucao !== undefined && valorCaucao !== '') contratos[cAtivoIdx].caucao = valorCaucao;
        contratoSalvo = contratos[cAtivoIdx];
    } else {
        contratoSalvo = {
            id: generateId(),
            clienteId: clienteId,
            motoId: motoId,
            inicio: dataInicio || hoje,
            fim: '',
            dataProxVenc: dProx,
            caucao: valorCaucao || '500.00',
            valorSemanal: valorSemanal || ((parseFloat(diariaVal) || 0) * 7).toFixed(2),
            diariaFechada: parseFloat(diariaVal) || 0,
            formaPagamento: 'PIX',
            status: 'ativo',
            dadosContratoGov: null
        };
        contratos.push(contratoSalvo);
    }

    saveDb('crm_contratos', contratos);

    // Garantir que o status do cliente passe para fechado
    let clientes = getDb('crm_clientes');
    const cliIdx = clientes.findIndex(c => c.id === clienteId);
    if (cliIdx > -1 && clientes[cliIdx].status !== 'fechado') {
        clientes[cliIdx].status = 'fechado';
        saveDb('crm_clientes', clientes);
    }

    return contratoSalvo;
}

document.getElementById('form-moto')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const idObj = document.getElementById('moto-id').value;
    let motos = getDb('crm_motos');
    const oldMoto = idObj ? motos.find(m => m.id === idObj) : null;

    const cfg = getTrackerConfig();
    const intervalo = parseInt(cfg.intervaloOleo) || 1000;
    const kmAtual = parseInt(document.getElementById('moto-km-atual')?.value) || 0;
    const kmUltimaTroca = parseInt(document.getElementById('moto-km-ultima-troca')?.value) || 0;
    const kmProximaTroca = kmUltimaTroca + intervalo;

    const clienteVinculadoId = document.getElementById('moto-cliente-vinculado')?.value || '';
    const vencimentoAluguel = document.getElementById('moto-vencimento-aluguel')?.value || '';
    const valorSemanalModal = document.getElementById('moto-valor-semanal')?.value || '';

    let statusFinal = document.getElementById('moto-status').value;
    if (clienteVinculadoId) {
        statusFinal = 'alugada';
    }

    const moto = {
        id: idObj || generateId(),
        placa: document.getElementById('moto-placa').value.toUpperCase(),
        cor: document.getElementById('moto-cor').value,
        modelo: document.getElementById('moto-modelo').value,
        ano: document.getElementById('moto-ano').value,
        renavam: document.getElementById('moto-renavam')?.value || '',
        chassi: document.getElementById('moto-chassi')?.value || '',
        valor: document.getElementById('moto-valor').value,
        status: statusFinal,
        foto: document.getElementById('moto-foto-base64').value,
        kmAtual: kmAtual,
        kmUltimaTroca: kmUltimaTroca,
        kmProximaTroca: kmProximaTroca,
        autoBloqueioKm: document.getElementById('moto-auto-bloqueio-km') ? document.getElementById('moto-auto-bloqueio-km').checked : true,
        bloqueadoPorKmOleo: oldMoto ? !!oldMoto.bloqueadoPorKmOleo : false,
        motivoBloqueioAutomatico: oldMoto ? (oldMoto.motivoBloqueioAutomatico || '') : '',
        historicoOleo: oldMoto && oldMoto.historicoOleo ? oldMoto.historicoOleo : [],
        rastreadorImei: document.getElementById('moto-rastreador-imei')?.value.trim() || '',
        rastreadorChip: document.getElementById('moto-rastreador-chip')?.value.trim() || '',
        rastreadorModelo: document.getElementById('moto-rastreador-modelo')?.value || '',
        rastreadorLink: document.getElementById('moto-rastreador-link')?.value || '',
        rastreadorLat: oldMoto && oldMoto.rastreadorLat ? oldMoto.rastreadorLat : '',
        rastreadorLng: oldMoto && oldMoto.rastreadorLng ? oldMoto.rastreadorLng : '',
        rastreadorEndereco: oldMoto && oldMoto.rastreadorEndereco ? oldMoto.rastreadorEndereco : '',
        rastreadorIgnicao: oldMoto ? !!oldMoto.rastreadorIgnicao : false,
        rastreadorBateriaRemovida: oldMoto ? !!oldMoto.rastreadorBateriaRemovida : false,
        rastreadorBloqueado: oldMoto ? !!oldMoto.rastreadorBloqueado : false,
        rastreadorUltimaSync: oldMoto ? oldMoto.rastreadorUltimaSync : new Date().toISOString()
    };

    verificarEAplicarBloqueioAutomaticoPorKm(moto, false);

    if (idObj) {
        motos = motos.map(m => m.id === idObj ? moto : m);
    } else {
        motos.push(moto);
    }

    saveDb('crm_motos', motos);

    if (clienteVinculadoId) {
        sincronizarContratoVinculoMoto(
            moto.id,
            clienteVinculadoId,
            new Date().toISOString().split('T')[0],
            vencimentoAluguel,
            valorSemanalModal,
            undefined,
            moto.valor
        );
    } else if (moto.status !== 'alugada') {
        sincronizarContratoVinculoMoto(moto.id, '', '', '', '', '', moto.valor);
    }

    closeModal('modal-moto');
    updateViews();
});

function renderFrota() {
    const motos = getDb('crm_motos');
    const query = document.getElementById('search-moto') ? document.getElementById('search-moto').value.toLowerCase() : '';
    const filtered = motos.filter(m => (m.placa || '').toLowerCase().includes(query) || (m.modelo || '').toLowerCase().includes(query));

    const tbody = document.getElementById('table-motos');
    if (!tbody) return;
    tbody.innerHTML = '';

    const contratos = getDb('crm_contratos');
    const clientes = getDb('crm_clientes');

    filtered.forEach(m => {
        let badgeClass = 'badge-disponivel';
        let statusLabel = 'Disponível';
        let infoLocacao = `
            <div style="margin-top:5px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span style="color:var(--text-muted); font-size:0.8rem;">Disponível no pátio</span>
                <button class="btn btn-primary btn-sm" style="padding:3px 9px; font-size:0.74rem;" onclick="abrirVinculoClienteMoto('${m.id}')">
                    <i class="fa-solid fa-user-plus"></i> Apontar Cliente
                </button>
            </div>
        `;

        const { contrato, cliente } = getCondutorContratoAtivo(m.id, contratos, clientes);

        if (m.status === 'alugada') {
            badgeClass = 'badge-alugada';
            statusLabel = 'Alugada';

            if (contrato && cliente) {
                const vInfo = getInfoVencimentoContrato(contrato);
                infoLocacao = `
                    <div style="margin-top:4px;">
                        <span style="font-size:0.82rem; color:var(--primary); font-weight:700;">
                            <i class="fa-solid fa-user-tag"></i> Com: ${cliente.nome}
                        </span>
                        <button class="btn btn-secondary btn-sm" style="padding:2px 7px; font-size:0.7rem; margin-left:6px;" onclick="abrirVinculoClienteMoto('${m.id}')" title="Trocar cliente, mudar vencimento ou devolver moto">
                            <i class="fa-solid fa-user-pen"></i> Alterar
                        </button><br>
                        <span style="font-size:0.76rem; color:var(--text-muted);">Vencimento: <strong>${vInfo.texto}</strong></span>
                    </div>
                `;
            } else {
                infoLocacao = `
                    <div style="margin-top:5px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span style="color:var(--danger); font-size:0.78rem; font-weight:600;">Sem cliente apontado</span>
                        <button class="btn btn-primary btn-sm" style="padding:3px 9px; font-size:0.74rem;" onclick="abrirVinculoClienteMoto('${m.id}')">
                            <i class="fa-solid fa-user-plus"></i> Apontar Cliente
                        </button>
                    </div>
                `;
            }
        }
        if (m.status === 'manutencao') {
            badgeClass = 'badge-manutencao';
            statusLabel = 'Em Manutenção';
            infoLocacao = `
                <div style="margin-top:5px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="font-size:0.78rem; color:var(--warning);">Em revisão / oficina</span>
                    <button class="btn btn-secondary btn-sm" style="padding:3px 9px; font-size:0.74rem;" onclick="abrirVinculoClienteMoto('${m.id}')">
                        <i class="fa-solid fa-user-plus"></i> Apontar Cliente
                    </button>
                </div>
            `;
        }

        const oleo = getMotoOleoInfo(m);

        let photoDisplay = `<div style="width:40px; height:34px; border-radius:4px; border:1px solid var(--border); display:flex; align-items:center; justify-content:center; color:var(--text-muted); background:#f1f5f9;"><i class="fa-solid fa-motorcycle"></i></div>`;
        if (m.foto) {
            photoDisplay = `<img src="${m.foto}" onclick="verFotoMotoCrm('${m.id}')" title="Clique para ampliar a foto" style="width:44px; height:36px; object-fit:cover; border-radius:4px; border:1px solid var(--border); cursor:pointer;">`;
        }

        const temRast = !!(m.rastreadorImei && m.rastreadorImei.trim() !== '');
        const isBloq = temRast && m.rastreadorBloqueado === true;
        const gpsBadge = !temRast
            ? `<span class="gps-pill" style="background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1;"><i class="fa-solid fa-ban" style="font-size:0.65rem;"></i> Sem Rastreador</span>`
            : (isBloq
                ? `<span class="gps-pill gps-blocked"><span class="gps-dot"></span> Bloqueada</span>`
                : `<span class="gps-pill gps-online"><span class="gps-dot"></span> Chip IoT Ativo</span>`);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="display:flex; align-items:center; gap:10px;">
                    ${photoDisplay}
                    <span style="font-size:0.75rem; color:var(--text-muted);">${m.id.substring(0, 4).toUpperCase()}</span>
                </div>
            </td>
            <td><strong>${m.placa}</strong></td>
            <td>
                <strong>${m.modelo}</strong> <span style="color:var(--text-muted);">(${m.cor || ''} - ${m.ano})</span>
                ${infoLocacao}
            </td>
            <td>
                <div style="font-size:0.8rem;">
                    <strong>${oleo.kmAtual} km</strong> / Próx: ${oleo.kmProximaTroca} km<br>
                    <span style="font-size:0.72rem; padding:1px 6px; border-radius:4px; background:${oleo.badgeBg}; color:${oleo.badgeColor}; font-weight:700;">${oleo.label}</span>
                </div>
            </td>
            <td>
                ${gpsBadge}<br>
                <small style="color:var(--text-muted); font-size:0.72rem; line-height:1.35; display:inline-block; margin-top:2px;">
                    ${temRast ? `ID: <strong>${m.rastreadorImei}</strong>` : '<span style="color:#94a3b8;">Não instalado nesta moto</span>'}
                    ${temRast && m.rastreadorChip ? `<br>ICCID: <strong>${m.rastreadorChip}</strong>` : ''}
                </small>
            </td>
            <td>R$ ${parseFloat(m.valor || 0).toFixed(2)}</td>
            <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
            <td>
                <div style="display:flex; gap:5px;">
                    <button class="btn btn-primary btn-sm" onclick="abrirVinculoClienteMoto('${m.id}')" title="Apontar / Trocar Cliente nesta Moto" style="background:var(--primary);"><i class="fa-solid fa-user-check"></i></button>
                    ${temRast ? `<button class="btn btn-primary btn-sm" onclick="abrirPainelRastreadorMoto('${m.id}')" title="Abrir Mapa e Rastreador (${m.placa})" style="background:#0284c7;"><i class="fa-solid fa-satellite-dish"></i></button>` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="abrirModalTrocaOleo('${m.id}')" title="Troca de Óleo (1.000 km)"><i class="fa-solid fa-oil-can"></i></button>
                    <button class="btn btn-secondary btn-sm" onclick="abrirEdicaoMoto('${m.id}')" title="Editar Moto"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="deletarMoto('${m.id}')" ${m.status === 'alugada' ? 'disabled' : ''} title="Excluir Moto"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deletarMoto(id) {
    if (!confirm("Excluir moto?")) return;
    let motos = getDb('crm_motos');
    motos = motos.filter(m => m.id !== id);
    localStorage.setItem('crm_motos', JSON.stringify(motos));
    if (!window.isFirebaseSyncing && window.db) { window.db.collection('crm_motos').doc(id).delete(); }
    updateViews();
}

function abrirEdicaoMoto(id) {
    openModal('modal-moto');

    const moto = getDb('crm_motos').find(m => m.id === id);
    if (!moto) return;

    const contratos = getDb('crm_contratos');
    const clientes = getDb('crm_clientes');
    const { contrato, cliente } = getCondutorContratoAtivo(moto.id, contratos, clientes);

    document.getElementById('moto-id').value = moto.id;
    document.getElementById('moto-placa').value = moto.placa || '';
    document.getElementById('moto-cor').value = moto.cor || '';
    document.getElementById('moto-modelo').value = moto.modelo || '';
    document.getElementById('moto-ano').value = moto.ano || '';
    if (document.getElementById('moto-renavam')) document.getElementById('moto-renavam').value = moto.renavam || '';
    if (document.getElementById('moto-chassi')) document.getElementById('moto-chassi').value = moto.chassi || '';
    document.getElementById('moto-status').value = moto.status || 'disponivel';
    document.getElementById('moto-valor').value = moto.valor || '';

    popularSelectClienteModalMoto(cliente ? cliente.id : '');
    if (document.getElementById('moto-vencimento-aluguel')) {
        if (contrato && contrato.dataProxVenc) {
            document.getElementById('moto-vencimento-aluguel').value = contrato.dataProxVenc;
        } else {
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 7);
            document.getElementById('moto-vencimento-aluguel').value = nextWeek.toISOString().split('T')[0];
        }
    }
    if (document.getElementById('moto-valor-semanal')) {
        document.getElementById('moto-valor-semanal').value = (contrato && contrato.valorSemanal)
            ? contrato.valorSemanal
            : ((parseFloat(moto.valor) || 0) * 7).toFixed(2);
    }

    const oleo = getMotoOleoInfo(moto);
    if (document.getElementById('moto-km-atual')) document.getElementById('moto-km-atual').value = oleo.kmAtual;
    if (document.getElementById('moto-km-ultima-troca')) document.getElementById('moto-km-ultima-troca').value = oleo.kmUltimaTroca;
    if (document.getElementById('moto-km-proxima-troca')) document.getElementById('moto-km-proxima-troca').value = oleo.kmProximaTroca;
    if (document.getElementById('moto-km-bloqueio-oleo')) document.getElementById('moto-km-bloqueio-oleo').value = oleo.kmBloqueioMotor;
    if (document.getElementById('moto-auto-bloqueio-km')) document.getElementById('moto-auto-bloqueio-km').checked = moto.autoBloqueioKm !== false;

    if (document.getElementById('moto-rastreador-imei')) document.getElementById('moto-rastreador-imei').value = moto.rastreadorImei || '';
    if (document.getElementById('moto-rastreador-chip')) document.getElementById('moto-rastreador-chip').value = moto.rastreadorChip || '';
    if (document.getElementById('moto-rastreador-modelo')) document.getElementById('moto-rastreador-modelo').value = moto.rastreadorModelo || '';
    if (document.getElementById('moto-rastreador-link')) document.getElementById('moto-rastreador-link').value = moto.rastreadorLink || '';

    if (moto.foto) {
        document.getElementById('moto-foto-base64').value = moto.foto;
        document.getElementById('moto-foto-preview').src = moto.foto;
        document.getElementById('moto-foto-preview').style.display = 'inline-block';
        document.getElementById('moto-foto-placeholder').style.display = 'none';
        document.getElementById('btn-remover-foto-moto').style.display = 'inline-block';
    }

    document.getElementById('modal-moto-title').innerText = 'Editar Moto, Cliente & Rastreador';
}

// ====================================================
// MODAL RÁPIDO: APONTAR CLIENTE NA MOTO ESCOLHIDA
// ====================================================
function abrirVinculoClienteMoto(motoId) {
    const moto = getDb('crm_motos').find(m => m.id === motoId);
    if (!moto) return;

    const contratos = getDb('crm_contratos');
    const clientes = getDb('crm_clientes');
    const { contrato, cliente } = getCondutorContratoAtivo(moto.id, contratos, clientes);

    document.getElementById('vinc-moto-id').value = moto.id;
    document.getElementById('vinc-moto-titulo').innerText = `${moto.modelo} (${moto.placa})`;
    document.getElementById('vinc-moto-subtitulo').innerText = `Cor: ${moto.cor || 'Padrão'} • Ano: ${moto.ano} • Diária: R$ ${parseFloat(moto.valor || 0).toFixed(2)}`;

    const sel = document.getElementById('vinc-cliente-select');
    sel.innerHTML = '<option value="">-- Selecione um Cliente Cadastrado --</option>';
    clientes.forEach(c => {
        sel.innerHTML += `<option value="${c.id}" ${cliente && cliente.id === c.id ? 'selected' : ''}>${c.nome} — ${c.telefone || 'Sem telefone'}</option>`;
    });
    sel.innerHTML += '<option value="__novo__">+ Cadastrar Novo Cliente Agora...</option>';

    document.getElementById('vinc-novo-cliente-box').style.display = 'none';
    document.getElementById('vinc-novo-nome').value = '';
    document.getElementById('vinc-novo-telefone').value = '';
    document.getElementById('vinc-novo-cpf').value = '';

    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('vinc-data-inicio').value = contrato && contrato.inicio ? contrato.inicio : hoje;

    if (contrato && contrato.dataProxVenc) {
        document.getElementById('vinc-data-vencimento').value = contrato.dataProxVenc;
    } else {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        document.getElementById('vinc-data-vencimento').value = nextWeek.toISOString().split('T')[0];
    }

    document.getElementById('vinc-valor-semanal').value = contrato && contrato.valorSemanal
        ? contrato.valorSemanal
        : ((parseFloat(moto.valor) || 0) * 7).toFixed(2);
    document.getElementById('vinc-valor-caucao').value = contrato && contrato.caucao ? contrato.caucao : '500.00';

    const btnDesvincular = document.getElementById('btn-desvincular-cliente-moto');
    if (btnDesvincular) {
        btnDesvincular.style.display = (moto.status === 'alugada' || contrato) ? 'block' : 'none';
    }

    openModal('modal-vincular-cliente-moto');
}

function toggleNovoClienteRapidoVinculo() {
    const sel = document.getElementById('vinc-cliente-select');
    const box = document.getElementById('vinc-novo-cliente-box');
    if (sel && box) {
        box.style.display = sel.value === '__novo__' ? 'block' : 'none';
    }
}

function calcularVencimentoVinculoRapido() {
    const inicioStr = document.getElementById('vinc-data-inicio')?.value;
    const vencInput = document.getElementById('vinc-data-vencimento');
    if (inicioStr && vencInput) {
        const d = new Date(inicioStr + 'T00:00:00');
        d.setDate(d.getDate() + 7);
        vencInput.value = d.toISOString().split('T')[0];
    }
}

function executarSalvamentoVinculoRapido() {
    const motoId = document.getElementById('vinc-moto-id').value;
    let clienteId = document.getElementById('vinc-cliente-select').value;

    if (!clienteId) {
        alert('Selecione um cliente cadastrado ou escolha "+ Cadastrar Novo Cliente Agora...".');
        return null;
    }

    if (clienteId === '__novo__') {
        const novoNome = document.getElementById('vinc-novo-nome').value.trim();
        const novoTel = document.getElementById('vinc-novo-telefone').value.trim();
        const novoCpf = document.getElementById('vinc-novo-cpf').value.trim();
        if (!novoNome || !novoTel) {
            alert('Informe o Nome e Telefone do novo cliente.');
            return null;
        }
        const novoCli = {
            id: generateId(),
            nome: novoNome,
            telefone: novoTel,
            cpf: novoCpf,
            email: '',
            rg: '',
            cnh: '',
            cnhCat: 'A',
            cnhValidade: '',
            endereco: '',
            fotoCnh: '',
            status: 'fechado',
            notas: []
        };
        let clientes = getDb('crm_clientes');
        clientes.push(novoCli);
        saveDb('crm_clientes', clientes);
        clienteId = novoCli.id;
    }

    const dataInicio = document.getElementById('vinc-data-inicio').value;
    const dataVenc = document.getElementById('vinc-data-vencimento').value;
    const valSemanal = document.getElementById('vinc-valor-semanal').value;
    const valCaucao = document.getElementById('vinc-valor-caucao').value;

    let motos = getDb('crm_motos');
    const mIdx = motos.findIndex(m => m.id === motoId);
    if (mIdx === -1) return null;

    motos[mIdx].status = 'alugada';
    saveDb('crm_motos', motos);

    const contrato = sincronizarContratoVinculoMoto(
        motoId,
        clienteId,
        dataInicio,
        dataVenc,
        valSemanal,
        valCaucao,
        motos[mIdx].valor
    );

    closeModal('modal-vincular-cliente-moto');
    updateViews();
    return contrato;
}

function salvarVinculoRapidoClienteMoto(e) {
    e.preventDefault();
    executarSalvamentoVinculoRapido();
}

function salvarVinculoEAbrirContratoGov() {
    const contrato = executarSalvamentoVinculoRapido();
    if (contrato && contrato.id) {
        abrirContratoNoEditorGov(contrato.id);
    }
}

function desvincularClienteDaMotoAtual() {
    if (!confirm('Deseja desvincular o cliente atual e colocar esta moto como Disponível no pátio?')) return;
    const motoId = document.getElementById('vinc-moto-id').value;
    let motos = getDb('crm_motos');
    const mIdx = motos.findIndex(m => m.id === motoId);
    if (mIdx > -1) {
        motos[mIdx].status = 'disponivel';
        saveDb('crm_motos', motos);
    }
    sincronizarContratoVinculoMoto(motoId, '', '', '', '', '', 0);
    closeModal('modal-vincular-cliente-moto');
    updateViews();
}

// =========================================================================
// MODULE: ÁREA EXCLUSIVA DE TROCA DE ÓLEO (1.000 KM) & BLOQUEIO (1.100 KM)
// =========================================================================
function renderOleoView() {
    const motos = getDb('crm_motos');
    const contratos = getDb('crm_contratos');
    const clientes = getDb('crm_clientes');

    const tbody = document.getElementById('table-oleo');
    if (!tbody) return;

    const query = (document.getElementById('search-oleo')?.value || '').toLowerCase();

    let countTotal = motos.length;
    let countOk = 0;
    let countAviso = 0;
    let countVencido = 0;
    let countBloqueadoKm = 0;

    motos.forEach(m => {
        const info = getMotoOleoInfo(m);
        if (info.atingiuBloqueioKm) countBloqueadoKm++;
        if (info.status === 'vencido') countVencido++;
        else if (info.status === 'aviso') countAviso++;
        else countOk++;
    });

    if (document.getElementById('oleo-kpi-total')) document.getElementById('oleo-kpi-total').innerText = countTotal;
    if (document.getElementById('oleo-kpi-ok')) document.getElementById('oleo-kpi-ok').innerText = countOk;
    if (document.getElementById('oleo-kpi-aviso')) document.getElementById('oleo-kpi-aviso').innerText = countAviso;
    if (document.getElementById('oleo-kpi-vencido')) document.getElementById('oleo-kpi-vencido').innerText = countVencido;

    // Alert box na aba de óleo
    const alertBox = document.getElementById('oleo-view-alert-box');
    if (alertBox) {
        if (countVencido > 0 || countAviso > 0) {
            alertBox.innerHTML = `
                <div class="alert-banner-oleo ${countVencido > 0 ? '' : 'warning-only'}">
                    <div>
                        <strong style="font-size:0.95rem; display:block; color:#111827;">
                            <i class="fa-solid fa-bell"></i> Controle Automático de Óleo (1.000 km) & Bloqueio de Proteção do Motor (1.100 km):
                            ${countVencido} moto(s) com troca vencida ${countBloqueadoKm > 0 ? `(${countBloqueadoKm} BLOQUEADA(S) AUTOMATICAMENTE POR EXCEDER 1.100 KM)` : ''} e ${countAviso} próxima(s) do limite!
                        </strong>
                        <span style="font-size:0.82rem; color:#4b5563;">
                            O hodômetro funciona integrado ao GPS do rastreador App Xtrack. A cada <strong>1.000 km</strong> o sistema alerta a troca de óleo, e ao atingir <strong>1.100 km rodados sem troca</strong> envia o bloqueio automático para evitar que o motor funda.
                        </span>
                    </div>
                </div>
            `;
        } else {
            alertBox.innerHTML = '';
        }
    }

    tbody.innerHTML = '';

    const filtered = motos.filter(m => {
        const { cliente } = getCondutorContratoAtivo(m.id, contratos, clientes);
        const nomeCli = cliente ? cliente.nome.toLowerCase() : '';
        return (m.modelo || '').toLowerCase().includes(query) ||
               (m.placa || '').toLowerCase().includes(query) ||
               nomeCli.includes(query);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state" style="padding:25px;">Nenhuma moto encontrada.</td></tr>`;
        return;
    }

    filtered.forEach(m => {
        const oleo = getMotoOleoInfo(m);
        const { cliente } = getCondutorContratoAtivo(m.id, contratos, clientes);

        let condutorHtml = `<span class="badge badge-disponivel">No Pátio</span>`;
        let btnWhatsOleo = '';
        if (cliente) {
            const numW = cliente.telefone ? cliente.telefone.replace(/\D/g, '') : '';
            if (numW) {
                const msg = oleo.atingiuBloqueioKm
                    ? `🚨 Olá ${cliente.nome}, aqui é da FACILITA MOTO! A moto ${m.modelo} (${m.placa}) atingiu ${oleo.kmAtual} km (${oleo.kmRodadosCiclo} km rodados desde a última troca de óleo) e entrou em BLOQUEIO AUTOMÁTICO DE PROTEÇÃO DO MOTOR (limite de 1.100 km). Compareça imediatamente para realizar a troca de óleo e liberar a motocicleta!`
                    : `Olá ${cliente.nome}, aqui é da FACILITA MOTO! A sua moto ${m.modelo} (${m.placa}) está com ${oleo.kmAtual} km registrados (troca de óleo programada aos ${oleo.kmProximaTroca} km e bloqueio automático de proteção do motor aos ${oleo.kmBloqueioMotor} km). Por favor, entre em contato para agendarmos a troca de óleo!`;
                btnWhatsOleo = `<a href="https://wa.me/55${numW}?text=${encodeURIComponent(msg)}" target="_blank" class="btn btn-secondary btn-sm" style="background:#25d366; color:#fff; padding:4px 8px;" title="Chamar condutor no WhatsApp sobre troca de óleo / bloqueio 1.100 km"><i class="fa-brands fa-whatsapp"></i> Avisar</a>`;
            }
            condutorHtml = `
                <div>
                    <strong>${cliente.nome}</strong><br>
                    <small style="color:var(--text-muted);">${cliente.telefone || ''}</small>
                </div>
            `;
        }

        const ultimaData = (m.historicoOleo && m.historicoOleo.length > 0)
            ? formatarDataBr(m.historicoOleo[m.historicoOleo.length - 1].data)
            : 'Inicial';

        const temRast = !!(m.rastreadorImei && m.rastreadorImei.trim() !== '');
        const isBloq = temRast && m.rastreadorBloqueado === true;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <strong>${m.modelo}</strong><br>
                <span style="font-size:0.78rem; color:var(--text-muted);">Placa: <strong>${m.placa}</strong></span>
            </td>
            <td>${condutorHtml}</td>
            <td>
                <div style="display:flex; align-items:center; gap:6px;">
                    <input type="number" id="inline-km-${m.id}" class="km-inline-input" value="${oleo.kmAtual}" min="0" step="1">
                    <button class="btn btn-primary btn-sm" onclick="salvarKmInlineMoto('${m.id}')" title="Salvar KM Atual e Verificar Limite de 1.100 km">
                        <i class="fa-solid fa-check"></i> Salvar KM
                    </button>
                </div>
            </td>
            <td>
                <strong>${oleo.kmUltimaTroca} km</strong><br>
                <small style="color:var(--text-muted);">${ultimaData}</small>
            </td>
            <td>
                <strong style="color:var(--primary); font-size:0.92rem;">Óleo: ${oleo.kmProximaTroca} km</strong><br>
                <small style="color:#dc2626; font-weight:700;">🛑 Bloqueio: ${oleo.kmBloqueioMotor} km (+${oleo.limiteBloqueio} km)</small>
            </td>
            <td>
                <div class="km-progress-wrap">
                    <div style="display:flex; justify-content:space-between; font-size:0.76rem; font-weight:700;">
                        <span>Rodados: ${oleo.kmRodadosCiclo} km (Bloqueio: ${oleo.limiteBloqueio} km)</span>
                        <span>${oleo.percentual}%</span>
                    </div>
                    <div class="km-progress-bar">
                        <div class="km-progress-fill" style="width:${oleo.percentual}%; background:${oleo.cor};"></div>
                    </div>
                    <span style="font-size:0.72rem; padding:2px 7px; border-radius:4px; background:${oleo.badgeBg}; color:${oleo.badgeColor}; font-weight:700; display:inline-block;">
                        ${oleo.label}
                    </span>
                </div>
            </td>
            <td>
                ${temRast
                    ? (isBloq
                        ? `<span class="gps-pill gps-blocked"><span class="gps-dot"></span> 🔒 BLOQUEADA (${m.bloqueadoPorKmOleo ? '1.100 km Óleo' : 'Remoto'})</span>`
                        : `<span class="gps-pill gps-online"><span class="gps-dot"></span> App Xtrack (${m.rastreadorImei})</span>`)
                    : `<span class="gps-pill" style="background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1;"><i class="fa-solid fa-ban" style="font-size:0.65rem;"></i> Sem Rastreador</span>`}
            </td>
            <td>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="btn btn-primary btn-sm" style="background:var(--success);" onclick="abrirModalTrocaOleo('${m.id}')" title="Registrar Troca de Óleo Realizada (+1.000 km) e Liberar Bloqueio por KM">
                        <i class="fa-solid fa-oil-can"></i> Registrar Troca (+1.000 km)
                    </button>
                    ${temRast ? `<button class="btn btn-secondary btn-sm" style="background:#0284c7; color:#fff;" onclick="abrirPainelRastreadorMoto('${m.id}')" title="Abrir Mapa GPS & Bloqueador"><i class="fa-solid fa-satellite-dish"></i></button>` : ''}
                    ${btnWhatsOleo}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function salvarKmInlineMoto(motoId) {
    const inputEl = document.getElementById(`inline-km-${motoId}`);
    if (!inputEl) return;
    const novoKm = parseInt(inputEl.value);
    if (isNaN(novoKm) || novoKm < 0) return alert('Informe uma quilometragem válida.');

    let motos = getDb('crm_motos');
    const idx = motos.findIndex(m => m.id === motoId);
    if (idx === -1) return;

    const cfg = getTrackerConfig();
    const intervalo = parseInt(cfg.intervaloOleo) || 1000;
    const semHistoricoPrevio = !motos[idx].historicoOleo || motos[idx].historicoOleo.length === 0;
    const ultimaAtual = parseInt(motos[idx].kmUltimaTroca) || 0;

    motos[idx].kmAtual = novoKm;
    if (ultimaAtual === 0 && semHistoricoPrevio && novoKm > 0) {
        motos[idx].kmUltimaTroca = novoKm;
        motos[idx].kmProximaTroca = novoKm + intervalo;
    } else if (!motos[idx].kmProximaTroca) {
        motos[idx].kmProximaTroca = ultimaAtual + intervalo;
    }
    motos[idx].rastreadorUltimaSync = new Date().toISOString();

    // Verifica se atingiu 1.100 km rodados sem troca de óleo para enviar bloqueio automático ao rastreador!
    const bloqueouAutomatico = verificarEAplicarBloqueioAutomaticoPorKm(motos[idx], false);

    saveDb('crm_motos', motos);
    updateViews();

    const info = getMotoOleoInfo(motos[idx]);
    if (bloqueouAutomatico || info.atingiuBloqueioKm) {
        alert(`🛑 BLOQUEIO AUTOMÁTICO DE PROTEÇÃO DO MOTOR ATIVADO (1.100 KM)!\n\nA moto ${motos[idx].modelo} (${motos[idx].placa}) atingiu ${novoKm} km (${info.kmRodadosCiclo} km rodados sem troca de óleo — limite de segurança: ${info.kmBloqueioMotor} km).\n\nO sistema enviou automaticamente o comando de BLOQUEIO para o rastreador/bloqueador da moto para evitar que o motor funda por falta de óleo!\n\nRegistre a troca de óleo para desbloquear a motocicleta.`);
    } else if (info.status === 'vencido') {
        alert(`🚨 AVISO DE MANUTENÇÃO (1.000 KM):\n\nA moto ${motos[idx].modelo} (${motos[idx].placa}) atingiu ${novoKm} km (Troca programada aos ${info.kmProximaTroca} km).\n\n⚠️ ATENÇÃO: Restam apenas ${Math.max(0, info.kmRestantesBloqueio)} km até o BLOQUEIO AUTOMÁTICO DE PROTEÇÃO DO MOTOR (${info.kmBloqueioMotor} km)!`);
    } else if (info.status === 'aviso') {
        alert(`⚠️ AVISO PREVENTIVO DE ÓLEO:\n\nFaltam apenas ${info.kmRestantes} km para a troca de óleo de 1.000 km da moto ${motos[idx].modelo} (${motos[idx].placa}).`);
    }
}

function abrirModalTrocaOleo(motoId) {
    const motos = getDb('crm_motos');
    const moto = motos.find(m => m.id === motoId);
    if (!moto) return;

    const contratos = getDb('crm_contratos');
    const clientes = getDb('crm_clientes');
    const { cliente } = getCondutorContratoAtivo(moto.id, contratos, clientes);

    const oleo = getMotoOleoInfo(moto);
    document.getElementById('oleo-moto-id').value = moto.id;
    document.getElementById('oleo-modal-moto-nome').innerText = `${moto.modelo} • Placa: ${moto.placa} (KM Atual: ${oleo.kmAtual} km)`;
    document.getElementById('oleo-modal-condutor').innerText = cliente ? `Condutor Atual: ${cliente.nome} (${cliente.telefone})` : 'Moto disponível no pátio';

    document.getElementById('oleo-input-km-troca').value = oleo.kmAtual;
    document.getElementById('oleo-input-prox-km').value = oleo.kmAtual + 1000;
    document.getElementById('oleo-input-data').value = new Date().toISOString().split('T')[0];
    document.getElementById('oleo-input-obs').value = '';

    const histContainer = document.getElementById('oleo-historico-lista');
    if (histContainer) {
        const hist = moto.historicoOleo || [];
        if (hist.length === 0) {
            histContainer.innerHTML = `<p class="empty-state">Nenhuma troca anterior registrada.</p>`;
        } else {
            histContainer.innerHTML = [...hist].reverse().map(h => `
                <div style="padding:8px 10px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between;">
                    <span><strong>${formatarDataBr(h.data)}</strong> — Trocado aos <strong>${h.km} km</strong> (Próx: ${h.proxKm} km)</span>
                    <span style="color:var(--text-muted);">${h.obs || 'Troca padrão 1.000 km'}</span>
                </div>
            `).join('');
        }
    }

    openModal('modal-troca-oleo');
}

function confirmarRegistroTrocaOleo(e) {
    e.preventDefault();
    const motoId = document.getElementById('oleo-moto-id').value;
    const kmTroca = parseInt(document.getElementById('oleo-input-km-troca').value) || 0;
    const dataTroca = document.getElementById('oleo-input-data').value;
    const obs = document.getElementById('oleo-input-obs').value;

    const cfg = getTrackerConfig();
    const intervalo = parseInt(cfg.intervaloOleo) || 1000;
    const limiteBloqueio = parseInt(cfg.limiteBloqueioOleo) || 1100;
    const proxKm = kmTroca + intervalo;

    let motos = getDb('crm_motos');
    const idx = motos.findIndex(m => m.id === motoId);
    if (idx === -1) return;

    const estavaBloqueadaPorKm = motos[idx].bloqueadoPorKmOleo === true || (motos[idx].rastreadorBloqueado === true && !motos[idx].bloqueadoPorInadimplencia);

    motos[idx].kmAtual = Math.max(parseInt(motos[idx].kmAtual) || 0, kmTroca);
    motos[idx].kmUltimaTroca = kmTroca;
    motos[idx].kmProximaTroca = proxKm;
    motos[idx].bloqueadoPorKmOleo = false;
    if (!motos[idx].bloqueadoPorInadimplencia) {
        motos[idx].motivoBloqueioAutomatico = '';
    }
    if (estavaBloqueadaPorKm && !motos[idx].bloqueadoPorInadimplencia) {
        motos[idx].rastreadorBloqueado = false;
        fetch('/api/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'command_block',
                id: motos[idx].rastreadorImei || '00018E1B',
                placa: motos[idx].placa,
                bloquear: false,
                motivo: 'Troca de óleo realizada — Motor liberado',
                xtrackEmail: cfg.xtrackEmail || '',
                xtrackSenha: cfg.xtrackSenha || ''
            })
        }).catch(() => {});
    }

    if (!Array.isArray(motos[idx].historicoOleo)) motos[idx].historicoOleo = [];
    motos[idx].historicoOleo.push({
        data: dataTroca,
        km: kmTroca,
        proxKm: proxKm,
        obs: obs || 'Troca de óleo 1.000 km'
    });

    saveDb('crm_motos', motos);
    closeModal('modal-troca-oleo');
    updateViews();

    if (typeof mostrarToastNotificacao === 'function') {
        mostrarToastNotificacao({
            titulo: `✅ Troca de Óleo Registrada (${motos[idx].placa})`,
            mensagem: `Novo ciclo iniciado aos ${kmTroca} km. Próxima troca: ${proxKm} km • Próximo bloqueio de proteção: ${kmTroca + limiteBloqueio} km.${estavaBloqueadaPorKm ? ' Moto desbloqueada automaticamente!' : ''}`,
            cor: '#10b981',
            icone: 'fa-oil-can'
        });
    }
}

// ====================================================
// MODULE: INTEGRAÇÃO COM RASTREADOR CHIP IOT (M2M)
// ====================================================
window.rastLeafletMap = null;
window.rastLeafletMarker = null;
window.rastLeafletTrail = null;
window.rastTileLayerStreet = null;
window.rastTileLayerSat = null;
window.rastModoSatelite = false;
window.rastLiveInterval = null;
window.rastCurrentCoords = [-30.0346, -51.2177];

function criarIconeMotoNoMapa(moto, cliente) {
    const isBloq = moto.rastreadorBloqueado === true;
    const batRemovida = moto.rastreadorBateriaRemovida === true;
    const ignicaoLigada = moto.rastreadorIgnicao === true;
    const temChip = !!(moto.rastreadorImei || moto.rastreadorChip);
    const chipId = moto.rastreadorImei || 'Não vinculado';
    const iccid = moto.rastreadorChip || 'Não vinculado';
    const nomeCondutor = cliente ? cliente.nome : 'No Pátio';

    const textoIgnicao = ignicaoLigada
        ? `<span style="color:#34d399; font-weight:700;">🔑 MOTO LIGADA (ACC ON)</span>`
        : `<span style="color:#cbd5e1; font-weight:700;">🔌 MOTO DESLIGADA (ACC OFF)</span>`;

    const textoBateria = batRemovida
        ? `<span style="color:#f87171; font-weight:800;">🚨 CABO DA BATERIA REMOVIDO! (Backup 3.7V)</span>`
        : `<span style="color:#34d399; font-weight:700;">🔋 Bateria Conectada (${ignicaoLigada ? '13.8V' : '12.6V'})</span>`;

    const isAlerta = isBloq || batRemovida;

    const html = `
        <div class="moto-iot-marker-wrap">
            <div class="moto-iot-floating-card">
                <div style="font-weight:800; color:#38bdf8;">🏍️ ${moto.modelo} • Placa: ${moto.placa} (${moto.cor || 'Preta'})</div>
                <div>👤 Condutor: <strong>${nomeCondutor}</strong></div>
                <div>📶 ID: <strong>${chipId}</strong> • ICCID: <strong>${iccid}</strong></div>
                <div>${textoIgnicao}</div>
                <div>${textoBateria}</div>
                ${isBloq ? `<div style="color:#f87171; font-weight:800;">🔒 BLOQUEADA REMOTAMENTE</div>` : ''}
            </div>
            <div class="moto-iot-pulse-ring ${isAlerta ? 'blocked' : ''}"></div>
            <div class="moto-iot-pin ${isAlerta ? 'blocked' : ''}" title="Arraste o pino ou clique no mapa para ajustar a posição exata da moto">
                <i class="fa-solid fa-motorcycle"></i>
            </div>
        </div>
    `;

    return L.divIcon({
        className: 'moto-live-div-icon',
        html: html,
        iconSize: [56, 56],
        iconAnchor: [28, 28]
    });
}

function colocarOuMoverPinoMotoNoMapa(moto, cliente, lat, lng, zoomLevel = 17) {
    window.rastCurrentCoords = [lat, lng];
    if (!window.rastLeafletMap) return;

    if (window.rastLeafletMarker) {
        window.rastLeafletMarker.setLatLng(window.rastCurrentCoords);
        window.rastLeafletMarker.setIcon(criarIconeMotoNoMapa(moto, cliente));
    } else {
        window.rastLeafletMarker = L.marker(window.rastCurrentCoords, {
            icon: criarIconeMotoNoMapa(moto, cliente),
            draggable: true
        }).addTo(window.rastLeafletMap);

        window.rastLeafletMarker.on('dragend', function(e) {
            const mId = document.getElementById('rast-moto-id')?.value;
            if (!mId) return;
            const pos = e.target.getLatLng();
            window.rastCurrentCoords = [pos.lat, pos.lng];
            consultarEnderecoReversoNominatim(mId, pos.lat, pos.lng);
        });
    }
    window.rastLeafletMap.setView(window.rastCurrentCoords, zoomLevel, { animate: true });
}

function salvarPosicaoRealMotoNoMapa(motoId, lat, lng, enderecoTexto) {
    let motos = getDb('crm_motos');
    const idx = motos.findIndex(m => m.id === motoId);
    if (idx === -1) return;

    const cfg = getTrackerConfig();
    const latAnt = parseFloat(motos[idx].rastreadorLat);
    const lngAnt = parseFloat(motos[idx].rastreadorLng);

    // Se o hodômetro automático por GPS estiver ativo, soma os KMs percorridos pela variação de coordenadas GPS
    if (cfg.autoKm !== false && !isNaN(latAnt) && !isNaN(lngAnt)) {
        const deltaKm = calcularDistanciaGpsHaversineKm(latAnt, lngAnt, lat, lng);
        if (deltaKm > 0) {
            const fracaoAcumulada = (parseFloat(motos[idx].kmGpsFracao) || 0) + deltaKm;
            const kmInteirosGanhos = Math.floor(fracaoAcumulada);
            motos[idx].kmGpsFracao = fracaoAcumulada - kmInteirosGanhos;
            if (kmInteirosGanhos > 0) {
                motos[idx].kmAtual = (parseInt(motos[idx].kmAtual) || 0) + kmInteirosGanhos;
                const inputKm = document.getElementById('rast-input-km');
                if (inputKm) inputKm.value = motos[idx].kmAtual;
            }
        }
    }

    motos[idx].rastreadorLat = lat;
    motos[idx].rastreadorLng = lng;
    if (enderecoTexto) {
        motos[idx].rastreadorEndereco = enderecoTexto;
    }
    motos[idx].rastreadorUltimaSync = new Date().toISOString();

    // Verifica se o KM atingiu 1.100 km rodados sem troca de óleo para bloquear automaticamente
    verificarEAplicarBloqueioAutomaticoPorKm(motos[idx], false);

    saveDb('crm_motos', motos);

    atualizarHudTelemetriaAoVivo(motos[idx], enderecoTexto || motos[idx].rastreadorEndereco || 'Posição demarcada no mapa');
}

function consultarEnderecoReversoNominatim(motoId, lat, lng) {
    const endEl = document.getElementById('rast-endereco-atual');
    if (endEl) {
        endEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color:#38bdf8;"></i> Consultando endereço exato das coordenadas (${lat.toFixed(5)}, ${lng.toFixed(5)})...`;
    }

    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=pt-BR`)
        .then(r => r.json())
        .then(data => {
            let enderecoFormatado = data && data.display_name
                ? data.display_name
                : `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
            if (data && data.address) {
                const a = data.address;
                const rua = a.road || a.pedestrian || a.suburb || '';
                const num = a.house_number ? `, ${a.house_number}` : '';
                const bairro = a.suburb || a.neighbourhood || a.city_district || '';
                const cidade = a.city || a.town || a.municipality || 'Porto Alegre';
                const uf = a.state_code || 'RS';
                if (rua) {
                    enderecoFormatado = `${rua}${num}${bairro ? ' — ' + bairro : ''}, ${cidade}/${uf}`;
                }
            }
            const inputBusca = document.getElementById('rast-input-busca-endereco');
            if (inputBusca) inputBusca.value = enderecoFormatado;
            salvarPosicaoRealMotoNoMapa(motoId, lat, lng, enderecoFormatado);
        })
        .catch(() => {
            const fallbackEnd = `Coordenadas GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            salvarPosicaoRealMotoNoMapa(motoId, lat, lng, fallbackEnd);
        });
}

function buscarEnderecoRealMotoNoMapa() {
    const motoId = document.getElementById('rast-moto-id')?.value;
    const inputEl = document.getElementById('rast-input-busca-endereco');
    if (!motoId || !inputEl) return;

    const termo = inputEl.value.trim();
    if (!termo) {
        alert('Digite a Rua, Número, Bairro, Cidade ou as coordenadas (Lat, Lng) onde a moto está.');
        return;
    }

    // Verifica se o usuário digitou coordenadas diretas (ex: -30.0346, -51.2177)
    const motos = getDb('crm_motos');
    const motoObj = motos.find(m => m.id === motoId);
    const { cliente } = motoObj ? getCondutorContratoAtivo(motoObj.id, getDb('crm_contratos'), getDb('crm_clientes')) : { cliente: null };

    const coordMatch = termo.match(/^(-?\d+\.\d+)\s*[,;]\s*(-?\d+\.\d+)$/);
    if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        if (motoObj) colocarOuMoverPinoMotoNoMapa(motoObj, cliente, lat, lng, 17);
        consultarEnderecoReversoNominatim(motoId, lat, lng);
        return;
    }

    const endEl = document.getElementById('rast-endereco-atual');
    if (endEl) {
        endEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color:#38bdf8;"></i> Localizando endereço "${termo}" no mapa...`;
    }

    fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(termo)}&limit=1&countrycodes=br&accept-language=pt-BR`)
        .then(r => r.json())
        .then(results => {
            if (!results || results.length === 0) {
                alert('Endereço não encontrado. Tente informar Rua, Bairro e Cidade (ex: Av. Assis Brasil, Porto Alegre - RS).');
                return;
            }
            const loc = results[0];
            const lat = parseFloat(loc.lat);
            const lng = parseFloat(loc.lon);
            const nomeEnd = loc.display_name;

            if (motoObj) colocarOuMoverPinoMotoNoMapa(motoObj, cliente, lat, lng, 17);
            salvarPosicaoRealMotoNoMapa(motoId, lat, lng, nomeEnd);
        })
        .catch(() => {
            alert('Erro ao buscar endereço no mapa. Você também pode clicar diretamente na rua desejada no mapa.');
        });
}

function inicializarOuAtualizarMapaVivoMoto(moto, cliente) {
    const mapContainer = document.getElementById('rast-live-map');
    if (!mapContainer || typeof L === 'undefined') return;

    if (window.rastLiveInterval) {
        clearInterval(window.rastLiveInterval);
        window.rastLiveInterval = null;
    }

    const temChip = !!(moto.rastreadorImei || moto.rastreadorChip);
    const latSalva = parseFloat(moto.rastreadorLat);
    const lngSalva = parseFloat(moto.rastreadorLng);
    const temPosicaoConfirmada = !isNaN(latSalva) && !isNaN(lngSalva);

    // Visão panorâmica inicial da Região Metropolitana de Porto Alegre caso a moto ainda não tenha coordenada salva
    const centroInicial = temPosicaoConfirmada ? [latSalva, lngSalva] : [-30.0150, -51.1800];
    const zoomInicial = temPosicaoConfirmada ? 17 : 12;
    window.rastCurrentCoords = centroInicial;

    const inputBusca = document.getElementById('rast-input-busca-endereco');
    const enderecoParaBuscarAutomatico = moto.rastreadorEndereco || (cliente && cliente.endereco ? cliente.endereco : '');
    if (inputBusca) {
        inputBusca.value = enderecoParaBuscarAutomatico;
    }

    if (!window.rastLeafletMap) {
        window.rastLeafletMap = L.map('rast-live-map', {
            center: centroInicial,
            zoom: zoomInicial,
            zoomControl: true
        });

        window.rastTileLayerStreet = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap • Chip IoT FACILITA MOTO'
        });

        window.rastTileLayerSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: '&copy; Satélite M2M • Chip IoT'
        });

        window.rastTileLayerStreet.addTo(window.rastLeafletMap);

        // Clicar em qualquer ponto do mapa posiciona a moto exatamente naquele local real
        window.rastLeafletMap.on('click', function(e) {
            const mId = document.getElementById('rast-moto-id')?.value;
            if (!mId) return;
            const motosAtuais = getDb('crm_motos');
            const mObj = motosAtuais.find(x => x.id === mId);
            if (!mObj) return;
            const { cliente: cliObj } = getCondutorContratoAtivo(mObj.id, getDb('crm_contratos'), getDb('crm_clientes'));

            const clickedLat = e.latlng.lat;
            const clickedLng = e.latlng.lng;
            colocarOuMoverPinoMotoNoMapa(mObj, cliObj, clickedLat, clickedLng, window.rastLeafletMap.getZoom());
            consultarEnderecoReversoNominatim(mId, clickedLat, clickedLng);
        });
    } else {
        window.rastLeafletMap.setView(centroInicial, zoomInicial);
    }

    if (window.rastLeafletMarker) {
        window.rastLeafletMap.removeLayer(window.rastLeafletMarker);
        window.rastLeafletMarker = null;
    }
    if (window.rastLeafletTrail) {
        window.rastLeafletMap.removeLayer(window.rastLeafletTrail);
        window.rastLeafletTrail = null;
    }

    if (temPosicaoConfirmada) {
        // Só coloca o pino na rua se a coordenada real já foi definida/sincronizada
        colocarOuMoverPinoMotoNoMapa(moto, cliente, latSalva, lngSalva, 17);
        atualizarHudTelemetriaAoVivo(moto, moto.rastreadorEndereco || `Coordenadas GPS (${latSalva.toFixed(5)}, ${lngSalva.toFixed(5)})`);
    } else if (enderecoParaBuscarAutomatico) {
        // Se o cliente ou a moto tem endereço cadastrado, geocodifica automaticamente o endereço real!
        atualizarHudTelemetriaAoVivo(moto, `Localizando endereço automaticamente: ${enderecoParaBuscarAutomatico}...`);
        fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(enderecoParaBuscarAutomatico)}&limit=1&countrycodes=br&accept-language=pt-BR`)
            .then(r => r.json())
            .then(results => {
                if (results && results.length > 0) {
                    const lat = parseFloat(results[0].lat);
                    const lng = parseFloat(results[0].lon);
                    colocarOuMoverPinoMotoNoMapa(moto, cliente, lat, lng, 17);
                    salvarPosicaoRealMotoNoMapa(moto.id, lat, lng, results[0].display_name);
                } else {
                    tentarGeolocalizacaoAutonomaSilenciosa(moto, cliente);
                }
            })
            .catch(() => {
                tentarGeolocalizacaoAutonomaSilenciosa(moto, cliente);
            });
    } else {
        // Tenta puxar automaticamente a localização real via API M2M / GPS sem inventar rua falsa
        tentarGeolocalizacaoAutonomaSilenciosa(moto, cliente);
    }

    // Inicia ciclo autônomo de leitura de telemetria (Ignição, Cabo da Bateria e GPS) a cada 4 segundos
    sincronizarTelemetriaAutonomaMoto(moto.id, true);
    window.rastLiveInterval = setInterval(() => {
        const modalEl = document.getElementById('modal-rastreador');
        const mIdAtual = document.getElementById('rast-moto-id')?.value;
        if (modalEl && modalEl.classList.contains('show') && mIdAtual) {
            sincronizarTelemetriaAutonomaMoto(mIdAtual, true);
        }
    }, 4000);

    // Força recalcular tamanho do mapa após abertura do modal
    setTimeout(() => {
        if (window.rastLeafletMap) {
            window.rastLeafletMap.invalidateSize();
        }
    }, 120);
    setTimeout(() => {
        if (window.rastLeafletMap) {
            window.rastLeafletMap.invalidateSize();
        }
    }, 380);
}

function tentarGeolocalizacaoAutonomaSilenciosa(moto, cliente) {
    atualizarHudTelemetriaAoVivo(moto, '');
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(pos) {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                colocarOuMoverPinoMotoNoMapa(moto, cliente, lat, lng, 17);
                consultarEnderecoReversoNominatim(moto.id, lat, lng);
            },
            function() {
                // Caso o navegador não forneça GPS direto, aguarda pacote da API M2M ou busca de endereço
            },
            { enableHighAccuracy: true, timeout: 6000 }
        );
    }
}

function atualizarHudTelemetriaAoVivo(moto, enderecoTexto) {
    const isBloq = moto.rastreadorBloqueado === true;
    const batRemovida = moto.rastreadorBateriaRemovida === true;
    const ignicaoLigada = moto.rastreadorIgnicao === true;
    const temChip = !!(moto.rastreadorImei || moto.rastreadorChip);
    const chipId = moto.rastreadorImei || 'Não vinculado';
    const iccid = moto.rastreadorChip || 'Não vinculado';
    const oleo = getMotoOleoInfo(moto);

    const dotEl = document.getElementById('rast-live-dot');
    const badgeTextEl = document.getElementById('rast-live-badge-text');
    const velEl = document.getElementById('rast-live-velocidade');
    const endEl = document.getElementById('rast-endereco-atual');
    const syncEl = document.getElementById('rast-ultima-sync');
    const ignicaoBoxEl = document.getElementById('rast-status-ignicao');
    const bateriaBoxEl = document.getElementById('rast-status-bateria');
    const alertaViolacaoEl = document.getElementById('rast-alerta-violacao-bateria');
    const alertaBloqueioKmEl = document.getElementById('rast-alerta-bloqueio-km');
    const alertaBloqueioKmDescEl = document.getElementById('rast-alerta-bloqueio-km-desc');
    const kmAtualEl = document.getElementById('rast-km-atual');
    const kmOleoEl = document.getElementById('rast-km-oleo');
    const kmBloqueioMotorEl = document.getElementById('rast-km-bloqueio-motor');
    const statusBloqEl = document.getElementById('rast-status-bloqueio');

    if (alertaViolacaoEl) {
        alertaViolacaoEl.style.display = (temChip && batRemovida) ? 'block' : 'none';
    }
    if (alertaBloqueioKmEl) {
        const mostrarAlertaKm = temChip && (oleo.atingiuBloqueioKm || moto.bloqueadoPorKmOleo === true);
        alertaBloqueioKmEl.style.display = mostrarAlertaKm ? 'block' : 'none';
        if (mostrarAlertaKm && alertaBloqueioKmDescEl) {
            alertaBloqueioKmDescEl.innerText = `A moto ${moto.modelo} (${moto.placa}) rodou ${oleo.kmRodadosCiclo} km desde a última troca (${oleo.kmUltimaTroca} km -> ${oleo.kmAtual} km), atingindo o limite de proteção de ${oleo.limiteBloqueio} km (${oleo.kmBloqueioMotor} km). Bloqueio enviado ao rastreador App Xtrack para evitar que o motor funda!`;
        }
    }
    const alertaBloqueioInadEl = document.getElementById('rast-alerta-bloqueio-inadimplencia');
    const alertaBloqueioInadDescEl = document.getElementById('rast-alerta-bloqueio-inadimplencia-desc');
    if (alertaBloqueioInadEl) {
        const mostrarAlertaInad = moto.bloqueadoPorInadimplencia === true;
        alertaBloqueioInadEl.style.display = mostrarAlertaInad ? 'block' : 'none';
        if (mostrarAlertaInad && alertaBloqueioInadDescEl) {
            alertaBloqueioInadDescEl.innerText = `A moto ${moto.modelo} (${moto.placa}) foi bloqueada automaticamente pelo sistema porque o aluguel semanal não foi confirmado até as 18:00h. Pela regra de segurança, ela só volta a liberar após a confirmação do pagamento do PIX (Mercado Pago).`;
        }
    }

    if (kmAtualEl) kmAtualEl.innerText = `${oleo.kmAtual} km`;
    if (kmOleoEl) kmOleoEl.innerText = `${oleo.kmProximaTroca} km (${oleo.label})`;
    if (kmBloqueioMotorEl) {
        if (oleo.atingiuBloqueioKm || moto.bloqueadoPorKmOleo) {
            kmBloqueioMotorEl.innerHTML = `🛑 BLOQUEADO AOS ${oleo.kmBloqueioMotor} KM`;
            kmBloqueioMotorEl.style.color = '#dc2626';
        } else {
            kmBloqueioMotorEl.innerHTML = `${oleo.kmBloqueioMotor} km (Faltam ${Math.max(0, oleo.kmRestantesBloqueio)} km)`;
            kmBloqueioMotorEl.style.color = oleo.kmRestantesBloqueio <= 150 ? '#dc2626' : '#d97706';
        }
    }
    if (statusBloqEl && temChip) {
        if (isBloq) {
            statusBloqEl.innerText = moto.bloqueadoPorInadimplencia
                ? '🛑 BLOQUEADA (INADIMPLÊNCIA 18:00H • SÓ LIBERA PÓS-PIX)'
                : (moto.bloqueadoPorKmOleo ? '🛑 BLOQUEADA POR KM (1.100 KM ÓLEO)' : '🔒 BLOQUEADA VIA APP XTRACK');
            statusBloqEl.style.color = 'var(--danger)';
        } else {
            statusBloqEl.innerText = '🔓 Desbloqueada (Operação Normal)';
            statusBloqEl.style.color = 'var(--success)';
        }
    }

    if (ignicaoBoxEl) {
        if (!temChip) {
            ignicaoBoxEl.innerHTML = 'Sem Chip IoT';
            ignicaoBoxEl.style.color = '#64748b';
        } else if (ignicaoLigada) {
            ignicaoBoxEl.innerHTML = '🟢 MOTO LIGADA (ACC ON)';
            ignicaoBoxEl.style.color = 'var(--success)';
        } else {
            ignicaoBoxEl.innerHTML = '🔌 MOTO DESLIGADA (ACC OFF)';
            ignicaoBoxEl.style.color = '#475569';
        }
    }

    if (bateriaBoxEl) {
        if (!temChip) {
            bateriaBoxEl.innerHTML = 'Sem Chip IoT';
            bateriaBoxEl.style.color = '#64748b';
        } else if (batRemovida) {
            bateriaBoxEl.innerHTML = '🚨 CABO REMOVIDO! (0V • Backup 3.7V)';
            bateriaBoxEl.style.color = 'var(--danger)';
        } else {
            const tensao = ignicaoLigada ? '13.8V' : '12.6V';
            bateriaBoxEl.innerHTML = `🔋 CONECTADO (${tensao} • Normal)`;
            bateriaBoxEl.style.color = 'var(--success)';
        }
    }

    const isAlertaCritico = isBloq || batRemovida || oleo.atingiuBloqueioKm;
    if (dotEl) {
        dotEl.style.background = !temChip ? '#f59e0b' : (isAlertaCritico ? '#ef4444' : '#10b981');
        dotEl.style.boxShadow = !temChip ? '0 0 10px #f59e0b' : (isAlertaCritico ? '0 0 10px #ef4444' : '0 0 10px #10b981');
    }
    if (badgeTextEl) {
        badgeTextEl.innerText = temChip
            ? `APP XTRACK • ID: ${chipId} • ICCID: ${iccid}`
            : `MOTO SEM RASTREADOR VINCULADO (${moto.placa})`;
        badgeTextEl.style.color = !temChip ? '#fbbf24' : (isAlertaCritico ? '#f87171' : '#38bdf8');
    }
    if (velEl) {
        if (!temChip) {
            velEl.innerText = `⚠️ Sem Rastreador`;
        } else if (batRemovida) {
            velEl.innerText = `🚨 CABO DA BATERIA REMOVIDO!`;
            velEl.style.background = '#7f1d1d';
            velEl.style.borderColor = '#ef4444';
        } else if (isBloq) {
            velEl.innerText = moto.bloqueadoPorKmOleo ? `🛑 BLOQUEADA POR KM (1.100 KM ÓLEO)` : `🔒 Moto Bloqueada`;
            velEl.style.background = '#7f1d1d';
            velEl.style.borderColor = '#ef4444';
        } else {
            velEl.innerText = `${ignicaoLigada ? '🔑 Moto Ligada (ACC ON)' : '🔌 Moto Desligada (ACC OFF)'} • 🔋 Bateria OK • 🛣️ ${oleo.kmAtual} km`;
            velEl.style.background = '#1e293b';
            velEl.style.borderColor = '#475569';
        }
    }
    if (endEl) {
        if (enderecoTexto) {
            endEl.innerHTML = `<i class="fa-solid fa-location-dot" style="color:${isAlertaCritico ? '#ef4444' : '#10b981'};"></i> Localização Real (${moto.modelo} • ${moto.placa}): <strong>${enderecoTexto}</strong> <span style="color:#94a3b8; font-weight:400; font-size:0.74rem;">(${window.rastCurrentCoords[0].toFixed(5)}, ${window.rastCurrentCoords[1].toFixed(5)})</span>`;
        } else if (!temChip) {
            endEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#fbbf24;"></i> <strong>Esta moto (${moto.modelo} • ${moto.placa}) ainda não possui rastreador instalado.</strong>`;
        } else {
            endEl.innerHTML = `<i class="fa-solid fa-satellite-dish" style="color:#38bdf8;"></i> <strong>Aguardando coordenada GPS da rua ou clique em "Meu GPS Atual" / no mapa para fixar a rua exata da moto ${moto.placa}.</strong>`;
        }
    }
    if (syncEl) {
        const horaSync = new Date().toLocaleTimeString('pt-BR');
        syncEl.innerHTML = `<i class="fa-solid fa-sim-card" style="color:#38bdf8;"></i> App Xtrack • ID: <strong>${chipId}</strong> • Ignição: <strong>${ignicaoLigada ? 'LIGADA' : 'DESLIGADA'}</strong> • Bateria: <strong>${batRemovida ? '🚨 CABO REMOVIDO' : '12V OK'}</strong> • Hodômetro GPS: <strong>${oleo.kmAtual} km</strong> (Bloqueio: ${oleo.kmBloqueioMotor} km) • Sync: ${horaSync}`;
    }

    // Atualiza o ícone no mapa se já existir marcador
    if (window.rastLeafletMarker) {
        const { cliente } = getCondutorContratoAtivo(moto.id, getDb('crm_contratos'), getDb('crm_clientes'));
        window.rastLeafletMarker.setIcon(criarIconeMotoNoMapa(moto, cliente));
    }
}

function sincronizarTelemetriaAutonomaMoto(motoId, silencioso = true) {
    let motos = getDb('crm_motos');
    const idx = motos.findIndex(m => m.id === motoId);
    if (idx === -1) return;
    const moto = motos[idx];
    if (!moto.rastreadorImei) return;

    const cfg = getTrackerConfig();
    const deviceId = encodeURIComponent(moto.rastreadorImei.trim());
    let queryUrl = `/api/telemetry?id=${deviceId}&placa=${encodeURIComponent(moto.placa || 'IPU2I57')}`;
    if (cfg.xtrackEmail && cfg.xtrackSenha) {
        queryUrl += `&xtrackEmail=${encodeURIComponent(cfg.xtrackEmail)}&xtrackSenha=${encodeURIComponent(cfg.xtrackSenha)}`;
    }

    fetch(queryUrl)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (!data || !data.device) return;
            const dev = data.device;
            if (!dev.updatedAt) return;

            let alterou = false;
            if (dev.ignicao !== undefined && moto.rastreadorIgnicao !== dev.ignicao) {
                moto.rastreadorIgnicao = dev.ignicao;
                alterou = true;
            }
            if (dev.bateriaRemovida !== undefined && moto.rastreadorBateriaRemovida !== dev.bateriaRemovida) {
                moto.rastreadorBateriaRemovida = dev.bateriaRemovida;
                alterou = true;
            }
            if (dev.kmAtual && parseInt(dev.kmAtual) > 0 && moto.kmAtual !== parseInt(dev.kmAtual)) {
                moto.kmAtual = parseInt(dev.kmAtual);
                alterou = true;
            }

            const latRec = parseFloat(dev.lat);
            const lngRec = parseFloat(dev.lng);
            if (!isNaN(latRec) && !isNaN(lngRec)) {
                const latAnt = parseFloat(moto.rastreadorLat);
                const lngAnt = parseFloat(moto.rastreadorLng);
                if (isNaN(latAnt) || isNaN(lngAnt) || Math.abs(latRec - latAnt) > 0.0001 || Math.abs(lngRec - lngAnt) > 0.0001) {
                    // Contabiliza KM rodado por GPS automaticamente (Haversine)
                    if (cfg.autoKm !== false && !isNaN(latAnt) && !isNaN(lngAnt)) {
                        const deltaKm = calcularDistanciaGpsHaversineKm(latAnt, lngAnt, latRec, lngRec);
                        if (deltaKm > 0) {
                            const fracao = (parseFloat(moto.kmGpsFracao) || 0) + deltaKm;
                            const inteiros = Math.floor(fracao);
                            moto.kmGpsFracao = fracao - inteiros;
                            if (inteiros > 0) {
                                moto.kmAtual = (parseInt(moto.kmAtual) || 0) + inteiros;
                            }
                        }
                    }
                    moto.rastreadorLat = latRec;
                    moto.rastreadorLng = lngRec;
                    alterou = true;
                    const { cliente } = getCondutorContratoAtivo(moto.id, getDb('crm_contratos'), getDb('crm_clientes'));
                    colocarOuMoverPinoMotoNoMapa(moto, cliente, latRec, lngRec, 17);
                    consultarEnderecoReversoNominatim(moto.id, latRec, lngRec);
                }
            }

            // Verifica automaticamente se atingiu 1.100 km sem troca de óleo para enviar bloqueio ao rastreador
            if (verificarEAplicarBloqueioAutomaticoPorKm(moto, false)) {
                alterou = true;
            }

            if (alterou) {
                motos[idx] = moto;
                saveDb('crm_motos', motos);
                updateViews();
            }
            atualizarHudTelemetriaAoVivo(moto, moto.rastreadorEndereco || '');
        })
        .catch(() => {
            if (!silencioso) {
                atualizarHudTelemetriaAoVivo(moto, moto.rastreadorEndereco || '');
            }
        });
}

function simularRodagemGpsMoto(kmIncremento = 100) {
    const motoId = document.getElementById('rast-moto-id')?.value;
    if (!motoId) return;
    let motos = getDb('crm_motos');
    const idx = motos.findIndex(m => m.id === motoId);
    if (idx === -1) return;

    const cfg = getTrackerConfig();
    const intervalo = parseInt(cfg.intervaloOleo) || 1000;
    const semHistoricoPrevio = !motos[idx].historicoOleo || motos[idx].historicoOleo.length === 0;
    const kmAtualAntigo = parseInt(motos[idx].kmAtual) || 0;
    if ((!motos[idx].kmUltimaTroca || parseInt(motos[idx].kmUltimaTroca) === 0) && kmAtualAntigo > 0 && semHistoricoPrevio) {
        motos[idx].kmUltimaTroca = kmAtualAntigo;
        motos[idx].kmProximaTroca = kmAtualAntigo + intervalo;
    }

    const novoKm = kmAtualAntigo + (parseInt(kmIncremento) || 100);
    motos[idx].kmAtual = novoKm;
    motos[idx].rastreadorIgnicao = true;
    motos[idx].rastreadorUltimaSync = new Date().toISOString();

    const bloqueouPorKm = verificarEAplicarBloqueioAutomaticoPorKm(motos[idx], false);
    saveDb('crm_motos', motos);

    const inputKm = document.getElementById('rast-input-km');
    if (inputKm) inputKm.value = novoKm;

    fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: motos[idx].rastreadorImei || '00018E1B',
            ignicao: motos[idx].rastreadorIgnicao,
            bateriaRemovida: !!motos[idx].rastreadorBateriaRemovida,
            kmAtual: novoKm,
            bloqueado: !!motos[idx].rastreadorBloqueado,
            motivoBloqueio: motos[idx].motivoBloqueioAutomatico || '',
            lat: motos[idx].rastreadorLat,
            lng: motos[idx].rastreadorLng
        })
    }).catch(() => {});

    atualizarHudTelemetriaAoVivo(motos[idx], motos[idx].rastreadorEndereco || '');
    updateViews();
    abrirPainelRastreadorMoto(motoId);

    const oleo = getMotoOleoInfo(motos[idx]);
    if (bloqueouPorKm || oleo.atingiuBloqueioKm) {
        alert(`🛑 BLOQUEIO AUTOMÁTICO DE PROTEÇÃO DO MOTOR ATIVADO (1.100 KM)!\n\nHodômetro GPS avançou para ${novoKm} km (${oleo.kmRodadosCiclo} km rodados desde a última troca de óleo aos ${oleo.kmUltimaTroca} km).\n\nComo atingiu o limite de segurança de ${oleo.limiteBloqueio} km (${oleo.kmBloqueioMotor} km) sem troca de óleo, o sistema enviou automaticamente o comando de BLOQUEIO ao rastreador e bloqueador da moto para evitar que o motor funda!`);
    } else if (oleo.status === 'vencido') {
        alert(`🚨 ALERTA DE TROCA DE ÓLEO (1.000 KM)!\n\nHodômetro GPS: ${novoKm} km (${oleo.kmRodadosCiclo} km rodados no ciclo).\nA troca de óleo está vencida (${oleo.kmProximaTroca} km)!\n\n⚠️ ATENÇÃO: Em mais ${Math.max(0, oleo.kmRestantesBloqueio)} km (aos ${oleo.kmBloqueioMotor} km), o sistema enviará o BLOQUEIO AUTOMÁTICO para proteger o motor!`);
    }
}

function alternarStatusIgnicaoMoto() {
    const motoId = document.getElementById('rast-moto-id')?.value;
    if (!motoId) return;
    let motos = getDb('crm_motos');
    const idx = motos.findIndex(m => m.id === motoId);
    if (idx === -1) return;

    motos[idx].rastreadorIgnicao = !motos[idx].rastreadorIgnicao;
    motos[idx].rastreadorUltimaSync = new Date().toISOString();
    saveDb('crm_motos', motos);

    fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: motos[idx].rastreadorImei || '00018E1B',
            ignicao: motos[idx].rastreadorIgnicao,
            bateriaRemovida: !!motos[idx].rastreadorBateriaRemovida,
            lat: motos[idx].rastreadorLat,
            lng: motos[idx].rastreadorLng
        })
    }).catch(() => {});

    atualizarHudTelemetriaAoVivo(motos[idx], motos[idx].rastreadorEndereco || '');
    updateViews();
}

function alternarAlertaCaboBateriaMoto() {
    const motoId = document.getElementById('rast-moto-id')?.value;
    if (!motoId) return;
    let motos = getDb('crm_motos');
    const idx = motos.findIndex(m => m.id === motoId);
    if (idx === -1) return;

    motos[idx].rastreadorBateriaRemovida = !motos[idx].rastreadorBateriaRemovida;
    motos[idx].rastreadorUltimaSync = new Date().toISOString();
    saveDb('crm_motos', motos);

    fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: motos[idx].rastreadorImei || '00018E1B',
            ignicao: !!motos[idx].rastreadorIgnicao,
            bateriaRemovida: motos[idx].rastreadorBateriaRemovida,
            lat: motos[idx].rastreadorLat,
            lng: motos[idx].rastreadorLng
        })
    }).catch(() => {});

    atualizarHudTelemetriaAoVivo(motos[idx], motos[idx].rastreadorEndereco || '');
    updateViews();

    if (motos[idx].rastreadorBateriaRemovida) {
        alert(`🚨 ALERTA CRÍTICO DO RASTREADOR (ID: ${motos[idx].rastreadorImei}):\n\nFoi detectada a REMOÇÃO DO CABO DA BATERIA (Corte de Alimentação 12V) na moto ${motos[idx].modelo} (Placa: ${motos[idx].placa})!\n\nO rastreador ativou automaticamente a bateria interna de backup (3.7V) e disparou o alerta no painel.`);
    }
}

function restaurarCaboBateriaMoto() {
    const motoId = document.getElementById('rast-moto-id')?.value;
    if (!motoId) return;
    let motos = getDb('crm_motos');
    const idx = motos.findIndex(m => m.id === motoId);
    if (idx === -1) return;

    motos[idx].rastreadorBateriaRemovida = false;
    motos[idx].rastreadorUltimaSync = new Date().toISOString();
    saveDb('crm_motos', motos);

    fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: motos[idx].rastreadorImei || '00018E1B',
            ignicao: !!motos[idx].rastreadorIgnicao,
            bateriaRemovida: false,
            lat: motos[idx].rastreadorLat,
            lng: motos[idx].rastreadorLng
        })
    }).catch(() => {});

    atualizarHudTelemetriaAoVivo(motos[idx], motos[idx].rastreadorEndereco || '');
    updateViews();
}

function forcarLeituraAutonomaRastreador() {
    const motoId = document.getElementById('rast-moto-id')?.value;
    if (!motoId) return;
    sincronizarTelemetriaAutonomaMoto(motoId, false);
    usarGpsNavegadorParaMoto();
}

function centralizarMapaNaMoto() {
    if (window.rastLeafletMap && window.rastCurrentCoords) {
        window.rastLeafletMap.invalidateSize();
        window.rastLeafletMap.setView(window.rastCurrentCoords, 17, { animate: true });
    }
}

function alternarCamadaMapaRastreador() {
    if (!window.rastLeafletMap || !window.rastTileLayerStreet || !window.rastTileLayerSat) return;
    window.rastModoSatelite = !window.rastModoSatelite;
    if (window.rastModoSatelite) {
        window.rastLeafletMap.removeLayer(window.rastTileLayerStreet);
        window.rastTileLayerSat.addTo(window.rastLeafletMap);
    } else {
        window.rastLeafletMap.removeLayer(window.rastTileLayerSat);
        window.rastTileLayerStreet.addTo(window.rastLeafletMap);
    }
}

function usarGpsNavegadorParaMoto() {
    const motoId = document.getElementById('rast-moto-id')?.value;
    if (!motoId) return;
    if (!navigator.geolocation) {
        alert('Seu navegador não suporta geolocalização direta. Digite o endereço na barra de busca ou clique na rua no mapa.');
        return;
    }

    const endEl = document.getElementById('rast-endereco-atual');
    if (endEl) {
        endEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color:#38bdf8;"></i> Capturando sinal GPS atual do aparelho...`;
    }

    navigator.geolocation.getCurrentPosition(
        function(pos) {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const motos = getDb('crm_motos');
            const motoObj = motos.find(m => m.id === motoId);
            const { cliente } = motoObj ? getCondutorContratoAtivo(motoObj.id, getDb('crm_contratos'), getDb('crm_clientes')) : { cliente: null };

            if (motoObj) {
                colocarOuMoverPinoMotoNoMapa(motoObj, cliente, lat, lng, 17);
            }
            consultarEnderecoReversoNominatim(motoId, lat, lng);
        },
        function() {
            alert('Permissão de GPS negada ou indisponível. Digite o endereço (Rua, Bairro, Cidade) no campo acima ou clique na rua exata no mapa.');
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

function abrirPainelRastreadorMoto(motoId) {
    sincronizarDadosPadraoRastreadoresFrota();
    let motos = getDb('crm_motos');
    const mIdx = motos.findIndex(m => m.id === motoId);
    if (mIdx === -1) return;
    const moto = motos[mIdx];

    // Se a moto foi cadastrada com kmUltimaTroca = 0 e já tem um KM alto (ex: 26094 km), corrige a base automaticamente
    const cfg = getTrackerConfig();
    const intervalo = parseInt(cfg.intervaloOleo) || 1000;
    const limiteBloqueio = parseInt(cfg.limiteBloqueioOleo) || 1100;
    const semHistoricoPrevio = !moto.historicoOleo || moto.historicoOleo.length === 0;
    if ((!moto.kmUltimaTroca || parseInt(moto.kmUltimaTroca) === 0) && parseInt(moto.kmAtual) > limiteBloqueio && semHistoricoPrevio) {
        moto.kmUltimaTroca = parseInt(moto.kmAtual);
        moto.kmProximaTroca = moto.kmUltimaTroca + intervalo;
        motos[mIdx] = moto;
        saveDb('crm_motos', motos);
    }

    // Verifica se já deve aplicar o bloqueio de 1.100 km
    verificarEAplicarBloqueioAutomaticoPorKm(moto, true);

    const contratos = getDb('crm_contratos');
    const clientes = getDb('crm_clientes');
    const { contrato, cliente } = getCondutorContratoAtivo(moto.id, contratos, clientes);
    const oleo = getMotoOleoInfo(moto);
    const temRastreador = !!(moto.rastreadorImei && moto.rastreadorImei.trim() !== '');

    document.getElementById('rast-moto-id').value = moto.id;
    document.getElementById('modal-rastreador-title').innerHTML = temRastreador
        ? `<i class="fa-solid fa-satellite-dish" style="color:#38bdf8;"></i> App Xtrack & Bloqueador GPS: ${moto.modelo} (${moto.placa} • ${moto.cor || 'Preta'})`
        : `<i class="fa-solid fa-ban" style="color:#f59e0b;"></i> Sem Rastreador Instalado: ${moto.modelo} (${moto.placa})`;
    document.getElementById('rast-condutor').innerText = cliente ? `${cliente.nome} (${cliente.telefone})` : 'Sem condutor (Pátio)';
    if (document.getElementById('rast-vencimento')) {
        document.getElementById('rast-vencimento').innerText = contrato && contrato.dataProxVenc ? formatarDataBr(contrato.dataProxVenc) : 'Sem contrato ativo';
    }
    document.getElementById('rast-km-atual').innerText = `${oleo.kmAtual} km`;
    document.getElementById('rast-km-oleo').innerText = `${oleo.kmProximaTroca} km (${oleo.label})`;
    if (document.getElementById('rast-km-bloqueio-motor')) {
        document.getElementById('rast-km-bloqueio-motor').innerText = oleo.atingiuBloqueioKm
            ? `🛑 BLOQUEADO AOS ${oleo.kmBloqueioMotor} KM`
            : `${oleo.kmBloqueioMotor} km (Faltam ${Math.max(0, oleo.kmRestantesBloqueio)} km)`;
    }

    const sinalEl = document.getElementById('rast-status-sinal');
    if (sinalEl) {
        if (temRastreador) {
            sinalEl.innerText = `App Xtrack • ID: ${moto.rastreadorImei} (Online)`;
            sinalEl.style.color = 'var(--success)';
        } else {
            sinalEl.innerText = 'Sem Rastreador Instalado';
            sinalEl.style.color = '#64748b';
        }
    }

    const isBloq = temRastreador && moto.rastreadorBloqueado === true;
    const statusBloqEl = document.getElementById('rast-status-bloqueio');
    const btnBloq = document.getElementById('btn-toggle-bloqueio-moto');
    if (!temRastreador) {
        if (statusBloqEl) {
            statusBloqEl.innerText = 'Indisponível (Sem Rastreador)';
            statusBloqEl.style.color = '#64748b';
        }
        if (btnBloq) btnBloq.style.display = 'none';
    } else if (isBloq) {
        if (statusBloqEl) {
            statusBloqEl.innerText = moto.bloqueadoPorInadimplencia
                ? '🛑 BLOQUEADA (INADIMPLÊNCIA 18:00H • SÓ LIBERA PÓS-PIX)'
                : (moto.bloqueadoPorKmOleo ? '🛑 BLOQUEADA POR KM (1.100 KM ÓLEO)' : '🔒 BLOQUEADA VIA APP XTRACK');
            statusBloqEl.style.color = 'var(--danger)';
        }
        if (btnBloq) {
            btnBloq.style.display = 'inline-flex';
            btnBloq.innerHTML = moto.bloqueadoPorInadimplencia
                ? '<i class="fa-solid fa-qrcode"></i> Liberar Moto via Confirmação do PIX (Mercado Pago)'
                : '<i class="fa-solid fa-unlock"></i> Desbloquear Motocicleta via App Xtrack';
            btnBloq.className = 'btn btn-primary btn-sm';
        }
    } else {
        if (statusBloqEl) {
            statusBloqEl.innerText = '🔓 Desbloqueada (Operação Normal)';
            statusBloqEl.style.color = 'var(--success)';
        }
        if (btnBloq) {
            btnBloq.style.display = 'inline-flex';
            btnBloq.innerHTML = '<i class="fa-solid fa-lock"></i> Enviar Bloqueio Preventivo via App Xtrack (Cláusula 11ª)';
            btnBloq.className = 'btn btn-danger btn-sm';
        }
    }

    document.getElementById('rast-input-imei').value = moto.rastreadorImei || '';
    if (document.getElementById('rast-input-chip')) {
        document.getElementById('rast-input-chip').value = moto.rastreadorChip || '';
    }
    document.getElementById('rast-input-km').value = oleo.kmAtual;
    if (document.getElementById('rast-input-km-ultima')) {
        document.getElementById('rast-input-km-ultima').value = oleo.kmUltimaTroca;
    }
    if (document.getElementById('rast-input-km-bloqueio')) {
        document.getElementById('rast-input-km-bloqueio').value = oleo.kmBloqueioMotor;
    }

    const extLink = document.getElementById('rast-external-link');
    if (extLink) {
        extLink.href = moto.rastreadorLink || 'https://xtrack.com.br';
        extLink.style.display = 'inline-block';
    }

    const mapWrapperCard = document.getElementById('rast-map-wrapper-card');
    const semRastCard = document.getElementById('rast-sem-rastreador-card');
    const semRastMsg = document.getElementById('rast-sem-rastreador-msg');

    openModal('modal-rastreador');
    const modalBody = document.querySelector('#modal-rastreador .modal-body');
    if (modalBody) modalBody.scrollTop = 0;

    if (temRastreador) {
        if (semRastCard) semRastCard.style.display = 'none';
        if (mapWrapperCard) mapWrapperCard.style.display = 'block';
        inicializarOuAtualizarMapaVivoMoto(moto, cliente);
    } else {
        if (mapWrapperCard) mapWrapperCard.style.display = 'none';
        if (semRastCard) semRastCard.style.display = 'block';
        if (semRastMsg) {
            semRastMsg.innerHTML = `A motocicleta <strong>${moto.modelo} (Placa: ${moto.placa})</strong> ainda não possui rastreador instalado. Atualmente, apenas a moto de placa <strong>IPU2I57</strong> possui rastreador App Xtrack ativo na frota. Caso instale um rastreador nesta moto futuramente, preencha o ID e o ICCID abaixo.`;
        }
    }
}

function atualizarPreviewOleoNoRastreador() {
    const kmInput = document.getElementById('rast-input-km');
    const ultimaInput = document.getElementById('rast-input-km-ultima');
    const bloqInput = document.getElementById('rast-input-km-bloqueio');
    if (!kmInput || !ultimaInput) return;
    const cfg = getTrackerConfig();
    const limiteBloqueio = parseInt(cfg.limiteBloqueioOleo) || 1100;
    const novoKm = parseInt(kmInput.value) || 0;
    let ultimaAtual = parseInt(ultimaInput.value) || 0;
    // Se a base de última troca estava zerada, acompanha automaticamente o KM inicial da moto
    if (ultimaAtual === 0 && novoKm > 0) {
        ultimaInput.value = novoKm;
        ultimaAtual = novoKm;
    }
    if (bloqInput) {
        bloqInput.value = ultimaAtual + limiteBloqueio;
    }
}

function salvarTelemetriaRastreadorMoto() {
    const motoId = document.getElementById('rast-moto-id').value;
    const imei = document.getElementById('rast-input-imei').value.trim();
    const chipOperadora = document.getElementById('rast-input-chip') ? document.getElementById('rast-input-chip').value.trim() : '';
    const novoKm = parseInt(document.getElementById('rast-input-km').value) || 0;
    let kmUltimaInput = document.getElementById('rast-input-km-ultima')
        ? parseInt(document.getElementById('rast-input-km-ultima').value)
        : NaN;

    let motos = getDb('crm_motos');
    const idx = motos.findIndex(m => m.id === motoId);
    if (idx === -1) return;

    const cfg = getTrackerConfig();
    const intervalo = parseInt(cfg.intervaloOleo) || 1000;
    const semHistoricoPrevio = !motos[idx].historicoOleo || motos[idx].historicoOleo.length === 0;

    if ((isNaN(kmUltimaInput) || kmUltimaInput === 0) && novoKm > 0 && semHistoricoPrevio) {
        kmUltimaInput = novoKm;
    } else if (isNaN(kmUltimaInput)) {
        kmUltimaInput = parseInt(motos[idx].kmUltimaTroca) || 0;
    }

    motos[idx].rastreadorImei = imei;
    if (chipOperadora) {
        motos[idx].rastreadorChip = chipOperadora;
        motos[idx].rastreadorModelo = chipOperadora;
    }
    motos[idx].kmAtual = novoKm;
    motos[idx].kmUltimaTroca = kmUltimaInput;
    motos[idx].kmProximaTroca = kmUltimaInput + intervalo;
    motos[idx].rastreadorUltimaSync = new Date().toISOString();

    const bloqueouAutomatico = verificarEAplicarBloqueioAutomaticoPorKm(motos[idx], false);

    saveDb('crm_motos', motos);
    updateViews();
    abrirPainelRastreadorMoto(motoId);

    const oleo = getMotoOleoInfo(motos[idx]);
    if (bloqueouAutomatico || oleo.atingiuBloqueioKm) {
        alert(`🛑 BLOQUEIO AUTOMÁTICO DE PROTEÇÃO DO MOTOR ATIVADO (1.100 KM)!\n\nA moto ${motos[idx].modelo} (${motos[idx].placa}) atingiu ${novoKm} km (${oleo.kmRodadosCiclo} km rodados sem troca de óleo — limite de segurança: ${oleo.kmBloqueioMotor} km).\n\nO sistema enviou automaticamente o comando de BLOQUEIO para o rastreador/bloqueador App Xtrack para evitar que o motor funda!`);
    } else if (oleo.status === 'vencido') {
        alert(`🚨 ALERTA DE TROCA DE ÓLEO (1.000 KM):\nHodômetro sincronizado em ${novoKm} km! A moto ${motos[idx].modelo} atingiu o limite de troca de óleo (${oleo.kmProximaTroca} km).\n\n⚠️ ATENÇÃO: O bloqueio automático de proteção do motor ocorrerá aos ${oleo.kmBloqueioMotor} km (faltam ${Math.max(0, oleo.kmRestantesBloqueio)} km)!`);
    } else {
        alert(`✅ App Xtrack (${imei || 'M2M'}) e hodômetro GPS (${novoKm} km • Próx. troca: ${oleo.kmProximaTroca} km • Bloqueio proteção: ${oleo.kmBloqueioMotor} km) sincronizados com sucesso!`);
    }
}

function abrirModalPixDaMotoRastreador() {
    const motoId = document.getElementById('rast-moto-id')?.value;
    if (!motoId) return;
    const { contrato } = getCondutorContratoAtivo(motoId, getDb('crm_contratos'), getDb('crm_clientes'));
    if (contrato) {
        closeModal('modal-rastreador');
        abrirModalPixMercadoPago(contrato.id);
    } else {
        navegarParaView('pagamentos');
        closeModal('modal-rastreador');
    }
}

function alternarBloqueioRemotoMoto() {
    const motoId = document.getElementById('rast-moto-id').value;
    let motos = getDb('crm_motos');
    const idx = motos.findIndex(m => m.id === motoId);
    if (idx === -1) return;

    const cfg = getTrackerConfig();
    const vaiBloquear = !motos[idx].rastreadorBloqueado;

    // Se a moto está bloqueada por inadimplência das 18:00h, só permite liberar após confirmação do pagamento PIX!
    if (!vaiBloquear && motos[idx].bloqueadoPorInadimplencia === true) {
        if (confirm(`🛑 BLOQUEIO AUTOMÁTICO POR INADIMPLÊNCIA (REGRA DAS 18:00H):\n\nA motocicleta ${motos[idx].modelo} (${motos[idx].placa}) foi bloqueada automaticamente pelo sistema porque o aluguel da semana não foi pago até as 18:00h.\n\nPela regra de segurança, ela SÓ VOLTA A LIBERAR APÓS A CONFIRMAÇÃO DO PAGAMENTO DO PIX.\n\nDeseja abrir a cobrança PIX do Mercado Pago agora para verificar/confirmar o pagamento e desbloquear a moto automaticamente?`)) {
            abrirModalPixDaMotoRastreador();
        }
        return;
    }

    const msgConfirm = vaiBloquear
        ? `Confirmar envio de COMANDO DE BLOQUEIO REMOTO via App Xtrack para ${motos[idx].modelo} (${motos[idx].placa})?\n\nConforme Cláusula 10.3 e 11.3 do Contrato, certifique-se de que a motocicleta está em condição tecnicamente segura (parada).`
        : `Confirmar DESBLOQUEIO REMOTO via App Xtrack da motocicleta ${motos[idx].modelo} (${motos[idx].placa})?`;

    if (!confirm(msgConfirm)) return;

    motos[idx].rastreadorBloqueado = vaiBloquear;
    if (!vaiBloquear) {
        motos[idx].bloqueadoPorKmOleo = false;
        motos[idx].bloqueadoPorInadimplencia = false;
        motos[idx].motivoBloqueioAutomatico = '';
    }
    saveDb('crm_motos', motos);

    fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'command_block',
            id: motos[idx].rastreadorImei || '00018E1B',
            placa: motos[idx].placa,
            bloquear: vaiBloquear,
            motivo: vaiBloquear ? 'Bloqueio Remoto Manual (Painel CRM)' : 'Desbloqueio Remoto Manual',
            xtrackEmail: cfg.xtrackEmail || '',
            xtrackSenha: cfg.xtrackSenha || ''
        })
    }).catch(() => {});

    updateViews();
    abrirPainelRastreadorMoto(motoId);
}

function sincronizarTodosRastreadores() {
    sincronizarDadosPadraoRastreadoresFrota();
    const cfg = getTrackerConfig();
    const intervalo = parseInt(cfg.intervaloOleo) || 1000;
    const limiteBloqueio = parseInt(cfg.limiteBloqueioOleo) || 1100;
    const motos = getDb('crm_motos');
    let alertas = [];
    let comChip = [];

    motos.forEach(m => {
        if (m.rastreadorImei && m.rastreadorImei.trim() !== '') {
            m.rastreadorUltimaSync = new Date().toISOString();
            comChip.push(`${m.placa} (ID: ${m.rastreadorImei})`);
            sincronizarTelemetriaAutonomaMoto(m.id, true);
        }
        const semHistoricoPrevio = !m.historicoOleo || m.historicoOleo.length === 0;
        if ((!m.kmUltimaTroca || parseInt(m.kmUltimaTroca) === 0) && parseInt(m.kmAtual) > limiteBloqueio && semHistoricoPrevio) {
            m.kmUltimaTroca = parseInt(m.kmAtual);
            m.kmProximaTroca = m.kmUltimaTroca + intervalo;
        }
        verificarEAplicarBloqueioAutomaticoPorKm(m, false);
        const oleo = getMotoOleoInfo(m);
        if (oleo.atingiuBloqueioKm) {
            alertas.push(`• 🛑 ${m.modelo} (${m.placa}): ${oleo.kmAtual} km (${oleo.kmRodadosCiclo} km rodados) — BLOQUEIO AUTOMÁTICO DE MOTOR ATIVADO (1.100 KM)!`);
        } else if (oleo.status === 'vencido') {
            alertas.push(`• 🚨 ${m.modelo} (${m.placa}): ${oleo.kmAtual} km — TROCA DE ÓLEO VENCIDA! (Bloqueia em ${Math.max(0, oleo.kmRestantesBloqueio)} km)`);
        } else if (oleo.status === 'aviso') {
            alertas.push(`• ⚠️ ${m.modelo} (${m.placa}): Faltam ${oleo.kmRestantes} km para a troca de 1.000 km.`);
        }
    });

    saveDb('crm_motos', motos);
    updateViews();

    const resumoChips = comChip.length > 0
        ? `Motos com Rastreador App Xtrack (${comChip.length}): ${comChip.join(', ')}`
        : `Nenhuma moto com rastreador instalado.`;

    if (alertas.length > 0) {
        alert(`📶 Sincronização App Xtrack & Hodômetro GPS concluída!\n${resumoChips}\n\nAvisos de Manutenção & Proteção do Motor (1.000 / 1.100 km):\n` + alertas.join('\n'));
    } else {
        alert(`📶 Sincronização App Xtrack & Hodômetro GPS concluída!\n${resumoChips}\nCiclo de óleo (1.000 km) e proteção do motor (1.100 km) em dia.`);
    }
}

function salvarConfigRastreadorGlobal(e) {
    e.preventDefault();
    const cfg = {
        provedor: document.getElementById('cfg-gps-provedor').value || 'xtrack',
        url: document.getElementById('cfg-gps-url').value.trim(),
        token: document.getElementById('cfg-gps-token')?.value.trim() || '',
        xtrackEmail: document.getElementById('cfg-xtrack-email')?.value.trim() || '',
        xtrackSenha: document.getElementById('cfg-xtrack-senha')?.value || '',
        intervaloOleo: parseInt(document.getElementById('cfg-gps-intervalo-oleo').value) || 1000,
        avisoAntecipado: parseInt(document.getElementById('cfg-gps-aviso-antecipado').value) || 150,
        limiteBloqueioOleo: parseInt(document.getElementById('cfg-gps-limite-bloqueio-oleo')?.value) || 1100,
        autoKm: document.getElementById('cfg-gps-auto-km').checked,
        autoBloqueioOleo: document.getElementById('cfg-gps-auto-bloqueio-oleo') ? document.getElementById('cfg-gps-auto-bloqueio-oleo').checked : true
    };
    localStorage.setItem('crm_tracker_config', JSON.stringify(cfg));
    closeModal('modal-config-rastreador-global');
    sincronizarTodosRastreadores();
    updateViews();
}

// ==========================================
// MODULE: CONTRATOS
// ==========================================
function populateContratoSelects() {
    const selCliente = document.getElementById('cont-cliente');
    const selMoto = document.getElementById('cont-moto');
    if (!selCliente || !selMoto) return;

    const clientes = getDb('crm_clientes');
    const motos = getDb('crm_motos');
    const contratos = getDb('crm_contratos');

    selCliente.innerHTML = '<option value="">Selecione um cliente</option>';
    clientes.forEach(c => {
        selCliente.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
    });

    selMoto.innerHTML = '<option value="">Selecione uma moto</option>';
    motos.filter(m => m.status === 'disponivel').forEach(m => {
        selMoto.innerHTML += `<option value="${m.id}" data-valor="${m.valor}">${m.placa} - ${m.modelo}</option>`;
    });

    // Popular também os selects da Central do Contrato Padrão Gov.br
    const govSelCont = document.getElementById('gov-select-contrato');
    const govSelCli = document.getElementById('gov-select-cliente');
    const govSelMoto = document.getElementById('gov-select-moto');

    if (govSelCont) {
        const currentVal = govSelCont.value;
        govSelCont.innerHTML = '<option value="">-- Selecione um Contrato para preencher automaticamente --</option>';
        [...contratos].reverse().forEach(c => {
            const cli = clientes.find(x => x.id === c.clienteId) || { nome: 'Cliente' };
            const m = motos.find(x => x.id === c.motoId) || { placa: '-', modelo: 'Moto' };
            govSelCont.innerHTML += `<option value="${c.id}">${cli.nome} — ${m.modelo} (${m.placa}) [${c.status.toUpperCase()}]</option>`;
        });
        govSelCont.value = currentVal;
    }

    if (govSelCli) {
        const currentVal = govSelCli.value;
        govSelCli.innerHTML = '<option value="">-- Selecionar Cliente avulso --</option>';
        clientes.forEach(c => {
            govSelCli.innerHTML += `<option value="${c.id}">${c.nome} (${c.cpf || c.telefone})</option>`;
        });
        govSelCli.value = currentVal;
    }

    if (govSelMoto) {
        const currentVal = govSelMoto.value;
        govSelMoto.innerHTML = '<option value="">-- Selecionar Moto avulsa --</option>';
        motos.forEach(m => {
            govSelMoto.innerHTML += `<option value="${m.id}">${m.modelo} (${m.placa})</option>`;
        });
        govSelMoto.value = currentVal;
    }
}

document.getElementById('cont-moto')?.addEventListener('change', calculateDiariaDisplay);

function calculateDiariaDisplay() {
    const selMoto = document.getElementById('cont-moto');
    const display = document.getElementById('cont-diaria-display');
    const inputSemanal = document.getElementById('cont-valor-semanal');
    if (!selMoto || !display) return;

    if (selMoto.selectedIndex > 0) {
        const val = parseFloat(selMoto.options[selMoto.selectedIndex].getAttribute('data-valor')) || 0;
        display.innerText = `R$ ${val.toFixed(2)}`;
        if (inputSemanal && !inputSemanal.value) {
            inputSemanal.value = (val * 7).toFixed(2);
        }
    } else {
        display.innerText = 'R$ 0,00';
    }
}

document.getElementById('cont-inicio')?.addEventListener('change', function() {
    const inicioStr = this.value;
    const proxInput = document.getElementById('cont-prox-venc');
    if (inicioStr && proxInput && !document.getElementById('cont-id').value) {
        const vDate = new Date(inicioStr + 'T00:00:00');
        vDate.setDate(vDate.getDate() + 7);
        proxInput.value = vDate.toISOString().split('T')[0];
    }
});

document.getElementById('form-contrato')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const idObj = document.getElementById('cont-id').value;
    const contStatus = document.getElementById('cont-status').value;

    const motoId = document.getElementById('cont-moto').value;
    const clienteId = document.getElementById('cont-cliente').value;

    if (!motoId || !clienteId) {
        alert("Preencha cliente e moto.");
        return;
    }

    let dataInicioStr = document.getElementById('cont-inicio').value;
    let proxVencInput = document.getElementById('cont-prox-venc')?.value || '';

    if (dataInicioStr && !proxVencInput) {
        let vDate = new Date(dataInicioStr + 'T00:00:00');
        vDate.setDate(vDate.getDate() + 7);
        proxVencInput = vDate.toISOString().split('T')[0];
    }

    let motos = getDb('crm_motos');
    const motoObj = motos.find(m => m.id === motoId);
    const diariaVal = motoObj ? parseFloat(motoObj.valor || 0) : 0;
    const valorSemanal = document.getElementById('cont-valor-semanal')?.value || (diariaVal * 7).toFixed(2);
    const formaPagamento = document.getElementById('cont-forma-pagamento')?.value || 'PIX';

    let contratos = getDb('crm_contratos');
    const oldC = idObj ? contratos.find(c => c.id === idObj) : null;

    const contrato = {
        id: idObj || generateId(),
        clienteId: clienteId,
        motoId: motoId,
        inicio: dataInicioStr,
        fim: document.getElementById('cont-fim').value,
        dataProxVenc: proxVencInput || (oldC ? oldC.dataProxVenc : ''),
        caucao: document.getElementById('cont-caucao').value,
        valorSemanal: valorSemanal,
        diariaFechada: diariaVal,
        formaPagamento: formaPagamento,
        status: contStatus,
        dadosContratoGov: oldC ? oldC.dadosContratoGov : null
    };

    if (idObj) {
        contratos = contratos.map(c => c.id === idObj ? contrato : c);
    } else {
        contratos.push(contrato);
        let mIdx = motos.findIndex(m => m.id === motoId);
        if (mIdx > -1) motos[mIdx].status = 'alugada';
        saveDb('crm_motos', motos);
    }

    saveDb('crm_contratos', contratos);
    closeModal('modal-contrato');
    updateViews();

    // Já carrega automaticamente este contrato no Editor do Contrato Padrão Gov.br
    carregarContratoNoEditorGov(contrato.id);
});

function renderContratos() {
    const contratos = getDb('crm_contratos');
    const clientes = getDb('crm_clientes');
    const motos = getDb('crm_motos');
    const query = (document.getElementById('search-contrato')?.value || '').toLowerCase();

    const tbody = document.getElementById('table-contratos');
    if (!tbody) return;
    tbody.innerHTML = '';

    const reversed = [...contratos].reverse().filter(c => {
        const cli = clientes.find(x => x.id === c.clienteId) || { nome: '' };
        const moto = motos.find(x => x.id === c.motoId) || { placa: '', modelo: '' };
        return (cli.nome || '').toLowerCase().includes(query) ||
               (moto.placa || '').toLowerCase().includes(query) ||
               (moto.modelo || '').toLowerCase().includes(query);
    });

    reversed.forEach(c => {
        const cli = clientes.find(x => x.id === c.clienteId) || { nome: 'Removido' };
        const moto = motos.find(x => x.id === c.motoId) || { placa: 'Removida', modelo: '', valor: 0 };

        let badgeClass = c.status === 'ativo' ? 'badge-ativo' : 'badge-encerrado';
        const vInfo = getInfoVencimentoContrato(c);

        const tr = document.createElement('tr');
        const numWhats = cli.telefone ? cli.telefone.replace(/\D/g, '') : '';
        const btnWhats = numWhats ? `<a href="https://wa.me/55${numWhats}" target="_blank" title="Chamar no WhatsApp" style="margin-left:5px;"><i class="fa-brands fa-whatsapp" style="color:#25d366; font-size:1.1rem;"></i></a>` : '';

        const valSemanal = parseFloat(c.valorSemanal || (moto.valor * 7) || 0).toFixed(2);

        tr.innerHTML = `
            <td>
                <strong>${cli.nome}</strong><br>
                <span style="font-size:0.8rem; color:var(--text-muted);">${cli.telefone || 'S/N'} ${btnWhats}</span>
            </td>
            <td>${moto.modelo} <br><span style="font-size:0.75rem; color:var(--text-muted);">(${moto.placa})</span></td>
            <td>${formatarDataBr(c.inicio)}</td>
            <td>${c.status === 'ativo' ? vInfo.htmlBadge : '-'}</td>
            <td>
                R$ ${parseFloat(moto.valor || 0).toFixed(2)}/dia<br>
                <small style="color:var(--primary); font-weight:600;">R$ ${valSemanal}/sem</small>
            </td>
            <td><span class="badge ${badgeClass}">${c.status.toUpperCase()}</span></td>
            <td>
                <div style="display:flex; gap:5px; flex-wrap:wrap;">
                    ${c.status === 'ativo' ? `<button class="btn btn-secondary btn-sm" onclick="abrirEdicaoContrato('${c.id}')" title="Editar Contrato"><i class="fa-solid fa-pen"></i></button>` : ''}
                    ${c.status === 'ativo' ? `<button class="btn btn-success btn-sm" onclick="registrarPagamento('${c.id}')" title="Registrar Pagamento (+7 Dias)" style="background-color: var(--success); color: white;"><i class="fa-solid fa-sack-dollar"></i></button>` : ''}
                    <button class="btn btn-primary btn-sm" onclick="abrirContratoNoEditorGov('${c.id}')" title="Preencher Dados no Contrato Padrão & Assinatura Gov.br" style="background-color:#2563eb;">
                        <i class="fa-solid fa-file-signature"></i> Preencher / Gov.br
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="imprimirContrato('${c.id}')" title="Imprimir Contrato Padrão Completo" style="background-color: #475569; color: white;">
                        <i class="fa-solid fa-print"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function registrarPagamento(id) {
    abrirModalConfirmarPagamento(id);
}

function abrirEdicaoContrato(id) {
    openModal('modal-contrato');

    const c = getDb('crm_contratos').find(x => x.id === id);
    if (!c) return;

    const selCliente = document.getElementById('cont-cliente');
    const selMoto = document.getElementById('cont-moto');

    selCliente.innerHTML = '<option value="">Selecione um cliente</option>';
    getDb('crm_clientes').forEach(cli => {
        selCliente.innerHTML += `<option value="${cli.id}" ${cli.id === c.clienteId ? 'selected' : ''}>${cli.nome}</option>`;
    });

    selMoto.innerHTML = '<option value="">Selecione uma moto</option>';
    getDb('crm_motos').forEach(m => {
        if (m.status === 'disponivel' || m.id === c.motoId) {
            selMoto.innerHTML += `<option value="${m.id}" data-valor="${m.valor}" ${m.id === c.motoId ? 'selected' : ''}>${m.placa} - ${m.modelo}</option>`;
        }
    });

    document.getElementById('cont-id').value = c.id;
    document.getElementById('cont-inicio').value = c.inicio || '';
    document.getElementById('cont-fim').value = c.fim || '';
    if (document.getElementById('cont-prox-venc')) document.getElementById('cont-prox-venc').value = c.dataProxVenc || '';
    if (document.getElementById('cont-forma-pagamento')) document.getElementById('cont-forma-pagamento').value = c.formaPagamento || 'PIX';
    if (document.getElementById('cont-valor-semanal')) document.getElementById('cont-valor-semanal').value = c.valorSemanal || '';
    document.getElementById('cont-caucao').value = c.caucao || '';
    document.getElementById('cont-status').value = c.status;
    document.getElementById('cont-status').disabled = false;

    document.getElementById('btn-encerrar-contrato').style.display = 'block';

    calculateDiariaDisplay();
    selCliente.disabled = true;
    selMoto.disabled = true;
}

function encerrarContratoAtual() {
    if (!confirm("Encerrar contrato? A moto voltará a ficar disponível.")) return;

    const idObj = document.getElementById('cont-id').value;
    let contratos = getDb('crm_contratos');
    let motos = getDb('crm_motos');

    const cIdx = contratos.findIndex(c => c.id === idObj);
    if (cIdx > -1) {
        contratos[cIdx].status = 'encerrado';
        contratos[cIdx].fim = new Date().toISOString().split('T')[0];

        let mIdx = motos.findIndex(m => m.id === contratos[cIdx].motoId);
        if (mIdx > -1) {
            motos[mIdx].status = 'disponivel';
            saveDb('crm_motos', motos);
        }

        saveDb('crm_contratos', contratos);

        document.getElementById('cont-cliente').disabled = false;
        document.getElementById('cont-moto').disabled = false;

        closeModal('modal-contrato');
        updateViews();
    }
}

// =========================================================================
// CENTRAL DO CONTRATO PADRÃO (CONTRATO LOCAÇÃO DE MOTOCICLETA) & GOV.BR
// =========================================================================
function numeroParaExtensoPtBr(valor) {
    const num = Math.floor(parseFloat(String(valor).replace(',', '.')) || 0);
    if (num <= 0) return '';
    const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
    const dezADezenove = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

    function Trio(n) {
        if (n === 100) return 'cem';
        let str = [];
        const c = Math.floor(n / 100);
        const d = Math.floor((n % 100) / 10);
        const u = n % 10;
        if (c > 0) str.push(centenas[c]);
        if (d === 1) {
            str.push(dezADezenove[u]);
        } else {
            if (d > 1) str.push(dezenas[d]);
            if (u > 0) str.push(unidades[u]);
        }
        return str.join(' e ');
    }

    let partes = [];
    const milhares = Math.floor(num / 1000);
    const resto = num % 1000;
    if (milhares > 0) {
        partes.push(milhares === 1 ? 'mil' : `${Trio(milhares)} mil`);
    }
    if (resto > 0) {
        partes.push(Trio(resto));
    }
    return partes.join(' e ') + (num === 1 ? ' real' : ' reais');
}

function autoExtensoSemanal() {
    const val = document.getElementById('gov-fin-semanal')?.value || '';
    const ext = numeroParaExtensoPtBr(val);
    const target = document.getElementById('gov-fin-semanal-extenso');
    if (target && ext) target.value = ext;
}

function autoExtensoCaucao() {
    const val = document.getElementById('gov-fin-caucao')?.value || '';
    const ext = numeroParaExtensoPtBr(val);
    const target = document.getElementById('gov-fin-caucao-extenso');
    if (target && ext) target.value = ext;
}

function trocarAbaContratoGov(aba, btnEl) {
    document.querySelectorAll('.gov-tab-pane').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.contrato-tab-btn').forEach(b => b.classList.remove('active'));
    const pane = document.getElementById(`gov-tab-${aba}`);
    if (pane) pane.style.display = 'block';
    if (btnEl) btnEl.classList.add('active');
}

function focarEditorContratoPadrao() {
    navegarParaView('contratos');
    setTimeout(() => {
        const area = document.getElementById('area-contrato-padrao-gov');
        if (area) area.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

function abrirContratoNoEditorGov(contratoId) {
    navegarParaView('contratos');
    const sel = document.getElementById('gov-select-contrato');
    if (sel) sel.value = contratoId;
    carregarContratoNoEditorGov(contratoId);
    setTimeout(() => {
        const area = document.getElementById('area-contrato-padrao-gov');
        if (area) area.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
}

function carregarClienteNoEditorGov(clienteId) {
    const cli = getDb('crm_clientes').find(c => c.id === clienteId);
    if (!cli) return;
    document.getElementById('gov-locatario-nome').value = cli.nome || '';
    document.getElementById('gov-locatario-cpf').value = cli.cpf || '';
    document.getElementById('gov-locatario-rg').value = cli.rg || '';
    document.getElementById('gov-locatario-endereco').value = cli.endereco || '';
    document.getElementById('gov-locatario-tel').value = cli.telefone || '';
    document.getElementById('gov-locatario-cnh').value = cli.cnh || '';
    document.getElementById('gov-locatario-cnh-cat').value = cli.cnhCat || 'A';
    document.getElementById('gov-locatario-cnh-val').value = cli.cnhValidade ? formatarDataBr(cli.cnhValidade) : '';
    atualizarPreviewContratoGov();
}

function carregarMotoNoEditorGov(motoId) {
    const m = getDb('crm_motos').find(x => x.id === motoId);
    if (!m) return;
    document.getElementById('gov-moto-modelo').value = m.modelo || '';
    document.getElementById('gov-moto-ano').value = m.ano || '';
    document.getElementById('gov-moto-placa').value = m.placa || '';
    document.getElementById('gov-moto-renavam').value = m.renavam || '';
    document.getElementById('gov-moto-chassi').value = m.chassi || '';
    document.getElementById('gov-moto-cor').value = m.cor || '';
    document.getElementById('gov-moto-km').value = `${m.kmAtual || 0} km`;

    const semVal = ((parseFloat(m.valor) || 0) * 7).toFixed(2).replace('.', ',');
    if (!document.getElementById('gov-fin-semanal').value) {
        document.getElementById('gov-fin-semanal').value = semVal;
        autoExtensoSemanal();
    }
    atualizarPreviewContratoGov();
}

function carregarContratoNoEditorGov(contratoId) {
    if (!contratoId) {
        atualizarPreviewContratoGov();
        return;
    }
    const cont = getDb('crm_contratos').find(c => c.id === contratoId);
    if (!cont) return;

    if (document.getElementById('gov-select-cliente')) document.getElementById('gov-select-cliente').value = cont.clienteId || '';
    if (document.getElementById('gov-select-moto')) document.getElementById('gov-select-moto').value = cont.motoId || '';

    carregarClienteNoEditorGov(cont.clienteId);
    carregarMotoNoEditorGov(cont.motoId);

    const moto = getDb('crm_motos').find(x => x.id === cont.motoId);
    const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    let diaSemanaStr = 'Segunda-feira';
    if (cont.inicio) {
        const dt = new Date(cont.inicio + 'T00:00:00');
        if (!isNaN(dt.getTime())) diaSemanaStr = diasSemana[dt.getDay()];
    }

    document.getElementById('gov-prazo-inicio').value = formatarDataBr(cont.inicio);
    document.getElementById('gov-prazo-duracao').value = cont.fim
        ? `De ${formatarDataBr(cont.inicio)} até ${formatarDataBr(cont.fim)}`
        : 'Prazo indeterminado com renovação semanal automática';

    const valSemanal = cont.valorSemanal
        ? parseFloat(cont.valorSemanal).toFixed(2).replace('.', ',')
        : (moto ? ((parseFloat(moto.valor) || 0) * 7).toFixed(2).replace('.', ',') : '350,00');
    document.getElementById('gov-fin-semanal').value = valSemanal;
    autoExtensoSemanal();

    document.getElementById('gov-fin-dia-venc').value = diaSemanaStr;
    document.getElementById('gov-fin-forma-pag').value = cont.formaPagamento || 'PIX';

    const valCaucao = cont.caucao ? parseFloat(cont.caucao).toFixed(2).replace('.', ',') : '500,00';
    document.getElementById('gov-fin-caucao').value = valCaucao;
    autoExtensoCaucao();

    document.getElementById('gov-foro-data').value = formatarDataBr(cont.inicio || new Date().toISOString().split('T')[0]);

    // Se o contrato já tinha dados salvos customizados do editor Gov.br, restaura
    if (cont.dadosContratoGov) {
        const d = cont.dadosContratoGov;
        Object.keys(d).forEach(inputId => {
            const el = document.getElementById(inputId);
            if (el && d[inputId] !== undefined && d[inputId] !== '') {
                el.value = d[inputId];
            }
        });
    }

    atualizarPreviewContratoGov();
}

function coletarCamposEditorGov() {
    const ids = [
        'gov-locador-nome', 'gov-locador-cpf', 'gov-locador-rg', 'gov-locador-endereco', 'gov-locador-tel',
        'gov-locatario-nome', 'gov-locatario-cpf', 'gov-locatario-rg', 'gov-locatario-endereco', 'gov-locatario-tel',
        'gov-locatario-cnh', 'gov-locatario-cnh-cat', 'gov-locatario-cnh-val',
        'gov-moto-modelo', 'gov-moto-ano', 'gov-moto-placa', 'gov-moto-renavam', 'gov-moto-chassi', 'gov-moto-cor', 'gov-moto-km',
        'gov-prazo-inicio', 'gov-prazo-hora', 'gov-prazo-duracao',
        'gov-fin-semanal', 'gov-fin-semanal-extenso', 'gov-fin-dia-venc', 'gov-fin-hora-venc', 'gov-fin-forma-pag',
        'gov-fin-caucao', 'gov-fin-caucao-extenso', 'gov-multa-prazo-dias',
        'gov-foro-local', 'gov-foro-data', 'gov-test1-nome', 'gov-test1-cpf', 'gov-test2-nome', 'gov-test2-cpf',
        'gov-vist-combustivel', 'gov-vist-pneus', 'gov-vist-freios', 'gov-vist-farois', 'gov-vist-retrovisores',
        'gov-vist-carenagem', 'gov-vist-chaves', 'gov-vist-danos', 'gov-vist-fotos', 'gov-vist-obs',
        'gov-anexo2-pix', 'gov-anexo2-prazo-caucao', 'gov-anexo2-uso', 'gov-anexo2-outras'
    ];
    const map = {};
    ids.forEach(id => {
        map[id] = document.getElementById(id)?.value || '';
    });
    return map;
}

function salvarDadosEditorNoContrato() {
    const dados = coletarCamposEditorGov();
    const contId = document.getElementById('gov-select-contrato')?.value;
    const cliId = document.getElementById('gov-select-cliente')?.value;
    const motoId = document.getElementById('gov-select-moto')?.value;

    // Atualiza cliente se selecionado
    if (cliId) {
        let clientes = getDb('crm_clientes');
        const cIdx = clientes.findIndex(c => c.id === cliId);
        if (cIdx > -1) {
            clientes[cIdx].nome = dados['gov-locatario-nome'] || clientes[cIdx].nome;
            clientes[cIdx].cpf = dados['gov-locatario-cpf'] || clientes[cIdx].cpf;
            clientes[cIdx].rg = dados['gov-locatario-rg'] || clientes[cIdx].rg;
            clientes[cIdx].endereco = dados['gov-locatario-endereco'] || clientes[cIdx].endereco;
            clientes[cIdx].telefone = dados['gov-locatario-tel'] || clientes[cIdx].telefone;
            clientes[cIdx].cnh = dados['gov-locatario-cnh'] || clientes[cIdx].cnh;
            clientes[cIdx].cnhCat = dados['gov-locatario-cnh-cat'] || clientes[cIdx].cnhCat;
            saveDb('crm_clientes', clientes);
        }
    }

    // Atualiza moto se selecionada
    if (motoId) {
        let motos = getDb('crm_motos');
        const mIdx = motos.findIndex(m => m.id === motoId);
        if (mIdx > -1) {
            motos[mIdx].renavam = dados['gov-moto-renavam'] || motos[mIdx].renavam;
            motos[mIdx].chassi = dados['gov-moto-chassi'] || motos[mIdx].chassi;
            motos[mIdx].cor = dados['gov-moto-cor'] || motos[mIdx].cor;
            const kmNum = parseInt(String(dados['gov-moto-km']).replace(/\D/g, ''));
            if (!isNaN(kmNum) && kmNum > 0) motos[mIdx].kmAtual = kmNum;
            saveDb('crm_motos', motos);
        }
    }

    // Atualiza contrato se selecionado
    if (contId) {
        let contratos = getDb('crm_contratos');
        const kIdx = contratos.findIndex(c => c.id === contId);
        if (kIdx > -1) {
            contratos[kIdx].dadosContratoGov = dados;
            saveDb('crm_contratos', contratos);
        }
    }

    updateViews();
    alert('✅ Todos os dados preenchidos no Contrato Padrão foram salvos no sistema!');
}

function gerarHtmlContratoPadraoCompleto(d) {
    const v = (key, fallback = '________________________________________') => {
        const val = d[key] ? String(d[key]).trim() : '';
        return val ? `<strong>${val}</strong>` : fallback;
    };

    const fotosCheck = d['gov-vist-fotos'] === 'Não' ? '( ) Sim &nbsp; (X) Não' : '(X) Sim &nbsp; ( ) Não';

    return `
        <h2>CONTRATO PARTICULAR DE LOCAÇÃO DE MOTOCICLETA</h2>
        <div class="sub-header">LOCAÇÃO SEMANAL — CAUÇÃO — RESPONSABILIDADE POR DANOS, MULTAS, FURTO, ROUBO E PERDA TOTAL</div>
        <p>Pelo presente instrumento particular, as partes abaixo identificadas celebram o presente Contrato de Locação de Motocicleta, mediante as cláusulas e condições seguintes.</p>

        <h4>CLÁUSULA 1ª — IDENTIFICAÇÃO DAS PARTES</h4>
        <p><strong>1.1. LOCADOR — PROPRIETÁRIO OU RESPONSÁVEL PELA LOCAÇÃO</strong><br>
        Nome completo/Razão social: ${v('gov-locador-nome', 'Henrique Rocha Clavijo')}<br>
        CPF/CNPJ: ${v('gov-locador-cpf', '85221619091')}<br>
        RG: ${v('gov-locador-rg', '___________________________________________________________')}<br>
        Endereço completo: ${v('gov-locador-endereco', '_____________________________________________')}<br>
        Telefone/WhatsApp: ${v('gov-locador-tel', '_____________________________________________')}</p>

        <p><strong>1.2. LOCATÁRIO — RESPONSÁVEL PELA MOTOCICLETA</strong><br>
        Nome completo: ${v('gov-locatario-nome', '_________________________________________________')}<br>
        CPF: ${v('gov-locatario-cpf', '__________________________________________________________')}<br>
        RG: ${v('gov-locatario-rg', '___________________________________________________________')}<br>
        Endereço completo: ${v('gov-locatario-endereco', '_____________________________________________')}<br>
        Telefone/WhatsApp: ${v('gov-locatario-tel', '_____________________________________________')}<br>
        CNH nº: ${v('gov-locatario-cnh', '__________________________')} &nbsp;&nbsp; Categoria: ${v('gov-locatario-cnh-cat', '___________________')}<br>
        Validade da CNH: ${v('gov-locatario-cnh-val', '_______________________________________________')}</p>

        <h4>CLÁUSULA 2ª — IDENTIFICAÇÃO DA MOTOCICLETA</h4>
        <p>Marca/Modelo: ${v('gov-moto-modelo', '__________________________________________________')}<br>
        Ano de fabricação/modelo: ${v('gov-moto-ano', '_______________________________________')}<br>
        Placa: ${v('gov-moto-placa', '__________________________')} &nbsp;&nbsp; RENAVAM: ${v('gov-moto-renavam', '_____________________')}<br>
        Chassi: ${v('gov-moto-chassi', '________________________________________________________')}<br>
        Cor: ${v('gov-moto-cor', '__________________________________________________________')}<br>
        Quilometragem na entrega: ${v('gov-moto-km', '______________________________________')}</p>

        <h4>CLÁUSULA 3ª — OBJETO E PRAZO DA LOCAÇÃO</h4>
        <p>3.1. O LOCADOR entrega ao LOCATÁRIO a motocicleta identificada neste contrato para utilização durante o período contratado, mediante pagamento de aluguel semanal.</p>
        <p>3.2. Data e horário de início da locação: ${v('gov-prazo-inicio', '____/____/________')}, às ${v('gov-prazo-hora', '______')} horas.</p>
        <p>3.3. Prazo da locação: ${v('gov-prazo-duracao', '__________________________________________')}.</p>
        <p>3.4. A renovação poderá ocorrer mediante concordância entre as partes, inclusive por escrito ou por meio eletrônico que permita comprovar a manifestação de vontade.</p>
        <p>3.5. A motocicleta deverá ser utilizada de acordo com a legislação vigente, as condições deste contrato e a finalidade autorizada pelo LOCADOR.</p>
        <p>3.6. O LOCATÁRIO declara possuir habilitação válida e categoria compatível com a motocicleta.</p>

        <h4>CLÁUSULA 4ª — VALOR DO ALUGUEL, VENCIMENTO E CAUÇÃO</h4>
        <p>4.1. O valor do aluguel será de R$ ${v('gov-fin-semanal', '__________')} (${v('gov-fin-semanal-extenso', '________________________________')}), por semana.</p>
        <p>4.2. O vencimento ocorrerá toda ${v('gov-fin-dia-venc', '__________________')}, até as ${v('gov-fin-hora-venc', '______')} horas.</p>
        <p>4.3. Forma de pagamento: ${v('gov-fin-forma-pag', '_________________________________________')}.</p>
        <p>4.4. O valor da caução será de R$ ${v('gov-fin-caucao', '__________')} (${v('gov-fin-caucao-extenso', '__________________________')}), pago pelo LOCATÁRIO como garantia das obrigações contratuais.</p>
        <p>4.5. A caução poderá ser utilizada para compensar valores legitimamente devidos pelo LOCATÁRIO, incluindo aluguéis vencidos, multas atribuíveis ao período da locação, danos comprovados e despesas de reparação pelas quais seja responsável.</p>
        <p>4.6. Qualquer desconto deverá ser discriminado e justificado, com apresentação dos comprovantes disponíveis.</p>
        <p>4.7. A caução não substitui o pagamento semanal do aluguel e não poderá ser utilizada unilateralmente pelo LOCATÁRIO para quitar aluguéis sem autorização expressa do LOCADOR.</p>
        <p>4.8. Se os valores devidos ultrapassarem a caução, o LOCATÁRIO permanecerá responsável pelo saldo, na medida de sua responsabilidade legal e contratual.</p>

        <h4>CLÁUSULA 5ª — RESPONSABILIDADE POR BATIDAS, ACIDENTES E DANOS</h4>
        <p>5.1. Durante o período em que estiver na posse da motocicleta, o LOCATÁRIO será responsável pelos danos e prejuízos decorrentes de atos ou omissões que lhe sejam atribuíveis, incluindo colisões, quedas, tombamentos, mau uso, negligência, imprudência, imperícia ou descumprimento deste contrato.</p>
        <p>5.2. Quando comprovadamente responsável pelo evento, o LOCATÁRIO deverá ressarcir os prejuízos causados à motocicleta, incluindo peças, mão de obra, guincho, remoção e demais despesas necessárias e comprovadas.</p>
        <p>5.3. Caso o acidente envolva terceiros, o LOCATÁRIO deverá prestar as informações necessárias, comunicar imediatamente o LOCADOR e cooperar com os procedimentos policiais, administrativos e securitários aplicáveis.</p>
        <p>5.4. Em caso de acidente, o LOCATÁRIO deverá:<br>
        a) Comunicar imediatamente o LOCADOR;<br>
        b) Acionar os serviços de emergência quando necessário;<br>
        c) Registrar a ocorrência policial quando cabível;<br>
        d) Fotografar o local e os danos, sempre que possível e seguro;<br>
        e) Não abandonar a motocicleta;<br>
        f) Não autorizar reparos relevantes sem comunicar o LOCADOR, exceto medidas emergenciais necessárias à segurança.</p>
        <p>5.5. É proibido omitir ou esconder acidentes, quedas, danos, furtos, roubos ou outras ocorrências relevantes envolvendo a motocicleta.</p>
        <p>5.6. O LOCATÁRIO responderá pelos prejuízos que lhe sejam legalmente atribuíveis, inclusive os causados a terceiros, sem prejuízo dos direitos das pessoas envolvidas e das responsabilidades previstas em lei.</p>
        <p>5.7. A responsabilidade será apurada conforme as circunstâncias do evento, as provas disponíveis e a legislação aplicável, sem atribuição automática de culpa em qualquer acidente.</p>

        <h4>CLÁUSULA 6ª — FURTO, ROUBO, ACIDENTE GRAVE E PERDA TOTAL</h4>
        <p>6.1. Durante o período em que a motocicleta estiver sob a posse, guarda ou responsabilidade do LOCATÁRIO, este deverá zelar por sua conservação, segurança e utilização adequada, respondendo pelos prejuízos que lhe sejam legalmente atribuíveis.</p>
        <p>6.2. Em caso de furto, roubo, desaparecimento, acidente grave, incêndio ou qualquer evento que provoque danos graves ou perda total da motocicleta, o LOCATÁRIO deverá comunicar imediatamente o LOCADOR e as autoridades competentes, quando cabível, além de fornecer as informações e os documentos necessários à apuração do ocorrido.</p>
        <p>6.3. <strong>Quando for comprovada a responsabilidade do LOCATÁRIO pelo evento ou pelo agravamento do prejuízo, este deverá indenizar o LOCADOR pelos danos materiais efetivamente sofridos</strong>, incluindo custos de reparação, despesas necessárias à recuperação do veículo e o valor da motocicleta em caso de perda total ou impossibilidade de recuperação.</p>
        <p>6.4. Para fins de indenização por perda total, o valor será apurado considerando o valor de mercado da motocicleta imediatamente antes do evento, utilizando como referência a Tabela FIPE, quando aplicável, ou outra avaliação objetiva e documentada, levando em consideração o estado de conservação e as características do veículo.</p>
        <p>6.5. Nos casos de furto ou roubo, a responsabilidade financeira do LOCATÁRIO será apurada conforme as circunstâncias concretas, especialmente a existência de culpa, dolo, descumprimento das obrigações de segurança ou outras situações que, nos termos da legislação aplicável, justifiquem sua responsabilização.</p>
        <p>6.6. A simples ocorrência de furto ou roubo não implicará, por si só, responsabilidade automática e ilimitada do LOCATÁRIO. Quando houver responsabilidade legalmente atribuível ao LOCATÁRIO, a indenização poderá corresponder à totalidade do prejuízo comprovado, observados os critérios desta cláusula.</p>
        <p>6.7. Se o LOCADOR possuir seguro para a motocicleta, a indenização observará a cobertura contratada, a franquia aplicável e os valores efetivamente recebidos. Os valores de seguro recebidos para cobrir o mesmo prejuízo deverão ser considerados na apuração, evitando duplicidade de ressarcimento.</p>
        <p>6.8. O LOCATÁRIO responderá pelos valores não cobertos pelo seguro quando esses valores forem legalmente atribuíveis à sua conduta ou ao descumprimento contratual.</p>
        <p>6.9. O LOCATÁRIO não poderá abandonar a motocicleta após acidente, deixar de comunicar seu desaparecimento ou omitir informações relevantes sobre o ocorrido. Poderá responder pelos prejuízos adicionais comprovadamente decorrentes dessa conduta.</p>
        <p>6.10. A indenização prevista nesta cláusula não afasta a responsabilidade por aluguéis vencidos, multas atribuíveis ao LOCATÁRIO ou outras obrigações contratuais legítimas, desde que não haja cobrança duplicada do mesmo prejuízo.</p>
        <p>6.11. O pagamento da indenização deverá ocorrer mediante acordo escrito entre as partes ou conforme determinação judicial, quando necessária, podendo ser ajustado parcelamento por escrito.</p>
        <p>6.12. A caução poderá ser utilizada para abater parte dos valores efetivamente devidos, não limitando a indenização quando os prejuízos comprovados forem superiores ao seu montante.</p>

        <h4>CLÁUSULA 7ª — PROIBIÇÃO DE EMPRÉSTIMO, CESSÃO OU SUBLOCAÇÃO</h4>
        <p>7.1. A motocicleta será disponibilizada exclusivamente para uso do LOCATÁRIO identificado neste contrato.</p>
        <p>7.2. É expressamente proibido emprestar, ceder, transferir a posse ou sublocar a motocicleta a qualquer outra pessoa, gratuitamente ou mediante pagamento, sem autorização prévia e expressa por escrito do LOCADOR.</p>
        <p>7.3. O LOCATÁRIO não poderá permitir que terceiros conduzam a motocicleta, mesmo que sejam familiares, amigos, colegas de trabalho ou pessoas de sua confiança.</p>
        <p>7.4. O descumprimento desta cláusula constituirá infração contratual grave e poderá resultar na rescisão do contrato, na exigência de devolução da motocicleta e na cobrança dos prejuízos comprovadamente decorrentes da infração.</p>
        <p>7.5. Caso a entrega não ocorra voluntariamente, o LOCADOR poderá utilizar os meios legalmente permitidos para recuperar o veículo.</p>

        <h4>CLÁUSULA 8ª — MULTAS DE TRÂNSITO E RESPONSABILIDADE DO LOCATÁRIO</h4>
        <p>8.1. O LOCATÁRIO será responsável pelas infrações de trânsito decorrentes de sua conduta durante o período da locação, incluindo o pagamento das multas e dos encargos legalmente atribuíveis à sua responsabilidade.</p>
        <p>8.2. Caso uma multa referente ao período da locação seja encaminhada diretamente ao LOCADOR, este poderá solicitar o reembolso do valor devido pelo LOCATÁRIO, mediante apresentação da notificação ou de documentação comprobatória da infração.</p>
        <p>8.3. O LOCATÁRIO deverá fornecer os dados, assinar os formulários e apresentar os documentos necessários à identificação do condutor infrator, observados os prazos e procedimentos legais.</p>
        <p>8.4. A pontuação decorrente da infração deverá ser atribuída conforme a legislação de trânsito. Este contrato não autoriza compra, venda ou transferência irregular de pontos na CNH.</p>
        <p>8.5. <strong>Taxa administrativa por infração:</strong> quando uma infração praticada pelo LOCATÁRIO exigir providências administrativas do LOCADOR, as partes estabelecem uma taxa de referência de R$ 120,00 (cento e vinte reais) por ponto relacionado à infração, destinada a cobrir custos administrativos de tratamento da ocorrência, quando juridicamente admissível.</p>
        <p>8.6. A cobrança deverá observar os limites legais aplicáveis, a proporcionalidade, a transparência e a justificativa da despesa. Não representa compra ou transferência de pontuação, nem substitui o pagamento da multa ao órgão de trânsito. Se a cobrança integral não for juridicamente admissível, somente poderá ser exigido o valor permitido por lei.</p>
        <p>8.7. O LOCATÁRIO deverá pagar os valores devidos no prazo de ${v('gov-multa-prazo-dias', '______')} dias após receber a documentação e a solicitação de pagamento.</p>
        <p>8.8. O não pagamento de valores vencidos poderá caracterizar inadimplemento contratual, autorizando a cobrança do débito e, quando cabível, a rescisão e a solicitação de devolução da motocicleta, observados os procedimentos legais.</p>

        <h4>CLÁUSULA 9ª — RETENÇÃO DA CAUÇÃO POR ATÉ 40 DIAS PARA VERIFICAÇÃO DE MULTAS</h4>
        <p>9.1. O LOCATÁRIO declara estar ciente de que determinadas infrações cometidas durante a locação podem não estar disponíveis nos sistemas oficiais de trânsito no momento da devolução da motocicleta.</p>
        <p>9.2. Para permitir a conferência de possíveis multas ainda não identificadas, as partes estabelecem um período contratual de retenção preventiva da caução de <strong>até 40 (quarenta) dias corridos, contados da data da devolução da motocicleta</strong>.</p>
        <p>9.3. Durante esse período, o LOCADOR poderá manter retida a caução, no limite necessário à finalidade prevista nesta cláusula, para consultar os sistemas oficiais de trânsito e verificar a existência de infrações referentes ao período em que a motocicleta esteve sob responsabilidade do LOCATÁRIO.</p>
        <p>9.4. Se forem identificadas multas referentes ao período da locação e atribuíveis ao LOCATÁRIO, o LOCADOR poderá descontar da caução os valores legalmente devidos, mediante apresentação dos documentos disponíveis e demonstrativo dos descontos.</p>
        <p>9.5. Se não houver multas identificadas nem outros débitos pendentes que justifiquem legalmente a retenção, o valor integral da caução deverá ser devolvido após o período de verificação, em até 2 (dois) dias úteis para processamento da transferência.</p>
        <p>9.6. Se, ao término dos 40 dias, existir infração comprovadamente relacionada ao período da locação cuja notificação ou valor ainda esteja pendente, as partes poderão ajustar por escrito uma retenção proporcional e justificada, limitada ao montante razoavelmente necessário para cobrir o débito.</p>
        <p>9.7. A retenção não poderá ser indefinida nem exceder o valor justificável. O LOCADOR deverá apresentar as informações disponíveis que fundamentem a continuidade da retenção.</p>
        <p>9.8. O prazo de 40 dias é uma condição contratual de verificação, e não um prazo legal universal do DETRAN para lançamento ou aplicação de multas. A ausência de registro nesse período não garante que nenhuma multa possa ser comunicada posteriormente.</p>
        <p>9.9. Caso uma multa válida seja comunicada após a devolução da caução, o LOCATÁRIO continuará responsável pelos valores legalmente atribuíveis a infrações praticadas durante o período da locação, mediante comprovação e observância dos procedimentos legais aplicáveis.</p>

        <h4>CLÁUSULA 10ª — ATRASO NO ALUGUEL SEMANAL</h4>
        <p>10.1. O não pagamento do aluguel na data e no horário estabelecidos caracterizará atraso contratual.</p>
        <p>10.2. Em caso de atraso, o LOCADOR poderá notificar o LOCATÁRIO e, se houver dispositivo de bloqueio instalado e previamente informado, adotar o bloqueio remoto da motocicleta, desde que tecnicamente seguro e sem colocar o condutor ou terceiros em risco.</p>
        <p>10.3. O bloqueio nunca deverá interromper o funcionamento do motor durante a circulação da motocicleta ou em situação que possa causar acidente.</p>
        <p>10.4. <strong>Após 3 (três) dias consecutivos de atraso</strong>, o LOCADOR poderá rescindir o contrato por inadimplemento, exigir a devolução da motocicleta e iniciar os procedimentos legalmente permitidos para sua recuperação.</p>
        <p>10.5. A devolução deverá ser solicitada ao LOCATÁRIO, com indicação do local e das condições para entrega, respeitados os procedimentos legais aplicáveis.</p>
        <p>10.6. O LOCADOR poderá utilizar a caução para compensar aluguéis vencidos e demais valores legitimamente devidos, mediante demonstrativo dos descontos.</p>
        <p>10.7. O atraso não implica perda automática e integral da caução independentemente dos débitos existentes. A caução será aplicada aos valores efetivamente devidos, e eventual saldo remanescente deverá ser devolvido.</p>
        <p>10.8. Caso a motocicleta não seja devolvida voluntariamente, o LOCADOR poderá buscar as medidas extrajudiciais ou judiciais cabíveis, não sendo autorizada a apreensão forçada fora dos meios legais.</p>

        <h4>CLÁUSULA 11ª — BLOQUEIO E RASTREAMENTO DA MOTOCICLETA</h4>
        <p>11.1. O LOCATÁRIO declara estar ciente de que a motocicleta possui ou poderá possuir sistema de rastreamento e/ou bloqueio remoto, conforme informado pelo LOCADOR.</p>
        <p>11.2. O sistema será utilizado para proteção patrimonial, localização do veículo e cumprimento das condições contratuais, respeitados os direitos das partes e a legislação aplicável.</p>
        <p>11.3. O bloqueio remoto somente poderá ocorrer em condições tecnicamente seguras. É proibido desligar o motor durante a circulação ou executar qualquer comando que possa provocar acidente.</p>
        <p>11.4. O bloqueio não autoriza a retomada coercitiva do veículo, o ingresso não autorizado em imóvel ou qualquer outra medida que dependa de procedimento legal ou ordem judicial.</p>
        <p>11.5. O LOCATÁRIO não poderá remover, adulterar, danificar ou desativar deliberadamente o rastreador ou qualquer dispositivo de segurança instalado na motocicleta.</p>
        <p>11.6. A utilização do sistema deverá respeitar a finalidade informada, os direitos do LOCATÁRIO e as normas aplicáveis à proteção de dados pessoais.</p>

        <h4>CLÁUSULA 12ª — CONSERVAÇÃO, MANUTENÇÃO E USO ADEQUADO</h4>
        <p>12.1. O LOCATÁRIO declara receber a motocicleta nas condições descritas no termo de vistoria anexo a este contrato.</p>
        <p>12.2. O LOCATÁRIO deverá zelar pela motocicleta, utilizá-la de acordo com a legislação de trânsito e comunicar imediatamente qualquer falha mecânica, dano ou condição que possa comprometer a segurança.</p>
        <p>12.3. O desgaste natural decorrente do uso regular não será considerado dano imputável ao LOCATÁRIO.</p>
        <p>12.4. Os custos de reparação de danos causados por mau uso, negligência, acidente atribuível ao LOCATÁRIO ou descumprimento contratual serão de responsabilidade deste, mediante comprovação.</p>
        <p>12.5. As manutenções preventivas e os reparos decorrentes do desgaste normal, bem como os defeitos preexistentes não causados pelo LOCATÁRIO, serão tratados conforme a legislação aplicável e as condições acordadas entre as partes.</p>
        <p>12.6. O LOCATÁRIO não poderá realizar modificações permanentes na motocicleta sem autorização expressa do LOCADOR.</p>

        <h4>CLÁUSULA 13ª — DEVOLUÇÃO DA MOTOCICLETA</h4>
        <p>13.1. Ao término do contrato ou em caso de rescisão, o LOCATÁRIO deverá devolver a motocicleta, suas chaves e os acessórios entregues, no local combinado entre as partes.</p>
        <p>13.2. Será realizada vistoria de devolução, preferencialmente com registro fotográfico, para comparação com o estado do veículo na entrega.</p>
        <p>13.3. O LOCATÁRIO deverá informar eventuais danos, falhas ou ocorrências que tenham surgido durante o período da locação.</p>
        <p>13.4. A devolução da motocicleta não elimina a responsabilidade por obrigações referentes ao período da locação que venham a ser comprovadas posteriormente, respeitados os limites legais.</p>

        <h4>CLÁUSULA 14ª — DEVOLUÇÃO E UTILIZAÇÃO DA CAUÇÃO AO FINAL DO CONTRATO</h4>
        <p>14.1. Ao final da locação, a caução será utilizada para compensar débitos vencidos, multas atribuíveis ao LOCATÁRIO, danos comprovados e demais valores legitimamente devidos nos termos deste contrato.</p>
        <p>14.2. O LOCADOR apresentará demonstrativo dos descontos realizados e, quando aplicável, orçamentos, notas fiscais, recibos ou outros documentos que comprovem as despesas.</p>
        <p>14.3. Se não houver danos, débitos ou despesas pendentes, o valor integral da caução será devolvido, observada a retenção preventiva para verificação de multas prevista na Cláusula 9ª.</p>
        <p>14.4. Havendo descontos legítimos, o saldo remanescente será devolvido ao LOCATÁRIO no prazo previsto neste contrato, respeitado o período de verificação de multas e a necessidade de apuração de débitos efetivamente pendentes.</p>
        <p>14.5. Caso os prejuízos comprovados ultrapassem o valor da caução, o LOCATÁRIO deverá pagar a diferença na medida de sua responsabilidade legal e contratual.</p>
        <p>14.6. A caução não será automaticamente perdida em sua totalidade por qualquer irregularidade. A compensação deverá corresponder aos valores efetivamente devidos, observados os limites legais.</p>

        <h4>CLÁUSULA 15ª — RESCISÃO CONTRATUAL</h4>
        <p>15.1. O contrato poderá ser encerrado pelo término do prazo, por acordo entre as partes ou por descumprimento contratual que justifique a rescisão.</p>
        <p>15.2. Constituem hipóteses de rescisão, entre outras:<br>
        a) Atraso no aluguel conforme as condições da Cláusula 10ª;<br>
        b) Empréstimo, cessão ou sublocação não autorizados;<br>
        c) Utilização ilícita ou contrária à finalidade contratual;<br>
        d) Omissão deliberada de acidente ou dano relevante;<br>
        e) Adulteração de dispositivos de segurança;<br>
        f) Descumprimento grave das obrigações de conservação e utilização;<br>
        g) Falsidade de informações ou documentos relevantes para a contratação.</p>
        <p>15.3. Rescindido o contrato, o LOCATÁRIO deverá devolver a motocicleta, sem prejuízo da cobrança de aluguéis vencidos, danos comprovados e demais valores legalmente exigíveis.</p>
        <p>15.4. A retomada da motocicleta, quando não houver entrega voluntária, deverá ocorrer pelos meios legalmente permitidos, sem violência, ameaça, constrangimento ou exercício arbitrário das próprias razões.</p>
        <p>15.5. A rescisão não autoriza a apropriação automática de valores da caução além dos débitos e prejuízos efetivamente devidos.</p>

        <h4>CLÁUSULA 16ª — DECLARAÇÕES DO LOCATÁRIO</h4>
        <p>O LOCATÁRIO declara que:<br>
        a) Forneceu informações e documentos verdadeiros;<br>
        b) Possui CNH válida e categoria compatível com a motocicleta;<br>
        c) Leu e compreendeu as condições deste contrato;<br>
        d) Está ciente do valor do aluguel semanal, do vencimento e do valor da caução;<br>
        e) Compromete-se a não emprestar, ceder ou sublocar a motocicleta, nem permitir que terceiros a conduzam sem autorização expressa do LOCADOR;<br>
        f) Comunicará prontamente acidentes, roubos, furtos, multas e ocorrências relevantes;<br>
        g) Devolverá a motocicleta conforme as condições deste instrumento;<br>
        h) Está ciente das regras de verificação de multas e retenção preventiva da caução por até 40 dias, nos termos da Cláusula 9ª;<br>
        i) Está ciente de que a responsabilidade por furto, roubo, acidentes e perda total será apurada conforme a Cláusula 6ª e a legislação aplicável;<br>
        j) Está ciente de que o bloqueio remoto somente poderá ocorrer em condições seguras e conforme a legislação aplicável.</p>

        <h4>CLÁUSULA 17ª — DISPOSIÇÕES GERAIS</h4>
        <p>17.1. Qualquer alteração deste contrato deverá ser formalizada por escrito e aceita por ambas as partes.</p>
        <p>17.2. As comunicações contratuais poderão ser realizadas pelos telefones, endereços eletrônicos ou aplicativos de mensagens informados pelas partes, desde que seja possível comprovar seu envio e conteúdo.</p>
        <p>17.3. A eventual invalidade de uma cláusula não prejudicará as demais disposições válidas deste instrumento.</p>
        <p>17.4. O presente contrato poderá ser assinado fisicamente ou por meio eletrônico que permita identificar os signatários e demonstrar a integridade do documento.</p>
        <p>17.5. As partes declaram que tiveram oportunidade de ler o contrato, esclarecer dúvidas e guardar uma cópia assinada.</p>

        <h4>CLÁUSULA 18ª — FORO</h4>
        <p>18.1. As partes elegem o foro legalmente competente para resolver eventuais controvérsias decorrentes deste contrato, respeitadas as regras legais de competência e eventual legislação especial aplicável.</p>
        <p>E, por estarem de acordo, assinam o presente instrumento em duas vias de igual teor ou por meio eletrônico.</p>
        <p><strong>Local:</strong> ${v('gov-foro-local', '_________________________________________________')}<br>
        <strong>Data:</strong> ${v('gov-foro-data', '______/______/____________')}</p>

        <!-- ESPAÇO RESERVADO PARA ASSINATURA DIGITAL GOV.BR / ASSINATURAS DAS PARTES -->
        <div class="govbr-sign-grid">
            <div class="govbr-sign-box">
                <div class="govbr-sign-badge">ÁREA RESERVADA PARA ASSINATURA GOV.BR / FÍSICA</div>
                <div style="margin: 10px 0; font-size: 11px; color: #64748b;">Posicione o selo de Assinatura Eletrônica Gov.br aqui</div>
                <div style="border-top: 1px solid #1e293b; padding-top: 6px; font-size: 12px; text-align: left;">
                    <strong>LOCADOR</strong><br>
                    Nome: ${v('gov-locador-nome', 'Henrique Rocha Clavijo')}<br>
                    CPF/CNPJ: ${v('gov-locador-cpf', '85221619091')}<br>
                    Assinatura: _______________________________________________
                </div>
            </div>
            <div class="govbr-sign-box">
                <div class="govbr-sign-badge">ÁREA RESERVADA PARA ASSINATURA GOV.BR / FÍSICA</div>
                <div style="margin: 10px 0; font-size: 11px; color: #64748b;">Posicione o selo de Assinatura Eletrônica Gov.br aqui</div>
                <div style="border-top: 1px solid #1e293b; padding-top: 6px; font-size: 12px; text-align: left;">
                    <strong>LOCATÁRIO</strong><br>
                    Nome: ${v('gov-locatario-nome', '____________________________________________________')}<br>
                    CPF: ${v('gov-locatario-cpf', '_____________________________________________________')}<br>
                    Assinatura: _______________________________________________
                </div>
            </div>
        </div>

        <div class="govbr-sign-grid" style="margin-top:10px;">
            <div style="font-size:12px;">
                <strong>TESTEMUNHA 1</strong><br>
                Nome: ${v('gov-test1-nome', '____________________________________________________')}<br>
                CPF: ${v('gov-test1-cpf', '_____________________________________________________')}<br>
                Assinatura: _______________________________________________
            </div>
            <div style="font-size:12px;">
                <strong>TESTEMUNHA 2</strong><br>
                Nome: ${v('gov-test2-nome', '____________________________________________________')}<br>
                CPF: ${v('gov-test2-cpf', '_____________________________________________________')}<br>
                Assinatura: _______________________________________________
            </div>
        </div>

        <hr style="margin: 28px 0; border: none; border-top: 2px solid #94a3b8; page-break-before: always;">

        <h4>ANEXO I — TERMO DE ENTREGA E VISTORIA DA MOTOCICLETA</h4>
        <p>Placa: ${v('gov-moto-placa', '_____________________')}<br>
        Data e horário da entrega: ${v('gov-prazo-inicio', '____________')} às ${v('gov-prazo-hora', '______')} horas<br>
        Quilometragem: ${v('gov-moto-km', '____________________________________________')}<br>
        Nível de combustível: ${v('gov-vist-combustivel', '______________________________________')}<br>
        Pneus: ${v('gov-vist-pneus', '___________________________________________________')}<br>
        Freios: ${v('gov-vist-freios', '__________________________________________________')}<br>
        Faróis, lanternas e setas: ${v('gov-vist-farois', '__________________________________')}<br>
        Retrovisores: ${v('gov-vist-retrovisores', '_____________________________________________')}<br>
        Carroceria, carenagem e pintura: ${v('gov-vist-carenagem', '____________________________')}<br>
        Chaves e acessórios entregues: ${v('gov-vist-chaves', '______________________________')}<br>
        Danos preexistentes identificados: ${v('gov-vist-danos', '__________________________')}</p>
        <p>Registro fotográfico realizado: ${fotosCheck}<br>
        Observações adicionais: ${v('gov-vist-obs', '____________________________________')}</p>
        <p>Declaro que recebi a motocicleta nas condições registradas neste termo.</p>

        <div class="govbr-sign-grid">
            <div class="govbr-sign-box">
                <div class="govbr-sign-badge">ASSINATURA GOV.BR — ANEXO I (VISTORIA)</div>
                <div style="border-top: 1px solid #1e293b; padding-top: 6px; font-size: 12px;">
                    <strong>Assinatura do LOCADOR:</strong> ${v('gov-locador-nome', 'Henrique Rocha Clavijo')}
                </div>
            </div>
            <div class="govbr-sign-box">
                <div class="govbr-sign-badge">ASSINATURA GOV.BR — ANEXO I (VISTORIA)</div>
                <div style="border-top: 1px solid #1e293b; padding-top: 6px; font-size: 12px;">
                    <strong>Assinatura do LOCATÁRIO:</strong> ${v('gov-locatario-nome', '__________________________________')}
                </div>
            </div>
        </div>

        <hr style="margin: 24px 0; border: none; border-top: 1px solid #cbd5e1;">

        <h4>ANEXO II — CONDIÇÕES FINANCEIRAS</h4>
        <p>Valor do aluguel semanal: R$ ${v('gov-fin-semanal', '________________________________')} (${v('gov-fin-semanal-extenso', '____________________')})<br>
        Dia e horário do vencimento: Toda ${v('gov-fin-dia-venc', '________________')} até as ${v('gov-fin-hora-venc', '______')} horas<br>
        Valor da caução: R$ ${v('gov-fin-caucao', '________________________________________')}<br>
        Forma de pagamento: ${v('gov-fin-forma-pag', '______________________________________')}<br>
        Chave PIX ou dados para pagamento: ${v('gov-anexo2-pix', '_________________________')}<br>
        Prazo para devolução da caução após a conferência: ${v('gov-anexo2-prazo-caucao', '______________')}<br>
        Uso autorizado da motocicleta: ${v('gov-anexo2-uso', '______________________________')}<br>
        Outras condições acordadas: ${v('gov-anexo2-outras', '________________________________')}</p>

        <div class="govbr-sign-grid">
            <div class="govbr-sign-box">
                <div class="govbr-sign-badge">ASSINATURA GOV.BR — ANEXO II (FINANCEIRO)</div>
                <div style="border-top: 1px solid #1e293b; padding-top: 6px; font-size: 12px;">
                    <strong>Assinatura do LOCADOR:</strong> ${v('gov-locador-nome', 'Henrique Rocha Clavijo')}
                </div>
            </div>
            <div class="govbr-sign-box">
                <div class="govbr-sign-badge">ASSINATURA GOV.BR — ANEXO II (FINANCEIRO)</div>
                <div style="border-top: 1px solid #1e293b; padding-top: 6px; font-size: 12px;">
                    <strong>Assinatura do LOCATÁRIO:</strong> ${v('gov-locatario-nome', '__________________________________')}
                </div>
            </div>
        </div>
    `;
}

function atualizarPreviewContratoGov() {
    const previewEl = document.getElementById('contrato-padrao-preview');
    if (!previewEl) return;
    const dados = coletarCamposEditorGov();
    previewEl.innerHTML = gerarHtmlContratoPadraoCompleto(dados);
}

function baixarContratoPadraoPdfGov() {
    const previewEl = document.getElementById('contrato-padrao-preview');
    if (!previewEl) return;

    const nomeCli = (document.getElementById('gov-locatario-nome')?.value || 'Locatario')
        .trim()
        .replace(/\s+/g, '_');
    const placaMoto = (document.getElementById('gov-moto-placa')?.value || 'Moto').trim();

    if (typeof html2pdf === 'undefined') {
        imprimirContratoPadraoPreenchido();
        return;
    }

    // Clone para renderizar sem barra de rolagem interna
    const clone = document.createElement('div');
    clone.style.padding = '15px 25px';
    clone.style.fontFamily = 'Arial, sans-serif';
    clone.style.fontSize = '12.5px';
    clone.style.lineHeight = '1.5';
    clone.style.color = '#000';
    clone.style.background = '#fff';
    clone.innerHTML = previewEl.innerHTML;

    const opt = {
        margin: [12, 12, 12, 12],
        filename: `CONTRATO_LOCACAO_MOTOCICLETA_${nomeCli}_${placaMoto}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(opt).from(clone).save();
}

function imprimirContratoPadraoPreenchido() {
    const previewEl = document.getElementById('contrato-padrao-preview');
    if (!previewEl) return;
    const nomeCli = document.getElementById('gov-locatario-nome')?.value || 'Locatário';

    const printHtml = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>CONTRATO LOCAÇÃO DE MOTOCICLETA - ${nomeCli}</title>
        <style>
            body { font-family: Arial, sans-serif; color: #000; line-height: 1.55; font-size: 13px; padding: 20px; margin: 0; }
            h2 { text-align: center; font-size: 16px; margin-bottom: 4px; text-transform: uppercase; }
            .sub-header { text-align: center; font-size: 13px; font-weight: bold; margin-bottom: 18px; }
            h4 { font-size: 13px; margin-top: 16px; margin-bottom: 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; text-transform: uppercase; }
            p { margin: 0 0 8px 0; text-align: justify; }
            .govbr-sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; margin-bottom: 14px; page-break-inside: avoid; }
            .govbr-sign-box { border: 1.5px dashed #1d4ed8; border-radius: 8px; padding: 12px; text-align: center; min-height: 105px; display: flex; flex-direction: column; justify-content: space-between; }
            .govbr-sign-badge { font-size: 10px; font-weight: bold; color: #1d4ed8; background: #dbeafe; padding: 3px 8px; border-radius: 12px; display: inline-block; margin: 0 auto 6px; }
            @media print {
                @page { margin: 1.6cm; }
                body { padding: 0; }
            }
        </style>
    </head>
    <body onload="window.print()">
        ${previewEl.innerHTML}
    </body>
    </html>`;

    const ptWindow = window.open('', '_blank');
    ptWindow.document.write(printHtml);
    ptWindow.document.close();
}

function imprimirContrato(contratoId) {
    carregarContratoNoEditorGov(contratoId);
    imprimirContratoPadraoPreenchido();
}

// ==========================================
// SEARCH LISTENERS & PERFIL ADMIN
// ==========================================
document.getElementById('search-cliente')?.addEventListener('input', renderClientes);
document.getElementById('search-moto')?.addEventListener('input', renderFrota);
document.getElementById('search-usuario')?.addEventListener('input', renderUsuarios);

function previewMyPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('meu-foto-preview').src = e.target.result;
        document.getElementById('meu-foto-base64').value = e.target.result;
    };
    reader.readAsDataURL(file);
}

function abrirMeuPerfil() {
    const sObj = JSON.parse(localStorage.getItem('crm_session'));
    if (!sObj) return;

    document.getElementById('meu-nome-display').innerText = sObj.nome;
    document.getElementById('meu-email-display').innerText = sObj.email;

    document.getElementById('meu-foto-base64').value = sObj.foto || '';
    document.getElementById('meu-foto-preview').src = sObj.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(sObj.nome)}&background=e2e8f0&color=94a3b8`;

    openModal('modal-meu-perfil');
}

document.getElementById('form-meu-perfil')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const newFoto = document.getElementById('meu-foto-base64').value;

    let sObj = JSON.parse(localStorage.getItem('crm_session'));
    if (sObj) {
        sObj.foto = newFoto;
        localStorage.setItem('crm_session', JSON.stringify(sObj));

        if (newFoto) {
            document.getElementById('logged-user-avatar').src = newFoto;
        }

        let admins = getDb('crm_admins');
        const idx = admins.findIndex(a => a.id === sObj.id);
        if (idx > -1) {
            admins[idx].foto = newFoto;
            saveDb('crm_admins', admins);
        }
    }

    closeModal('modal-meu-perfil');
    updateViews();
});

// ==========================================
// MODULE: USUARIOS (ADMINS)
// ==========================================
document.getElementById('form-usuario')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const idObj = document.getElementById('usr-id').value;
    const admin = {
        id: idObj || generateId(),
        nome: document.getElementById('usr-nome').value,
        email: document.getElementById('usr-email').value,
        senha: document.getElementById('usr-senha').value,
        role: document.getElementById('usr-nivel').value
    };

    let admins = getDb('crm_admins');

    if (idObj) {
        const oldAdmin = admins.find(a => a.id === idObj);
        if (oldAdmin) admin.foto = oldAdmin.foto;
        admins = admins.map(a => a.id === idObj ? admin : a);
    } else {
        if (admins.find(a => a.email === admin.email)) {
            alert('Este email já está em uso!');
            return;
        }
        admins.push(admin);
    }

    saveDb('crm_admins', admins);
    closeModal('modal-usuario');
    updateViews();
});

function renderUsuarios() {
    const admins = getDb('crm_admins');
    const query = document.getElementById('search-usuario') ? document.getElementById('search-usuario').value.toLowerCase() : '';
    const filtered = admins.filter(a => (a.nome || '').toLowerCase().includes(query) || (a.email || '').toLowerCase().includes(query));

    const tbody = document.getElementById('table-usuarios');
    if (!tbody) return;
    tbody.innerHTML = '';

    filtered.forEach(a => {
        const tr = document.createElement('tr');
        const userImg = a.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.nome)}&background=e2e8f0&color=94a3b8`;

        tr.innerHTML = `
            <td>
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${userImg}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
                    <span style="font-size:0.75rem; color:var(--text-muted);">#${a.id.substring(0, 4).toUpperCase()}</span>
                </div>
            </td>
            <td><strong>${a.nome}</strong></td>
            <td>${a.email}</td>
            <td><span class="badge ${a.role === 'admin' ? 'badge-disponivel' : 'badge-encerrado'}">${a.role === 'admin' ? 'Admin' : 'Funcionário'}</span></td>
            <td><span style="font-family: monospace;">••••••</span> <button class="btn btn-secondary btn-sm" onclick="alert('Senha: ${a.senha}')" title="Mostrar senha"><i class="fa-solid fa-eye"></i></button></td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="abrirEdicaoUsuario('${a.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger btn-sm" onclick="deletarUsuario('${a.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deletarUsuario(id) {
    let admins = getDb('crm_admins');
    if (admins.length <= 1) {
        alert('Você não pode deletar o único administrador do sistema!');
        return;
    }

    const currSession = JSON.parse(localStorage.getItem('crm_session'));
    if (currSession && currSession.id === id) {
        alert('Você não pode deletar a si mesmo enquanto estiver logado!');
        return;
    }

    if (!confirm("Excluir acesso deste administrador?")) return;

    admins = admins.filter(a => a.id !== id);
    localStorage.setItem('crm_admins', JSON.stringify(admins));
    if (!window.isFirebaseSyncing && window.db) { window.db.collection('crm_admins').doc(id).delete(); }
    updateViews();
}

function abrirEdicaoUsuario(id) {
    openModal('modal-usuario');

    const admin = getDb('crm_admins').find(a => a.id === id);
    if (!admin) return;

    document.getElementById('usr-id').value = admin.id;
    document.getElementById('usr-nome').value = admin.nome;
    document.getElementById('usr-email').value = admin.email;
    document.getElementById('usr-senha').value = admin.senha;
    document.getElementById('usr-nivel').value = admin.role || 'admin';

    document.getElementById('modal-usuario-title').innerText = 'Editar Usuário Admin';
}

// ==========================================
// CNH PREVIEW & FOTO LIGHTBOX CRM
// ==========================================
function previewCnhPhoto(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('cli-cnh-base64').value = e.target.result;
            const preview = document.getElementById('cli-cnh-preview');
            preview.src = e.target.result;
            preview.style.display = 'block';
            document.getElementById('btn-remover-foto-cnh').style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
    }
}

function removerFotoCnh() {
    document.getElementById('cli-foto-cnh').value = '';
    document.getElementById('cli-cnh-base64').value = '';
    document.getElementById('cli-cnh-preview').src = '';
    document.getElementById('cli-cnh-preview').style.display = 'none';
    document.getElementById('btn-remover-foto-cnh').style.display = 'none';
}

function verFotoMotoCrm(motoId) {
    const moto = getDb('crm_motos').find(m => m.id === motoId);
    if (!moto || !moto.foto) return;
    let modal = document.getElementById('modal-foto-crm');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-foto-crm';
        modal.className = 'modal';
        modal.onclick = function(e) { if (e.target === modal) modal.classList.remove('show'); };
        modal.innerHTML = `
            <div class="modal-content" style="max-width:850px; background:#0F172A; color:#fff; border:1px solid rgba(255,255,255,0.12); padding:16px; text-align:center;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <strong id="modal-foto-crm-titulo" style="font-size:1.05rem;">Foto da Moto</strong>
                    <span class="close-btn" style="color:#fff;" onclick="document.getElementById('modal-foto-crm').classList.remove('show')">&times;</span>
                </div>
                <img id="modal-foto-crm-img" src="" style="max-width:100%; max-height:78vh; object-fit:contain; border-radius:8px;">
            </div>
        `;
        document.body.appendChild(modal);
    }
    document.getElementById('modal-foto-crm-titulo').innerText = `${moto.modelo} (${moto.placa})`;
    document.getElementById('modal-foto-crm-img').src = moto.foto;
    modal.classList.add('show');
}

// =========================================================================
// MODULE: PAGAMENTOS SEMANAIS, API MERCADO PAGO PIX, RÉGUA 08H E BLOQUEIO 18H
// =========================================================================

// Gerador EMV BRCode PIX Local Instantâneo (compatível com Mercado Pago e qualquer banco)
function crc16CcittPixLocal(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
        crc ^= (str.charCodeAt(i) << 8);
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
            else crc = (crc << 1) & 0xFFFF;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function emvTagLocal(id, val) {
    const s = String(val || '');
    return `${id}${s.length.toString().padStart(2, '0')}${s}`;
}

function gerarCodigoPixBrCodeLocal(valor, motoPlaca, vencimento) {
    const cfgMp = getMercadoPagoConfig();
    const chave = String(cfgMp.chavePix || '85221619091').trim();
    const benef = String(cfgMp.beneficiario || 'HENRIQUE ROCHA CLAVIJO')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().substring(0, 25);
    const txid = `FM${String(motoPlaca || 'MOTO').replace(/[^A-Z0-9]/gi, '')}${String(vencimento || '').replace(/\D/g, '')}`.substring(0, 25) || 'FACILITAMOTO';
    const valStr = (parseFloat(valor) || 0).toFixed(2);

    const gui = emvTagLocal('00', 'br.gov.bcb.pix');
    const keyTag = emvTagLocal('01', chave);
    const descTag = emvTagLocal('02', `ALUGUEL ${motoPlaca || ''}`.trim().substring(0, 20));
    const merchantAcc = emvTagLocal('26', `${gui}${keyTag}${descTag}`);

    const semCrc =
        emvTagLocal('00', '01') +
        emvTagLocal('01', '12') +
        merchantAcc +
        emvTagLocal('52', '0000') +
        emvTagLocal('53', '986') +
        (parseFloat(valStr) > 0 ? emvTagLocal('54', valStr) : '') +
        emvTagLocal('58', 'BR') +
        emvTagLocal('59', benef) +
        emvTagLocal('60', 'PORTO ALEGRE') +
        emvTagLocal('62', emvTagLocal('05', txid)) +
        '6304';

    return `${semCrc}${crc16CcittPixLocal(semCrc)}`;
}

function garantirCobrancaPixLocalNoContrato(contrato, cliente, moto) {
    if (!contrato) return null;
    const valSemanal = parseFloat(contrato.valorSemanal || (parseFloat(moto?.valor || 0) * 7) || 350).toFixed(2);
    const vencRef = contrato.dataProxVenc || new Date().toISOString().split('T')[0];
    const cfgMp = getMercadoPagoConfig();

    if (contrato.pixCobrancaAtual &&
        contrato.pixCobrancaAtual.vencimento === vencRef &&
        parseFloat(contrato.pixCobrancaAtual.valor).toFixed(2) === valSemanal &&
        contrato.pixCobrancaAtual.copiaECola) {
        return contrato.pixCobrancaAtual;
    }

    const copiaECola = gerarCodigoPixBrCodeLocal(valSemanal, moto?.placa || 'MOTO', vencRef);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(copiaECola)}`;
    const cobranca = {
        paymentId: `MP-${contrato.id.substring(0, 4).toUpperCase()}-${vencRef.replace(/\D/g, '')}`,
        contratoId: contrato.id,
        clienteNome: cliente?.nome || 'Locatário',
        motoPlaca: moto?.placa || '-',
        motoModelo: moto?.modelo || 'Moto',
        valor: parseFloat(valSemanal),
        vencimento: vencRef,
        copiaECola,
        qrCodeUrl,
        status: 'pending',
        provider: 'mercadopago_pix',
        createdAt: new Date().toISOString()
    };
    contrato.pixCobrancaAtual = cobranca;

    // Se houver token oficial do Mercado Pago, dispara a geração do PIX oficial dinâmico imediatamente
    if (cfgMp.accessToken && cfgMp.accessToken.trim().length > 15) {
        setTimeout(() => sincronizarCobrancaPixComServidorMp(contrato.id), 50);
    }

    return cobranca;
}

function montarTextoNotificacao08hUsuario(contrato, cliente, moto) {
    const cfgMp = getMercadoPagoConfig();
    const horaBloq = cfgMp.horaBloqueio || '18:00';
    const valSemanal = parseFloat(contrato.valorSemanal || (parseFloat(moto.valor || 0) * 7) || 0).toFixed(2);
    const cob = garantirCobrancaPixLocalNoContrato(contrato, cliente, moto);
    const dataVencBr = formatarDataBr(contrato.dataProxVenc);

    return `☀️ *AVISO DE VENCIMENTO SEMANAL (08:00H) — FACILITA MOTO*\n\n` +
           `Olá, *${cliente.nome}*! Tudo bem?\n` +
           `Lembramos que hoje (*${dataVencBr}*) é o dia do pagamento semanal da sua motocicleta *${moto.modelo} (Placa: ${moto.placa})*.\n\n` +
           `💰 *Valor Semanal:* R$ ${valSemanal}\n` +
           `⏰ *Horário Limite:* Até as *${horaBloq}h* de hoje\n\n` +
           `⚠️ *AVISO DE BLOQUEIO AUTOMÁTICO:* Caso o pagamento não seja confirmado pelo sistema até as *${horaBloq}h*, a motocicleta será *BLOQUEADA AUTOMATICAMENTE* pelo rastreador/bloqueador e *só voltará a liberar após a confirmação automática do pagamento PIX*.\n\n` +
           `💠 *PIX COPIA E COLA (MERCADO PAGO):*\n` +
           `${cob.copiaECola}\n\n` +
           `Assim que realizar o pagamento, o sistema reconhecerá automaticamente e manterá sua moto liberada!`;
}

function montarTextoNotificacaoBloqueio18hUsuario(contrato, cliente, moto) {
    const cfgMp = getMercadoPagoConfig();
    const horaBloq = cfgMp.horaBloqueio || '18:00';
    const valSemanal = parseFloat(contrato.valorSemanal || (parseFloat(moto.valor || 0) * 7) || 0).toFixed(2);
    const cob = garantirCobrancaPixLocalNoContrato(contrato, cliente, moto);
    const dataVencBr = formatarDataBr(contrato.dataProxVenc);

    return `🛑 *BLOQUEIO AUTOMÁTICO POR FALTA DE PAGAMENTO (${horaBloq}H) — FACILITA MOTO*\n\n` +
           `Olá, *${cliente.nome}*.\n` +
           `Como o pagamento semanal da motocicleta *${moto.modelo} (Placa: ${moto.placa})*, vencido em *${dataVencBr}* no valor de *R$ ${valSemanal}*, não foi confirmado até as *${horaBloq}h*, o sistema enviou automaticamente o *COMANDO DE BLOQUEIO* para o bloqueador da motocicleta.\n\n` +
           `🔓 *COMO DESBLOQUEAR AUTOMATICAMENTE:*\n` +
           `A motocicleta só voltará a ser liberada após a confirmação do pagamento do PIX abaixo pelo sistema do Mercado Pago:\n\n` +
           `💠 *PIX COPIA E COLA (MERCADO PAGO):*\n` +
           `${cob.copiaECola}`;
}

function montarTextoNotificacaoOleoIndividualUsuario(moto, cliente) {
    const oleo = getMotoOleoInfo(moto);
    const nomeCli = cliente ? cliente.nome : 'Condutor';
    if (oleo.atingiuBloqueioKm || moto.bloqueadoPorKmOleo) {
        return `🛑 *BLOQUEIO AUTOMÁTICO DE PROTEÇÃO DO MOTOR (1.100 KM) — FACILITA MOTO*\n\n` +
               `Olá, *${nomeCli}*!\n` +
               `O GPS/Hodômetro da sua moto *${moto.modelo} (Placa: ${moto.placa})* registrou *${oleo.kmAtual} km* (*${oleo.kmRodadosCiclo} km rodados* sem troca de óleo, atingindo o limite máximo de segurança de *${oleo.kmBloqueioMotor} km*).\n\n` +
               `Para evitar que o motor funda, o sistema enviou o *BLOQUEIO AUTOMÁTICO* para o rastreador da moto. Compareça imediatamente para realizar a troca de óleo e desbloquear a motocicleta!`;
    }
    return `🛢️ *NOTIFICAÇÃO INDIVIDUAL DE TROCA DE ÓLEO (1.000 KM) — FACILITA MOTO*\n\n` +
           `Olá, *${nomeCli}*! Tudo bem?\n` +
           `O sistema da FACILITA MOTO identificou pelo hodômetro/GPS que a sua motocicleta *${moto.modelo} (Placa: ${moto.placa})* está com *${oleo.kmAtual} km*.\n\n` +
           `📌 *Troca de Óleo Obrigatória:* Aos *${oleo.kmProximaTroca} km* (ciclo de 1.000 km)\n` +
           `🛑 *Bloqueio Automático de Proteção do Motor:* Aos *${oleo.kmBloqueioMotor} km* (1.100 km rodados)\n\n` +
           `⚠️ *Importante:* Realize a troca de óleo no prazo para evitar o bloqueio automático da motocicleta pelo rastreador!`;
}

function renderPagamentosView() {
    const contratos = getDb('crm_contratos');
    const clientes = getDb('crm_clientes');
    const motos = getDb('crm_motos');
    const pagamentos = getDb('crm_pagamentos');
    const cfgMp = getMercadoPagoConfig();

    const tbodyAtivos = document.getElementById('table-pagamentos-ativos');
    const tbodyHist = document.getElementById('table-historico-pagamentos');
    const tbodyNotifInd = document.getElementById('table-notificacoes-individuais');
    if (!tbodyAtivos || !tbodyHist) return;

    const query = (document.getElementById('search-pagamentos')?.value || '').toLowerCase();

    // Atualiza texto de resumo da Régua Mercado Pago
    const resumoReguaEl = document.getElementById('mp-regua-resumo-status');
    if (resumoReguaEl) {
        const horaAgora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        resumoReguaEl.innerHTML = `
            Relógio do Sistema: <strong>${horaAgora}</strong> •
            ☀️ Notificação Automática no dia do pagamento às <strong>${cfgMp.horaNotificacao || '08:00'}h</strong> •
            🛑 Bloqueio Automático no bloqueador da moto às <strong>${cfgMp.horaBloqueio || '18:00'}h</strong> se não pago •
            🔓 Liberação Automática imediata após confirmação do PIX (API Oficial Mercado Pago — QR Code Dinâmico).
        `;
    }

    // 1. KPIs Financeiros e de Vencimento
    const totalRecebidoHist = pagamentos.reduce((acc, p) => acc + (parseFloat(p.valor) || 0), 0);
    let receitaSemanalAtiva = 0;
    let countEmDia = 0;
    let countVencendo = 0;
    let countAtrasados = 0;
    let countMotosBloqueadasInadimplencia = 0;

    const contratosAtivos = contratos.filter(c => c.status === 'ativo');
    contratosAtivos.forEach(c => {
        const moto = motos.find(m => m.id === c.motoId) || { valor: 0 };
        if (moto.bloqueadoPorInadimplencia) countMotosBloqueadasInadimplencia++;
        const valSem = parseFloat(c.valorSemanal || (parseFloat(moto.valor || 0) * 7) || 0);
        receitaSemanalAtiva += valSem;

        const vInfo = getInfoVencimentoContrato(c);
        if (vInfo.diffDays !== null) {
            if (vInfo.diffDays < 0) countAtrasados++;
            else if (vInfo.diffDays <= 2) countVencendo++;
            else countEmDia++;
        } else {
            countEmDia++;
        }
    });

    if (document.getElementById('pag-kpi-recebido')) {
        document.getElementById('pag-kpi-recebido').innerText = `R$ ${totalRecebidoHist.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (document.getElementById('pag-kpi-semanal')) {
        document.getElementById('pag-kpi-semanal').innerText = `R$ ${receitaSemanalAtiva.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (document.getElementById('pag-kpi-emdia')) document.getElementById('pag-kpi-emdia').innerText = countEmDia;
    if (document.getElementById('pag-kpi-vencendo')) document.getElementById('pag-kpi-vencendo').innerText = countVencendo;
    if (document.getElementById('pag-kpi-atrasados')) document.getElementById('pag-kpi-atrasados').innerText = countAtrasados;

    const navBadgePag = document.getElementById('nav-badge-pagamentos');
    if (navBadgePag) {
        const totalPendentes = countAtrasados + countVencendo;
        if (totalPendentes > 0) {
            navBadgePag.style.display = 'inline-block';
            navBadgePag.innerText = totalPendentes;
            navBadgePag.style.background = countAtrasados > 0 ? '#ef4444' : '#f59e0b';
        } else {
            navBadgePag.style.display = 'none';
        }
    }

    const alertBox = document.getElementById('pagamentos-alert-box');
    if (alertBox) {
        if (countAtrasados > 0 || countVencendo > 0 || countMotosBloqueadasInadimplencia > 0) {
            alertBox.innerHTML = `
                <div class="alert-banner-oleo ${countAtrasados > 0 || countMotosBloqueadasInadimplencia > 0 ? '' : 'warning-only'}" style="margin-bottom:20px;">
                    <div>
                        <strong style="font-size:0.95rem; display:block; color:#111827;">
                            <i class="fa-solid fa-bell"></i> Régua Automática 08:00h / 18:00h (Mercado Pago PIX):
                            ${countAtrasados} aluguel(is) em atraso ${countMotosBloqueadasInadimplencia > 0 ? `• 🛑 ${countMotosBloqueadasInadimplencia} MOTO(S) BLOQUEADA(S) AUTOMATICAMENTE POR FALTA DE PIX ATÉ AS 18:00H` : ''} e ${countVencendo} vencendo hoje / nos próximos 2 dias!
                        </strong>
                        <span style="font-size:0.82rem; color:#4b5563;">
                            Clique em <strong>"PIX Mercado Pago"</strong> para gerar/enviar o QR Code e código PIX Copia e Cola ao usuário, ou confirmar o PIX para <strong>desbloquear a moto automaticamente</strong> e avançar +7 dias.
                        </span>
                    </div>
                </div>
            `;
        } else {
            alertBox.innerHTML = '';
        }
    }

    // 2. Tabela de Pagamentos Semanais Ativos + PIX Mercado Pago + Bloqueio 18h
    tbodyAtivos.innerHTML = '';
    const filtrados = contratosAtivos.filter(c => {
        const cli = clientes.find(x => x.id === c.clienteId) || { nome: '' };
        const moto = motos.find(x => x.id === c.motoId) || { placa: '', modelo: '' };
        return (cli.nome || '').toLowerCase().includes(query) ||
               (moto.placa || '').toLowerCase().includes(query) ||
               (moto.modelo || '').toLowerCase().includes(query);
    });

    if (filtrados.length === 0) {
        tbodyAtivos.innerHTML = `<tr><td colspan="7" class="empty-state" style="padding:24px;">Nenhum contrato semanal ativo encontrado.</td></tr>`;
    } else {
        const agora = new Date();
        const horaAtual = agora.getHours();

        filtrados.forEach(c => {
            const cli = clientes.find(x => x.id === c.clienteId) || { nome: 'Cliente não encontrado', telefone: '' };
            const moto = motos.find(x => x.id === c.motoId) || { modelo: 'Moto', placa: '-', valor: 0 };
            const vInfo = getInfoVencimentoContrato(c);
            const oleo = getMotoOleoInfo(moto);
            const valSemanal = parseFloat(c.valorSemanal || (parseFloat(moto.valor || 0) * 7) || 0).toFixed(2);
            const cobPix = garantirCobrancaPixLocalNoContrato(c, cli, moto);

            const isBloqInad = moto.bloqueadoPorInadimplencia === true;
            const isBloqKm = moto.bloqueadoPorKmOleo === true || oleo.atingiuBloqueioKm;
            const temRast = !!(moto.rastreadorImei && moto.rastreadorImei.trim() !== '');

            let bloqueadorTag = temRast
                ? (moto.rastreadorBloqueado
                    ? `<span class="gps-pill gps-blocked" style="margin-top:3px;"><span class="gps-dot"></span> 🔒 Bloqueada (${isBloqInad ? 'Falta PIX 18h' : (isBloqKm ? '1.100km Óleo' : 'Remoto')})</span>`
                    : `<span class="gps-pill gps-online" style="margin-top:3px;"><span class="gps-dot"></span> 🔓 Liberada (ID: ${moto.rastreadorImei})</span>`)
                : `<span style="font-size:0.72rem; color:#64748b;">Sem rastreador instalado</span>`;

            let statusPagBadge = `<span class="badge badge-disponivel">✅ Em Dia</span>`;
            let subRegraHtml = `<small style="color:var(--text-muted); font-size:0.72rem; display:block; margin-top:3px;">☀️ Aviso 08:00h no vencimento</small>`;

            if (vInfo.diffDays !== null) {
                if (vInfo.diffDays < 0) {
                    statusPagBadge = `<span class="badge badge-alugada" style="background:#fee2e2; color:#991b1b;">🛑 ATRASADO (${Math.abs(vInfo.diffDays)}d) • BLOQUEIO 18H ATIVO</span>`;
                    subRegraHtml = `<small style="color:#dc2626; font-weight:700; font-size:0.72rem; display:block; margin-top:3px;">🔒 Só libera após confirmação do PIX</small>`;
                } else if (vInfo.diffDays === 0) {
                    if (horaAtual >= 18) {
                        statusPagBadge = `<span class="badge badge-alugada" style="background:#fee2e2; color:#991b1b;">🛑 18:00H EXCEDIDO • BLOQUEADA S/ PIX</span>`;
                        subRegraHtml = `<small style="color:#dc2626; font-weight:700; font-size:0.72rem; display:block; margin-top:3px;">🔒 Bloqueio 18h enviado ao bloqueador</small>`;
                    } else {
                        statusPagBadge = `<span class="badge badge-manutencao" style="background:#fef3c7; color:#92400e;">⏰ VENCE HOJE (Bloqueia às 18:00h)</span>`;
                        subRegraHtml = `<small style="color:#b45309; font-weight:700; font-size:0.72rem; display:block; margin-top:3px;">☀️ Notificado às 08:00h • Aguardando PIX</small>`;
                    }
                } else if (vInfo.diffDays <= 2) {
                    statusPagBadge = `<span class="badge badge-manutencao">⚠️ Vence em ${vInfo.diffDays}d</span>`;
                }
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <strong>${cli.nome}</strong><br>
                    <small style="color:var(--text-muted);">${cli.telefone || 'Sem telefone'}</small>
                </td>
                <td>
                    <strong>${moto.modelo}</strong> <span style="color:var(--text-muted); font-size:0.8rem;">(${moto.placa})</span><br>
                    ${bloqueadorTag}
                </td>
                <td>
                    <strong style="color:#059669; font-size:0.95rem;">R$ ${valSemanal}</strong><br>
                    <span style="font-size:0.72rem; color:#009ee3; font-weight:700;"><i class="fa-solid fa-qrcode"></i> PIX Mercado Pago (${cobPix ? cobPix.paymentId : 'Ativo'})</span>
                </td>
                <td>${vInfo.htmlBadge}</td>
                <td>
                    ${statusPagBadge}
                    ${subRegraHtml}
                </td>
                <td>
                    <span style="font-size:0.74rem; font-weight:700; padding:2px 7px; border-radius:4px; background:${oleo.badgeBg}; color:${oleo.badgeColor}; display:inline-block;">
                        ${oleo.kmAtual} km / ${oleo.kmProximaTroca} km
                    </span><br>
                    <div style="display:flex; gap:4px; margin-top:4px; flex-wrap:wrap;">
                        <button class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:0.69rem;" onclick="abrirModalTrocaOleo('${moto.id}')" title="Registrar Troca de Óleo">
                            <i class="fa-solid fa-oil-can"></i> Trocar
                        </button>
                        <button class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:0.69rem; background:#fffbeb; color:#92400e; border:1px solid #fcd34d;" onclick="notificarUsuarioIndividualOleo('${moto.id}')" title="Notificar individualmente este usuário sobre a troca de óleo">
                            <i class="fa-brands fa-whatsapp"></i> Avisar Óleo
                        </button>
                    </div>
                </td>
                <td>
                    <div style="display:flex; gap:5px; flex-wrap:wrap;">
                        <button class="btn btn-primary btn-sm" style="background:#009ee3; border:none;" onclick="abrirModalPixMercadoPago('${c.id}')" title="Abrir Cobrança PIX Mercado Pago, Enviar Aviso 08:00h e Desbloquear Automaticamente">
                            <i class="fa-solid fa-qrcode"></i> PIX Mercado Pago
                        </button>
                        <button class="btn btn-primary btn-sm" style="background:#059669;" onclick="abrirModalConfirmarPagamento('${c.id}')" title="Confirmar recebimento semanal (+7 dias) e liberar moto">
                            <i class="fa-solid fa-sack-dollar"></i> +7d
                        </button>
                        <button class="btn btn-secondary btn-sm" style="background:#25d366; color:#fff; border:none;" onclick="notificarUsuarioIndividual08h('${c.id}')" title="Enviar Notificação Individual das 08:00h com PIX Mercado Pago e Aviso de Bloqueio às 18:00h">
                            <i class="fa-brands fa-whatsapp"></i> Aviso 08h/18h
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="abrirEdicaoContrato('${c.id}')" title="Editar vencimento / valor">
                            <i class="fa-solid fa-calendar-pen"></i>
                        </button>
                    </div>
                </td>
            `;
            tbodyAtivos.appendChild(tr);
        });
    }

    // 2.5. Tabela de Notificações Individuais por Locatário (Cobrança 08:00h, Bloqueio 18:00h & Troca de Óleo)
    if (tbodyNotifInd) {
        tbodyNotifInd.innerHTML = '';
        if (contratosAtivos.length === 0) {
            tbodyNotifInd.innerHTML = `<tr><td colspan="6" class="empty-state" style="padding:20px;">Nenhum locatário com contrato ativo no momento.</td></tr>`;
        } else {
            contratosAtivos.forEach(c => {
                const cli = clientes.find(x => x.id === c.clienteId) || { nome: 'Locatário', telefone: '' };
                const moto = motos.find(x => x.id === c.motoId) || { modelo: 'Moto', placa: '-', valor: 0 };
                const vInfo = getInfoVencimentoContrato(c);
                const oleo = getMotoOleoInfo(moto);
                const valSemanal = parseFloat(c.valorSemanal || (parseFloat(moto.valor || 0) * 7) || 0).toFixed(2);

                const jaNotificou08h = c.notificado08hVencRef === c.dataProxVenc;
                const statusNotifPagHtml = vInfo.diffDays !== null && vInfo.diffDays <= 0
                    ? `<span class="badge badge-manutencao" style="background:#e0f2fe; color:#0369a1;"><i class="fa-solid fa-check-double"></i> Aviso 08:00h Ativo (Venc: ${vInfo.texto} • R$ ${valSemanal})</span><br><small style="color:#dc2626; font-weight:700;">⚠️ Aviso de bloqueio automático às ${cfgMp.horaBloqueio || '18:00'}h incluído</small>`
                    : `<span class="badge badge-disponivel">Programado p/ ${vInfo.texto} às ${cfgMp.horaNotificacao || '08:00'}h</span><br><small style="color:var(--text-muted);">${jaNotificou08h ? 'Notificado neste ciclo' : 'Disparo automático às 08:00h do vencimento'}</small>`;

                const statusNotifOleoHtml = oleo.atingiuBloqueioKm
                    ? `<span class="badge badge-alugada" style="background:#7f1d1d; color:#fff;">🛑 Bloqueio 1.100 km Ativado (${oleo.kmAtual} km)</span>`
                    : (oleo.status === 'vencido'
                        ? `<span class="badge badge-alugada" style="background:#fee2e2; color:#991b1b;">🚨 Troca Vencida (${oleo.kmAtual}/${oleo.kmProximaTroca} km) • Bloqueia aos ${oleo.kmBloqueioMotor} km</span>`
                        : (oleo.status === 'aviso'
                            ? `<span class="badge badge-manutencao">⚠️ Aviso Preventivo: Faltam ${oleo.kmRestantes} km</span>`
                            : `<span class="badge badge-disponivel">Em dia (${oleo.kmAtual} / ${oleo.kmProximaTroca} km)</span>`));

                const statusBloqMotoHtml = moto.rastreadorBloqueado
                    ? `<span class="gps-pill gps-blocked"><span class="gps-dot"></span> 🔒 BLOQUEADA (${moto.bloqueadoPorInadimplencia ? 'Não pagou até 18h' : (moto.bloqueadoPorKmOleo ? 'Limite 1.100 km Óleo' : 'Manual')})</span>`
                    : `<span class="gps-pill gps-online"><span class="gps-dot"></span> 🔓 Liberada (Desbloqueio Automático Ativo)</span>`;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <strong>${cli.nome}</strong><br>
                        <small style="color:var(--text-muted);">${cli.telefone || 'S/N'}</small>
                    </td>
                    <td>
                        <strong>${moto.modelo}</strong><br>
                        <small style="color:var(--text-muted);">Placa: <strong>${moto.placa}</strong></small>
                    </td>
                    <td>${statusNotifPagHtml}</td>
                    <td>${statusNotifOleoHtml}</td>
                    <td>${statusBloqMotoHtml}</td>
                    <td>
                        <div style="display:flex; gap:5px; flex-wrap:wrap;">
                            <button class="btn btn-primary btn-sm" style="background:#009ee3; border:none;" onclick="notificarUsuarioIndividual08h('${c.id}')" title="Enviar Notificação das 08:00h com PIX Mercado Pago e Aviso de Bloqueio às 18:00h">
                                <i class="fa-solid fa-bell"></i> Notificar Cobrança (08h)
                            </button>
                            <button class="btn btn-secondary btn-sm" style="background:#d97706; color:#fff; border:none;" onclick="notificarUsuarioIndividualOleo('${moto.id}')" title="Notificar este usuário sobre a Troca de Óleo (1.000 km / Bloqueio 1.100 km)">
                                <i class="fa-solid fa-oil-can"></i> Notificar Óleo
                            </button>
                        </div>
                    </td>
                `;
                tbodyNotifInd.appendChild(tr);
            });
        }
    }

    // 3. Tabela de Histórico de Pagamentos Recebidos
    tbodyHist.innerHTML = '';
    const histOrdenado = [...pagamentos].sort((a, b) => (b.criadoEm || b.dataPagamento || '').localeCompare(a.criadoEm || a.dataPagamento || ''));
    if (histOrdenado.length === 0) {
        tbodyHist.innerHTML = `<tr><td colspan="7" class="empty-state" style="padding:22px;">Nenhum pagamento registrado no histórico ainda.</td></tr>`;
    } else {
        histOrdenado.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${formatarDataBr(p.dataPagamento)}</strong></td>
                <td><strong>${p.clienteNome || '-'}</strong></td>
                <td>${p.motoModelo || '-'} <span style="color:var(--text-muted); font-size:0.78rem;">(${p.motoPlaca || '-'})</span></td>
                <td><strong style="color:#059669;">R$ ${parseFloat(p.valor || 0).toFixed(2)}</strong></td>
                <td><span class="badge badge-disponivel">${p.formaPagamento || 'PIX'}</span></td>
                <td>${formatarDataBr(p.novoVencimento)}</td>
                <td>
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                        <span style="font-size:0.8rem; color:var(--text-muted);">${p.obs || 'Aluguel semanal'}</span>
                        <div style="display:flex; gap:5px;">
                            <button class="btn btn-secondary btn-sm" style="background:#25d366; color:#fff; border:none;" onclick="enviarReciboPagamentoWhats('${p.id}')" title="Enviar Recibo pelo WhatsApp">
                                <i class="fa-brands fa-whatsapp"></i> Recibo
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="deletarPagamentoHistorico('${p.id}')" title="Excluir registro">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </td>
            `;
            tbodyHist.appendChild(tr);
        });
    }
}

// =========================================================================
// MÓDULO: API OFICIAL DO WHATSAPP (DISPARO 100% AUTÔNOMO SEM INTERVENÇÃO HUMANA)
// =========================================================================
function alternarCamposProviderWhatsApp() {
    const prov = document.getElementById('cfg-wa-provider')?.value || 'meta_cloud';
    const boxMeta = document.getElementById('box-cfg-wa-meta');
    const boxGateway = document.getElementById('box-cfg-wa-gateway');
    if (boxMeta) boxMeta.style.display = prov === 'meta_cloud' ? 'block' : 'none';
    if (boxGateway) boxGateway.style.display = prov !== 'meta_cloud' ? 'block' : 'none';
}

function salvarConfigWhatsAppOficial(e) {
    if (e) e.preventDefault();
    const cfg = {
        provider: document.getElementById('cfg-wa-provider')?.value || 'meta_cloud',
        metaPhoneNumberId: document.getElementById('cfg-wa-phone-id')?.value.trim() || '',
        metaWabaId: document.getElementById('cfg-wa-waba-id')?.value.trim() || '',
        metaToken: document.getElementById('cfg-wa-meta-token')?.value.trim() || '',
        gatewayUrl: document.getElementById('cfg-wa-gateway-url')?.value.trim() || '',
        gatewayToken: document.getElementById('cfg-wa-gateway-token')?.value.trim() || '',
        autoDisparo08h: document.getElementById('cfg-wa-auto-08h') ? document.getElementById('cfg-wa-auto-08h').checked : true,
        autoDisparo18h: document.getElementById('cfg-wa-auto-18h') ? document.getElementById('cfg-wa-auto-18h').checked : true,
        autoDisparoDesbloqueio: document.getElementById('cfg-wa-auto-desbloqueio') ? document.getElementById('cfg-wa-auto-desbloqueio').checked : true,
        autoDisparoOleo: document.getElementById('cfg-wa-auto-oleo') ? document.getElementById('cfg-wa-auto-oleo').checked : true
    };
    localStorage.setItem('crm_whatsapp_config', JSON.stringify(cfg));
    closeModal('modal-config-whatsapp');
    carregarLogsWhatsAppOficial();

    mostrarToastNotificacao({
        titulo: '✅ API Oficial do WhatsApp Configurada!',
        mensagem: 'O robô autônomo está pronto para disparar notificações e PIX sem intervenção humana.',
        cor: '#16a34a',
        icone: 'fa-robot'
    });
}

async function testarDisparoApiWhatsAppOficial() {
    const telefone = document.getElementById('cfg-wa-teste-numero')?.value.trim();
    if (!telefone) {
        alert('Por favor, informe o número de telefone de teste com DDD (Ex: 51999999999).');
        return;
    }
    const cfgWa = getWhatsAppConfig();
    const token = document.getElementById('cfg-wa-meta-token')?.value.trim() || cfgWa.metaToken;
    const phoneId = document.getElementById('cfg-wa-phone-id')?.value.trim() || cfgWa.metaPhoneNumberId;
    const gatewayUrl = document.getElementById('cfg-wa-gateway-url')?.value.trim() || cfgWa.gatewayUrl;
    const gatewayToken = document.getElementById('cfg-wa-gateway-token')?.value.trim() || cfgWa.gatewayToken;
    const provider = document.getElementById('cfg-wa-provider')?.value || cfgWa.provider;

    mostrarToastNotificacao({
        titulo: '🚀 Disparando Teste via API...',
        mensagem: `Enviando notificação de teste via API ${provider === 'meta_cloud' ? 'Oficial Meta WhatsApp' : 'Gateway REST'} para ${telefone}...`,
        cor: '#009ee3',
        icone: 'fa-paper-plane'
    });

    try {
        const res = await fetch('/api/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'send_message',
                telefone,
                clienteNome: 'Administrador Facilita Moto',
                motoPlaca: 'IPU2I57',
                motoModelo: 'CG 150 TITAN MIX',
                tipo: 'teste',
                mensagem: '🤖 *FACILITA MOTO — TESTE DA API OFICIAL DO WHATSAPP*\n\nSe você recebeu esta mensagem, o robô autônomo de disparos sem intervenção humana está configurado com sucesso!',
                provider,
                metaToken: token,
                metaPhoneNumberId: phoneId,
                gatewayUrl,
                gatewayToken
            })
        });
        const data = await res.json();
        carregarLogsWhatsAppOficial();
        if (data && data.success) {
            mostrarToastNotificacao({
                titulo: '✅ Teste WhatsApp Disparado!',
                mensagem: `O robô enviou a notificação para ${telefone} sem intervenção humana.`,
                cor: '#16a34a',
                icone: 'fa-check'
            });
            alert(`✅ Sucesso! Mensagem disparada com sucesso para ${telefone} via API Oficial (${provider}).\n\nStatus: ${data.status || 'OK'}`);
        } else {
            alert(`⚠️ Resposta da API WhatsApp:\n${data?.error || data?.message || 'Falha ao disparar. Verifique o Token ou Telefone.'}`);
        }
    } catch (err) {
        alert(`❌ Erro de conexão ao enviar: ${err.message}`);
    }
}

async function carregarLogsWhatsAppOficial() {
    const container = document.getElementById('whatsapp-api-logs-container');
    if (!container) return;
    try {
        const res = await fetch('/api/whatsapp?action=get_logs');
        if (!res.ok) return;
        const data = await res.json();
        const logs = data.logs || [];
        if (logs.length === 0) {
            container.innerHTML = `<span style="color:#64748b; font-size:0.75rem;">Nenhum disparo autônomo registrado nesta sessão. As mensagens enviadas pelo robô em segundo plano aparecerão aqui.</span>`;
            return;
        }
        container.innerHTML = logs.slice(0, 8).map(l => {
            const hora = new Date(l.timestamp).toLocaleTimeString('pt-BR');
            const statusBadge = l.status === 'sent'
                ? `<span class="badge badge-disponivel" style="background:#16a34a; color:#fff; font-size:0.68rem;"><i class="fa-solid fa-check"></i> Enviado</span>`
                : (l.status === 'simulated'
                    ? `<span class="badge badge-manutencao" style="font-size:0.68rem;"><i class="fa-solid fa-flask"></i> Simulado</span>`
                    : `<span class="badge badge-alugada" style="background:#dc2626; color:#fff; font-size:0.68rem;"><i class="fa-solid fa-xmark"></i> Falha</span>`);
            return `
                <div style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <div>
                        <strong style="color:#0f172a; font-size:0.75rem;">${l.clienteNome || 'Cliente'} (${l.motoPlaca || 'Moto'})</strong>
                        <span style="color:#64748b; font-size:0.7rem; margin-left:6px;">📱 ${l.telefone}</span>
                        <div style="font-size:0.7rem; color:#334155; margin-top:2px;">${l.tipo || 'Mensagem'} • ${hora} • <em>${l.provider || 'API'}</em></div>
                    </div>
                    <div>${statusBadge}</div>
                </div>
            `;
        }).join('');
    } catch (e) {}
}

async function dispararMensagemWhatsAppAutonoma({ telefone, clienteNome, motoPlaca, motoModelo, tipo, mensagem, pixCopiaECola }) {
    if (!telefone) return { success: false, error: 'Telefone ausente' };
    const cfgWa = getWhatsAppConfig();

    if (tipo === 'cobranca_08h' && cfgWa.autoDisparo08h === false) return { skipped: true };
    if (tipo === 'bloqueio_18h' && cfgWa.autoDisparo18h === false) return { skipped: true };
    if (tipo === 'desbloqueio_pix' && cfgWa.autoDisparoDesbloqueio === false) return { skipped: true };
    if ((tipo === 'oleo_aviso' || tipo === 'bloqueio_km') && cfgWa.autoDisparoOleo === false) return { skipped: true };

    try {
        const res = await fetch('/api/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'send_message',
                telefone,
                clienteNome,
                motoPlaca,
                motoModelo,
                tipo,
                mensagem,
                pixCopiaECola: pixCopiaECola || '',
                provider: cfgWa.provider,
                metaToken: cfgWa.metaToken,
                metaPhoneNumberId: cfgWa.metaPhoneNumberId,
                metaWabaId: cfgWa.metaWabaId,
                metaTemplateName: cfgWa.metaTemplateName,
                gatewayUrl: cfgWa.gatewayUrl,
                gatewayToken: cfgWa.gatewayToken
            })
        });
        const data = await res.json();
        carregarLogsWhatsAppOficial();
        return data;
    } catch (err) {
        console.error('[WhatsApp Autônomo Error]', err);
        return { success: false, error: err.message };
    }
}

// =========================================================================
// FUNÇÕES DE NOTIFICAÇÃO INDIVIDUAL POR USUÁRIO (08:00H, 18:00H E ÓLEO)
// =========================================================================
function notificarUsuarioIndividual08h(contratoId) {
    let contratos = getDb('crm_contratos');
    const cIdx = contratos.findIndex(c => c.id === contratoId);
    if (cIdx === -1) return;

    const clientes = getDb('crm_clientes');
    const motos = getDb('crm_motos');
    const cli = clientes.find(x => x.id === contratos[cIdx].clienteId) || { nome: 'Locatário', telefone: '' };
    const moto = motos.find(x => x.id === contratos[cIdx].motoId) || { modelo: 'Moto', placa: '-', valor: 0 };

    garantirCobrancaPixLocalNoContrato(contratos[cIdx], cli, moto);
    contratos[cIdx].notificado08hVencRef = contratos[cIdx].dataProxVenc;
    contratos[cIdx].notificado08hEm = new Date().toISOString();
    saveDb('crm_contratos', contratos);

    const msg = montarTextoNotificacao08hUsuario(contratos[cIdx], cli, moto);
    const numWhats = (cli.telefone || '').replace(/\D/g, '');
    const cfgWa = getWhatsAppConfig();
    const temApiWa = !!(cfgWa.metaToken || cfgWa.gatewayUrl);

    // Disparo 100% autônomo via API Oficial em segundo plano
    dispararMensagemWhatsAppAutonoma({
        telefone: cli.telefone,
        clienteNome: cli.nome,
        motoPlaca: moto.placa,
        motoModelo: moto.modelo,
        tipo: 'cobranca_08h',
        mensagem: msg,
        pixCopiaECola: contratos[cIdx].pixCobrancaAtual?.copiaECola || ''
    }).then(res => {
        if (res && res.success) {
            mostrarToastNotificacao({
                titulo: `🤖 WhatsApp Autônomo Enviado — ${cli.nome}`,
                mensagem: `Cobrança 08h e PIX enviados sem intervenção humana via API Oficial!`,
                cor: '#16a34a',
                icone: 'fa-robot'
            });
        }
    });

    mostrarToastNotificacao({
        titulo: `☀️ Notificação 08:00h Disparada — ${cli.nome}`,
        mensagem: `Cobrança semanal PIX Mercado Pago + Aviso de bloqueio automático às 18:00h gerados para a moto ${moto.placa}.`,
        cor: '#009ee3',
        icone: 'fa-bell'
    });

    updateViews();

    // Se a API ainda não tiver token configurado, abre a janela como contingência
    if (!temApiWa && numWhats) {
        window.open(`https://wa.me/55${numWhats}?text=${encodeURIComponent(msg)}`, '_blank');
    }
}

function notificarUsuarioIndividualOleo(motoId) {
    let motos = getDb('crm_motos');
    const mIdx = motos.findIndex(m => m.id === motoId);
    if (mIdx === -1) return;

    const contratos = getDb('crm_contratos');
    const clientes = getDb('crm_clientes');
    const { cliente } = getCondutorContratoAtivo(motoId, contratos, clientes);

    const msg = montarTextoNotificacaoOleoIndividualUsuario(motos[mIdx], cliente);
    motos[mIdx].ultimoAvisoOleoData = new Date().toISOString();
    saveDb('crm_motos', motos);

    const cfgWa = getWhatsAppConfig();
    const temApiWa = !!(cfgWa.metaToken || cfgWa.gatewayUrl);

    if (cliente && cliente.telefone) {
        dispararMensagemWhatsAppAutonoma({
            telefone: cliente.telefone,
            clienteNome: cliente.nome,
            motoPlaca: motos[mIdx].placa,
            motoModelo: motos[mIdx].modelo,
            tipo: 'oleo_aviso',
            mensagem: msg
        });
    }

    mostrarToastNotificacao({
        titulo: `🛢️ Notificação Individual de Óleo (${motos[mIdx].placa})`,
        mensagem: `Alerta de revisão de 1.000 km e bloqueio de proteção aos 1.100 km enviado para ${cliente ? cliente.nome : 'Condutor'}.`,
        cor: '#d97706',
        icone: 'fa-oil-can'
    });

    if (!temApiWa && cliente && cliente.telefone) {
        const numWhats = cliente.telefone.replace(/\D/g, '');
        if (numWhats) {
            window.open(`https://wa.me/55${numWhats}?text=${encodeURIComponent(msg)}`, '_blank');
            return;
        }
    }
}

// =========================================================================
// MODAL E INTEGRAÇÃO COM A API MERCADO PAGO PIX + DESBLOQUEIO AUTOMÁTICO
// =========================================================================
function abrirModalPixMercadoPago(contratoId) {
    let contratos = getDb('crm_contratos');
    const cIdx = contratos.findIndex(c => c.id === contratoId);
    if (cIdx === -1) return;

    const clientes = getDb('crm_clientes');
    const motos = getDb('crm_motos');
    const cli = clientes.find(x => x.id === contratos[cIdx].clienteId) || { nome: 'Locatário', telefone: '', cpf: '', email: '' };
    const moto = motos.find(x => x.id === contratos[cIdx].motoId) || { modelo: 'Moto', placa: '-', valor: 0 };
    const cfgMp = getMercadoPagoConfig();

    const valSemanal = parseFloat(contratos[cIdx].valorSemanal || (parseFloat(moto.valor || 0) * 7) || 350).toFixed(2);
    const cobLocal = garantirCobrancaPixLocalNoContrato(contratos[cIdx], cli, moto);
    saveDb('crm_contratos', contratos);

    document.getElementById('mp-pix-contrato-id').value = contratos[cIdx].id;
    document.getElementById('mp-pix-payment-id').value = cobLocal.paymentId || '';
    document.getElementById('mp-pix-resumo-cliente').innerText = `👤 Locatário: ${cli.nome} (${cli.telefone || 'Sem telefone'})`;
    document.getElementById('mp-pix-resumo-moto').innerText = `🏍️ Moto: ${moto.modelo} • Placa: ${moto.placa} • Vencimento: ${formatarDataBr(contratos[cIdx].dataProxVenc)}`;
    document.getElementById('mp-pix-resumo-regra').innerText = `☀️ Aviso enviado às ${cfgMp.horaNotificacao || '08:00'}h • 🛑 Bloqueio automático às ${cfgMp.horaBloqueio || '18:00'}h • 🔓 Liberação imediata pós-PIX`;
    document.getElementById('mp-pix-valor-badge').innerText = `R$ ${valSemanal}`;

    const alertaBloqEl = document.getElementById('mp-pix-alerta-bloqueada');
    if (alertaBloqEl) {
        alertaBloqEl.style.display = moto.bloqueadoPorInadimplencia ? 'block' : 'none';
    }

    const alertaTokenEl = document.getElementById('mp-pix-alerta-sem-token');
    const temTokenMp = !!(cfgMp.accessToken && cfgMp.accessToken.trim().length > 15);
    if (alertaTokenEl) {
        alertaTokenEl.style.display = temTokenMp ? 'none' : 'block';
    }

    const provLabelInit = document.getElementById('mp-pix-provider-label');
    if (provLabelInit) {
        provLabelInit.innerText = temTokenMp
            ? 'API Oficial Mercado Pago'
            : '⚠️ Token Mercado Pago Não Configurado (Insira acima para emitir no Mercado Pago)';
        provLabelInit.style.color = temTokenMp ? '#009ee3' : '#dc2626';
    }

    const statusBadgeEl = document.getElementById('mp-pix-status-badge');
    if (statusBadgeEl) {
        statusBadgeEl.className = moto.bloqueadoPorInadimplencia ? 'badge badge-alugada' : 'badge badge-manutencao';
        statusBadgeEl.innerText = moto.bloqueadoPorInadimplencia ? '🛑 Moto Bloqueada (Aguardando PIX)' : '⏳ Aguardando Confirmação PIX';
    }

    const qrImg = document.getElementById('mp-pix-qrcode-img');
    if (qrImg) qrImg.src = cobLocal.qrCodeUrl;
    const copiaColaEl = document.getElementById('mp-pix-copia-cola');
    if (copiaColaEl) copiaColaEl.value = cobLocal.copiaECola;

    openModal('modal-cobranca-pix-mp');

    // Sincroniza também com o endpoint Serverless /api/mercadopago para registrar na API oficial / Webhook
    sincronizarCobrancaPixComServidorMp(contratos[cIdx].id);

    if (window.mpPixModalInterval) clearInterval(window.mpPixModalInterval);
    window.mpPixModalInterval = setInterval(() => {
        const cIdAtivo = document.getElementById('mp-pix-contrato-id')?.value;
        const modalEl = document.getElementById('modal-cobranca-pix-mp');
        if (modalEl && modalEl.classList.contains('show') && cIdAtivo) {
            consultarStatusPixNoServidorMp(cIdAtivo);
        }
    }, 4000);
}

function fecharModalPixMercadoPago() {
    closeModal('modal-cobranca-pix-mp');
}

function sincronizarCobrancaPixComServidorMp(contratoId, forcarNovo = false) {
    let contratos = getDb('crm_contratos');
    const cIdx = contratos.findIndex(c => c.id === contratoId);
    if (cIdx === -1) return;

    const clientes = getDb('crm_clientes');
    const motos = getDb('crm_motos');
    const cli = clientes.find(x => x.id === contratos[cIdx].clienteId) || { nome: 'Locatário', cpf: '', email: '' };
    const moto = motos.find(x => x.id === contratos[cIdx].motoId) || { modelo: 'Moto', placa: '-', valor: 0 };
    const cfgMp = getMercadoPagoConfig();
    const valSemanal = parseFloat(contratos[cIdx].valorSemanal || (parseFloat(moto.valor || 0) * 7) || 350).toFixed(2);

    fetch('/api/mercadopago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'create_pix',
            contratoId: contratos[cIdx].id,
            clienteNome: cli.nome,
            clienteCpf: cli.cpf || '',
            clienteEmail: cli.email || '',
            motoPlaca: moto.placa,
            motoModelo: moto.modelo,
            valor: valSemanal,
            vencimento: contratos[cIdx].dataProxVenc,
            accessToken: cfgMp.accessToken || '',
            chavePix: cfgMp.chavePix || '85221619091',
            beneficiario: cfgMp.beneficiario || 'HENRIQUE ROCHA CLAVIJO',
            forcarNovo
        })
    })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
        if (!data) return;
        if (data.needsToken) {
            const alertaTokenEl = document.getElementById('mp-pix-alerta-sem-token');
            if (alertaTokenEl) alertaTokenEl.style.display = 'block';
            const provLabel = document.getElementById('mp-pix-provider-label');
            if (provLabel) {
                provLabel.innerText = '⚠️ Access Token do Mercado Pago Necessário (APP_USR-...)';
                provLabel.style.color = '#dc2626';
            }
            return;
        }
        if (!data.charge) return;
        let contratosAtuais = getDb('crm_contratos');
        const idx = contratosAtuais.findIndex(x => x.id === contratoId);
        if (idx > -1) {
            contratosAtuais[idx].pixCobrancaAtual = data.charge;
            saveDb('crm_contratos', contratosAtuais);
        }
        const modalContratoId = document.getElementById('mp-pix-contrato-id')?.value;
        if (modalContratoId === contratoId) {
            if (document.getElementById('mp-pix-payment-id')) document.getElementById('mp-pix-payment-id').value = data.charge.paymentId || '';
            if (document.getElementById('mp-pix-qrcode-img') && data.charge.qrCodeUrl) document.getElementById('mp-pix-qrcode-img').src = data.charge.qrCodeUrl;
            if (document.getElementById('mp-pix-copia-cola') && data.charge.copiaECola) document.getElementById('mp-pix-copia-cola').value = data.charge.copiaECola;
            const provLabel = document.getElementById('mp-pix-provider-label');
            if (provLabel) {
                provLabel.innerText = data.provider === 'mercadopago_official'
                    ? `API Oficial Mercado Pago (#${data.charge.paymentId})`
                    : `PIX Mercado Pago (#${data.charge.paymentId})`;
                provLabel.style.color = '#009ee3';
            }
        }
    })
    .catch(() => {});
}

function regenerarCobrancaPixModal() {
    const contratoId = document.getElementById('mp-pix-contrato-id')?.value;
    if (!contratoId) return;
    sincronizarCobrancaPixComServidorMp(contratoId, true);
    mostrarToastNotificacao({
        titulo: '🔄 QR Code PIX Atualizado',
        mensagem: 'Nova cobrança PIX gerada para este vencimento semanal.',
        cor: '#009ee3',
        icone: 'fa-qrcode'
    });
}

function copiarCodigoPixMercadoPago() {
    const el = document.getElementById('mp-pix-copia-cola');
    if (!el || !el.value) return;
    navigator.clipboard?.writeText(el.value).catch(() => {
        el.select();
        document.execCommand('copy');
    });
    mostrarToastNotificacao({
        titulo: '✅ PIX Copia e Cola Copiado!',
        mensagem: 'O código PIX do Mercado Pago foi copiado para a área de transferência.',
        cor: '#10b981',
        icone: 'fa-copy'
    });
}

function enviarNotificacao08hWhatsModal() {
    const contratoId = document.getElementById('mp-pix-contrato-id')?.value;
    if (!contratoId) return;
    notificarUsuarioIndividual08h(contratoId);
}

function aplicarBloqueio18hManualNoModal() {
    const contratoId = document.getElementById('mp-pix-contrato-id')?.value;
    if (!contratoId) return;

    let contratos = getDb('crm_contratos');
    const cIdx = contratos.findIndex(c => c.id === contratoId);
    if (cIdx === -1) return;

    let motos = getDb('crm_motos');
    const clientes = getDb('crm_clientes');
    const mIdx = motos.findIndex(m => m.id === contratos[cIdx].motoId);
    const cli = clientes.find(x => x.id === contratos[cIdx].clienteId) || { nome: 'Locatário', telefone: '' };
    if (mIdx === -1) return;

    const cfgTracker = getTrackerConfig();
    motos[mIdx].rastreadorBloqueado = true;
    motos[mIdx].bloqueadoPorInadimplencia = true;
    motos[mIdx].contratoBloqueadoId = contratos[cIdx].id;
    motos[mIdx].motivoBloqueioAutomatico = `BLOQUEIO AUTOMÁTICO 18:00H: Aluguel semanal não pago até as 18:00h (Só libera após confirmação PIX)`;
    motos[mIdx].rastreadorUltimaSync = new Date().toISOString();
    saveDb('crm_motos', motos);

    contratos[cIdx].bloqueado18hVencRef = contratos[cIdx].dataProxVenc;
    contratos[cIdx].bloqueado18hEm = new Date().toISOString();
    saveDb('crm_contratos', contratos);

    fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'command_block',
            id: motos[mIdx].rastreadorImei || '00018E1B',
            placa: motos[mIdx].placa,
            bloquear: true,
            motivo: motos[mIdx].motivoBloqueioAutomatico,
            xtrackEmail: cfgTracker.xtrackEmail || '',
            xtrackSenha: cfgTracker.xtrackSenha || ''
        })
    }).catch(() => {});

    abrirModalPixMercadoPago(contratoId);
    updateViews();

    mostrarToastNotificacao({
        titulo: `🛑 Moto Bloqueada por Falta de Pagamento (${motos[mIdx].placa})`,
        mensagem: `Comando de bloqueio das 18:00h enviado ao bloqueador da moto. Só voltará a liberar após confirmação do PIX!`,
        cor: '#dc2626',
        icone: 'fa-lock'
    });

    const msgBloq = montarTextoNotificacaoBloqueio18hUsuario(contratos[cIdx], cli, motos[mIdx]);
    const cfgWa = getWhatsAppConfig();
    const temApiWa = !!(cfgWa.metaToken || cfgWa.gatewayUrl);

    // Dispara via robô autônomo da API Oficial WhatsApp sem intervenção humana
    dispararMensagemWhatsAppAutonoma({
        telefone: cli.telefone,
        clienteNome: cli.nome,
        motoPlaca: motos[mIdx].placa,
        motoModelo: motos[mIdx].modelo,
        tipo: 'bloqueio_18h',
        mensagem: msgBloq,
        pixCopiaECola: contratos[cIdx].pixCobrancaAtual?.copiaECola || ''
    }).then(res => {
        if (res && res.success) {
            mostrarToastNotificacao({
                titulo: `🤖 WhatsApp Autônomo Disparado (${cli.nome})`,
                mensagem: `Aviso de bloqueio e código PIX enviados via API Oficial sem intervenção humana!`,
                cor: '#16a34a',
                icone: 'fa-robot'
            });
        }
    });

    const numWhats = (cli.telefone || '').replace(/\D/g, '');
    if (!temApiWa && numWhats && confirm(`A moto ${motos[mIdx].modelo} (${motos[mIdx].placa}) foi BLOQUEADA no rastreador/bloqueador!\n\nDeseja enviar agora o aviso de bloqueio + código PIX para ${cli.nome} no WhatsApp?`)) {
        window.open(`https://wa.me/55${numWhats}?text=${encodeURIComponent(msgBloq)}`, '_blank');
    }
}

function consultarStatusPixNoServidorMp(contratoId) {
    const contratos = getDb('crm_contratos');
    const contrato = contratos.find(c => c.id === contratoId);
    if (!contrato || contrato.status !== 'ativo') return;

    const cfgMp = getMercadoPagoConfig();
    const payId = contrato.pixCobrancaAtual?.paymentId || '';
    const url = `/api/mercadopago?contratoId=${encodeURIComponent(contrato.id)}&paymentId=${encodeURIComponent(payId)}&accessToken=${encodeURIComponent(cfgMp.accessToken || '')}`;

    fetch(url)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (data && data.charge && data.charge.status === 'approved') {
                processarConfirmacaoAutomaticaPixMercadoPago(contrato.id, data.charge);
            }
        })
        .catch(() => {});
}

function confirmarPagamentoPixMercadoPagoAgora() {
    const contratoId = document.getElementById('mp-pix-contrato-id')?.value;
    const paymentId = document.getElementById('mp-pix-payment-id')?.value;
    if (!contratoId) return;

    const contratos = getDb('crm_contratos');
    const contrato = contratos.find(c => c.id === contratoId);
    if (!contrato) return;

    const motos = getDb('crm_motos');
    const moto = motos.find(m => m.id === contrato.motoId) || { valor: 0 };
    const valSemanal = parseFloat(contrato.valorSemanal || (parseFloat(moto.valor || 0) * 7) || 350).toFixed(2);

    fetch('/api/mercadopago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'confirm_pix',
            contratoId,
            paymentId,
            valor: valSemanal
        })
    })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
        processarConfirmacaoAutomaticaPixMercadoPago(contratoId, data?.charge || { paymentId, valor: valSemanal, status: 'approved' });
    })
    .catch(() => {
        processarConfirmacaoAutomaticaPixMercadoPago(contratoId, { paymentId, valor: valSemanal, status: 'approved' });
    });
}

function processarConfirmacaoAutomaticaPixMercadoPago(contratoId, chargeData = {}) {
    let contratos = getDb('crm_contratos');
    const cIdx = contratos.findIndex(c => c.id === contratoId);
    if (cIdx === -1) return;

    // Evita processar duas vezes o mesmo pagamento aprovado
    const payId = chargeData.paymentId || contratos[cIdx].pixCobrancaAtual?.paymentId || `MP-${Date.now()}`;
    if (contratos[cIdx].ultimoPaymentIdProcessado && contratos[cIdx].ultimoPaymentIdProcessado === payId) {
        return;
    }

    const clientes = getDb('crm_clientes');
    let motos = getDb('crm_motos');
    const cli = clientes.find(x => x.id === contratos[cIdx].clienteId) || { nome: 'Locatário', telefone: '' };
    const mIdx = motos.findIndex(x => x.id === contratos[cIdx].motoId);
    const moto = mIdx > -1 ? motos[mIdx] : { modelo: 'Moto', placa: '-', valor: 0 };

    const hojeIso = new Date().toISOString().split('T')[0];
    const vencAnterior = contratos[cIdx].dataProxVenc || hojeIso;
    const proxDate = new Date(vencAnterior + 'T00:00:00');
    proxDate.setDate(proxDate.getDate() + 7);
    const novoVencimento = proxDate.toISOString().split('T')[0];

    const valorPago = parseFloat(chargeData.valor || contratos[cIdx].valorSemanal || (parseFloat(moto.valor || 0) * 7) || 0);

    // 1. Atualiza o Contrato (+7 dias) e limpa flags de bloqueio de inadimplência
    contratos[cIdx].dataProxVenc = novoVencimento;
    contratos[cIdx].formaPagamento = 'PIX Mercado Pago';
    contratos[cIdx].ultimoPaymentIdProcessado = payId;
    contratos[cIdx].pixCobrancaAtual = null;
    contratos[cIdx].bloqueado18hVencRef = '';
    saveDb('crm_contratos', contratos);

    // 2. Desbloqueia AUTOMATICAMENTE a motocicleta no Rastreador / Bloqueador se não estiver bloqueada por 1.100 km de óleo
    let desbloqueouMoto = false;
    if (mIdx > -1) {
        const estavaBloqueada = motos[mIdx].rastreadorBloqueado === true || motos[mIdx].bloqueadoPorInadimplencia === true;
        motos[mIdx].bloqueadoPorInadimplencia = false;
        motos[mIdx].contratoBloqueadoId = '';

        if (!motos[mIdx].bloqueadoPorKmOleo) {
            motos[mIdx].rastreadorBloqueado = false;
            motos[mIdx].motivoBloqueioAutomatico = '';
            if (estavaBloqueada) {
                desbloqueouMoto = true;
                const cfgTracker = getTrackerConfig();
                fetch('/api/telemetry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'command_block',
                        id: motos[mIdx].rastreadorImei || '00018E1B',
                        placa: motos[mIdx].placa,
                        bloquear: false,
                        motivo: `PIX Confirmado via Mercado Pago (${payId}) — Desbloqueio Automático`,
                        xtrackEmail: cfgTracker.xtrackEmail || '',
                        xtrackSenha: cfgTracker.xtrackSenha || ''
                    })
                }).catch(() => {});
            }
        }
        motos[mIdx].rastreadorUltimaSync = new Date().toISOString();
        saveDb('crm_motos', motos);
    }

    // 3. Registra no Histórico de Pagamentos
    const novoPag = {
        id: generateId(),
        contratoId: contratoId,
        clienteId: cli.id || '',
        clienteNome: cli.nome,
        clienteTelefone: cli.telefone || '',
        motoId: moto.id || '',
        motoModelo: moto.modelo,
        motoPlaca: moto.placa,
        valor: valorPago.toFixed(2),
        formaPagamento: 'PIX Mercado Pago',
        dataPagamento: hojeIso,
        vencimentoAnterior: vencAnterior,
        novoVencimento: novoVencimento,
        obs: `PIX confirmado automaticamente (${payId})${desbloqueouMoto ? ' • Moto desbloqueada automaticamente' : ''}`,
        criadoEm: new Date().toISOString()
    };

    let pagamentos = getDb('crm_pagamentos');
    pagamentos.push(novoPag);
    saveDb('crm_pagamentos', pagamentos);

    // 4. Dispara Notificação e Recibo Automático via WhatsApp (Sem Intervenção Humana)
    if (cli.telefone) {
        const msgReciboWa = `✅ *PAGAMENTO PIX CONFIRMADO & MOTO LIBERADA — FACILITA MOTO*\n\n` +
            `Olá, *${cli.nome}*!\n` +
            `Seu pagamento semanal de *R$ ${valorPago.toFixed(2)}* referente à motocicleta *${moto.modelo} (${moto.placa})* foi confirmado com sucesso pelo *Mercado Pago*!\n\n` +
            `📅 *Novo Vencimento:* ${formatarDataBr(novoVencimento)}\n` +
            `${desbloqueouMoto ? `🔓 *COMANDO DE DESBLOQUEIO ENVIADO:* Sua motocicleta foi liberada automaticamente no rastreador/bloqueador!\n\n` : `🔓 *STATUS DO BLOQUEADOR:* Motocicleta Liberada\n\n`}` +
            `Obrigado pela pontualidade e bom trabalho!`;

        dispararMensagemWhatsAppAutonoma({
            telefone: cli.telefone,
            clienteNome: cli.nome,
            motoPlaca: moto.placa,
            motoModelo: moto.modelo,
            tipo: 'desbloqueio_pix',
            mensagem: msgReciboWa
        }).then(res => {
            if (res && res.success) {
                mostrarToastNotificacao({
                    titulo: `🤖 Recibo WhatsApp Enviado — ${cli.nome}`,
                    mensagem: `Recibo e aviso de desbloqueio disparados sem intervenção humana!`,
                    cor: '#16a34a',
                    icone: 'fa-robot'
                });
            }
        });
    }

    fecharModalPixMercadoPago();
    updateViews();

    mostrarToastNotificacao({
        titulo: desbloqueouMoto
            ? `🔓 PIX CONFIRMADO & MOTO DESBLOQUEADA (${moto.placa})!`
            : `✅ PIX Mercado Pago Confirmado (${moto.placa})!`,
        mensagem: `Recebido R$ ${valorPago.toFixed(2)} de ${cli.nome}. Novo vencimento: ${formatarDataBr(novoVencimento)}.${desbloqueouMoto ? ' Comando de DESBLOQUEIO enviado automaticamente ao bloqueador da moto!' : ''}`,
        cor: '#10b981',
        icone: desbloqueouMoto ? 'fa-unlock' : 'fa-circle-check',
        duracao: 9500
    });
}

function salvarConfigMercadoPago(e) {
    e.preventDefault();
    const cfg = {
        accessToken: document.getElementById('cfg-mp-access-token')?.value.trim() || 'APP_USR-6194243169013538-102220-43c64ed326354129ba6d2d512a427b04-213948720',
        chavePix: 'mercadopago_api_dinamica',
        beneficiario: 'MERCADO PAGO INSTITUICAO DE PAGAMENTO',
        horaNotificacao: document.getElementById('cfg-mp-hora-notif')?.value || '08:00',
        horaBloqueio: document.getElementById('cfg-mp-hora-bloqueio')?.value || '18:00',
        autoNotificar08h: document.getElementById('cfg-mp-auto-notif-08h') ? document.getElementById('cfg-mp-auto-notif-08h').checked : true,
        autoBloquear18h: document.getElementById('cfg-mp-auto-bloqueio-18h') ? document.getElementById('cfg-mp-auto-bloqueio-18h').checked : true,
        autoDesbloquearPix: document.getElementById('cfg-mp-auto-desbloqueio-pix') ? document.getElementById('cfg-mp-auto-desbloqueio-pix').checked : true
    };
    localStorage.setItem('crm_mercadopago_config', JSON.stringify(cfg));
    closeModal('modal-config-mercadopago');
    verificarReguaAutomaticaPagamentosEBloqueio18h(true);
    updateViews();

    mostrarToastNotificacao({
        titulo: '⚙️ Automação Mercado Pago PIX Salva!',
        mensagem: `Notificação configurada para as ${cfg.horaNotificacao}h e bloqueio automático às ${cfg.horaBloqueio}h com liberação pós-PIX.`,
        cor: '#009ee3',
        icone: 'fa-check'
    });
}

// =========================================================================
// MOTOR AUTÔNOMO: NOTIFICAÇÃO ÀS 08:00H, BLOQUEIO ÀS 18:00H E LIBERAÇÃO PIX
// =========================================================================
function converterHoraParaMinutos(horaStr, fallbackMinutos) {
    if (!horaStr || !horaStr.includes(':')) return fallbackMinutos;
    const p = horaStr.split(':');
    const h = parseInt(p[0]);
    const m = parseInt(p[1]);
    if (isNaN(h) || isNaN(m)) return fallbackMinutos;
    return h * 60 + m;
}

function verificarReguaAutomaticaPagamentosEBloqueio18h(exibirResumoManual = false) {
    const cfgMp = getMercadoPagoConfig();
    const cfgTracker = getTrackerConfig();
    let contratos = getDb('crm_contratos');
    let motos = getDb('crm_motos');
    const clientes = getDb('crm_clientes');

    const agora = new Date();
    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
    const minutos08h = converterHoraParaMinutos(cfgMp.horaNotificacao || '08:00', 8 * 60);
    const minutos18h = converterHoraParaMinutos(cfgMp.horaBloqueio || '18:00', 18 * 60);

    let mudouContratos = false;
    let mudouMotos = false;
    let qtdNotificados08h = 0;
    let qtdBloqueados18h = 0;
    let qtdAlertasOleo = 0;

    // 1. Notificação Individual Automática de Troca de Óleo (1.000 km / 1.100 km) por Usuário
    motos.forEach(m => {
        const oleo = getMotoOleoInfo(m);
        if (oleo.status === 'vencido' || oleo.status === 'aviso' || oleo.atingiuBloqueioKm) {
            qtdAlertasOleo++;
            const chaveAvisoOleo = `${oleo.kmProximaTroca}_${oleo.atingiuBloqueioKm ? 'bloq' : oleo.status}`;
            if (cfgMp.autoNotificar08h !== false && m.ultimoAvisoOleoAutoKey !== chaveAvisoOleo) {
                m.ultimoAvisoOleoAutoKey = chaveAvisoOleo;
                m.ultimoAvisoOleoData = new Date().toISOString();
                mudouMotos = true;
                const { cliente } = getCondutorContratoAtivo(m.id, contratos, clientes);
                if (cliente) {
                    mostrarToastNotificacao({
                        titulo: `🛢️ Notificação Individual de Óleo — ${cliente.nome}`,
                        mensagem: `Moto ${m.modelo} (${m.placa}) está com ${oleo.kmAtual} km (Troca: ${oleo.kmProximaTroca} km • Bloqueio: ${oleo.kmBloqueioMotor} km).`,
                        cor: oleo.atingiuBloqueioKm ? '#dc2626' : '#d97706',
                        icone: 'fa-oil-can'
                    });

                    // Disparo 100% autônomo via API Oficial WhatsApp sem intervenção humana
                    if (cliente.telefone) {
                        const msgOleoAuto = montarTextoNotificacaoOleoIndividualUsuario(m, cliente);
                        dispararMensagemWhatsAppAutonoma({
                            telefone: cliente.telefone,
                            clienteNome: cliente.nome,
                            motoPlaca: m.placa,
                            motoModelo: m.modelo,
                            tipo: oleo.atingiuBloqueioKm ? 'bloqueio_km' : 'oleo_aviso',
                            mensagem: msgOleoAuto
                        });
                    }
                }
            }
        }
    });

    // 2. Régua Automática por Contrato Ativo: Notificação às 08:00h e Bloqueio às 18:00h se não pago
    contratos.forEach(c => {
        if (c.status !== 'ativo') return;
        const cli = clientes.find(x => x.id === c.clienteId) || { nome: 'Locatário', telefone: '' };
        const mIdx = motos.findIndex(x => x.id === c.motoId);
        if (mIdx === -1) return;
        const moto = motos[mIdx];
        const vInfo = getInfoVencimentoContrato(c);
        const valSemanal = parseFloat(c.valorSemanal || (parseFloat(moto.valor || 0) * 7) || 0).toFixed(2);

        if (vInfo.diffDays === null) return;

        // Se vence hoje ou está atrasado, garante que a cobrança PIX Mercado Pago já esteja pronta
        if (vInfo.diffDays <= 0) {
            if (!c.pixCobrancaAtual || c.pixCobrancaAtual.vencimento !== c.dataProxVenc) {
                garantirCobrancaPixLocalNoContrato(c, cli, moto);
                mudouContratos = true;
            }
            // Consulta automaticamente na API se o PIX já foi aprovado para liberar a moto sozinho
            if (cfgMp.autoDesbloquearPix !== false) {
                consultarStatusPixNoServidorMp(c.id);
            }
        }

        // REGRA 08:00 DA MANHÃ DO DIA DO PAGAMENTO: Notifica o usuário com aviso de bloqueio até as 18:00h
        if (cfgMp.autoNotificar08h !== false && ((vInfo.diffDays === 0 && minutosAgora >= minutos08h) || vInfo.diffDays < 0)) {
            if (c.notificado08hVencRef !== c.dataProxVenc) {
                c.notificado08hVencRef = c.dataProxVenc;
                c.notificado08hEm = new Date().toISOString();
                mudouContratos = true;
                qtdNotificados08h++;

                mostrarToastNotificacao({
                    titulo: `☀️ Notificação 08:00h Disparada — ${cli.nome}`,
                    mensagem: `Cobrança semanal (R$ ${valSemanal}) da moto ${moto.placa} gerada via PIX Mercado Pago com aviso de bloqueio automático às ${cfgMp.horaBloqueio || '18:00'}h!`,
                    cor: '#009ee3',
                    icone: 'fa-bell',
                    duracao: 8500
                });

                if ('Notification' in window && Notification.permission === 'granted') {
                    try {
                        new Notification(`☀️ Cobrança 08:00h — ${cli.nome} (${moto.placa})`, {
                            body: `Aluguel R$ ${valSemanal} vence hoje. Aviso de bloqueio automático às ${cfgMp.horaBloqueio || '18:00'}h ativo.`
                        });
                    } catch (e) {}
                }

                // Disparo 100% autônomo via API Oficial WhatsApp sem intervenção humana (08:00h)
                if (cli.telefone) {
                    const msg08hAuto = montarTextoNotificacao08hUsuario(c, cli, moto);
                    dispararMensagemWhatsAppAutonoma({
                        telefone: cli.telefone,
                        clienteNome: cli.nome,
                        motoPlaca: moto.placa,
                        motoModelo: moto.modelo,
                        tipo: 'cobranca_08h',
                        mensagem: msg08hAuto,
                        pixCopiaECola: c.pixCobrancaAtual?.copiaECola || ''
                    });
                }
            }
        }

        // REGRA 18:00H: Se o aluguel da semana não for pago até as 18:00h (ou estiver vencido), BLOQUEIA A MOTO AUTOMATICAMENTE!
        const passouDas18hNoVencimento = (vInfo.diffDays === 0 && minutosAgora >= minutos18h) || (vInfo.diffDays < 0);
        if (cfgMp.autoBloquear18h !== false && passouDas18hNoVencimento) {
            const jaBloqueadaPorInad = moto.rastreadorBloqueado === true && moto.bloqueadoPorInadimplencia === true;
            if (!jaBloqueadaPorInad) {
                moto.rastreadorBloqueado = true;
                moto.bloqueadoPorInadimplencia = true;
                moto.contratoBloqueadoId = c.id;
                moto.motivoBloqueioAutomatico = vInfo.diffDays === 0
                    ? `BLOQUEIO AUTOMÁTICO 18:00H: Aluguel semanal não pago até as ${cfgMp.horaBloqueio || '18:00'}h (Só libera após confirmação PIX)`
                    : `BLOQUEIO AUTOMÁTICO POR INADIMPLÊNCIA: Aluguel vencido em ${formatarDataBr(c.dataProxVenc)} (Só libera após confirmação PIX)`;
                moto.rastreadorUltimaSync = new Date().toISOString();
                motos[mIdx] = moto;
                mudouMotos = true;

                c.bloqueado18hVencRef = c.dataProxVenc;
                c.bloqueado18hEm = new Date().toISOString();
                mudouContratos = true;
                qtdBloqueados18h++;

                // Envia comando de bloqueio remoto para o bloqueador da moto (App Xtrack / Chip IoT)
                fetch('/api/telemetry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'command_block',
                        id: moto.rastreadorImei || '00018E1B',
                        placa: moto.placa,
                        bloquear: true,
                        motivo: moto.motivoBloqueioAutomatico,
                        xtrackEmail: cfgTracker.xtrackEmail || '',
                        xtrackSenha: cfgTracker.xtrackSenha || ''
                    })
                }).catch(() => {});

                mostrarToastNotificacao({
                    titulo: `🛑 BLOQUEIO AUTOMÁTICO 18:00H (${moto.placa} — ${cli.nome})`,
                    mensagem: `O aluguel semanal (R$ ${valSemanal}) não foi confirmado até as ${cfgMp.horaBloqueio || '18:00'}h. Comando de BLOQUEIO enviado automaticamente ao bloqueador da moto! Só libera após confirmação do PIX.`,
                    cor: '#dc2626',
                    icone: 'fa-lock',
                    duracao: 10000
                });

                if ('Notification' in window && Notification.permission === 'granted') {
                    try {
                        new Notification(`🛑 MOTO BLOQUEADA ÀS 18:00H (${moto.placa})`, {
                            body: `${cli.nome} não confirmou o PIX até as 18:00h. Bloqueio enviado ao bloqueador da moto!`
                        });
                    } catch (e) {}
                }

                // Disparo 100% autônomo de bloqueio + PIX via API Oficial do WhatsApp sem intervenção humana (18:00h)
                if (cli.telefone) {
                    const msg18hAuto = montarTextoNotificacaoBloqueio18hUsuario(c, cli, moto);
                    dispararMensagemWhatsAppAutonoma({
                        telefone: cli.telefone,
                        clienteNome: cli.nome,
                        motoPlaca: moto.placa,
                        motoModelo: moto.modelo,
                        tipo: 'bloqueio_18h',
                        mensagem: msg18hAuto,
                        pixCopiaECola: c.pixCobrancaAtual?.copiaECola || ''
                    });
                }
            }
        }
    });

    if (mudouContratos) saveDb('crm_contratos', contratos);
    if (mudouMotos) saveDb('crm_motos', motos);
    if (mudouContratos || mudouMotos) updateViews();

    if (exibirResumoManual) {
        const motosBloqInad = motos.filter(m => m.bloqueadoPorInadimplencia).map(m => `${m.modelo} (${m.placa})`);
        alert(
            `⚡ Verificação da Régua Automática (08:00h / 18:00h + Óleo) concluída!\n\n` +
            `• Horário atual do sistema: ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\n` +
            `• Notificações das 08:00h disparadas agora: ${qtdNotificados08h}\n` +
            `• Novos bloqueios automáticos das 18:00h aplicados agora: ${qtdBloqueados18h}\n` +
            `• Motos atualmente bloqueadas aguardando confirmação PIX: ${motosBloqInad.length > 0 ? motosBloqInad.join(', ') : 'Nenhuma'}\n` +
            `• Motos com alerta individual de óleo (1.000/1.100 km): ${qtdAlertasOleo}`
        );
    }
}

function executarReguaCompletaManual() {
    verificarReguaAutomaticaPagamentosEBloqueio18h(true);
}

function abrirModalConfirmarPagamento(contratoId) {
    const contratos = getDb('crm_contratos');
    const contrato = contratos.find(c => c.id === contratoId);
    if (!contrato) return;

    const clientes = getDb('crm_clientes');
    const motos = getDb('crm_motos');
    const cli = clientes.find(x => x.id === contrato.clienteId) || { nome: 'Locatário', telefone: '' };
    const moto = motos.find(x => x.id === contrato.motoId) || { modelo: 'Moto', placa: '-', valor: 0 };

    const valSemanal = parseFloat(contrato.valorSemanal || (parseFloat(moto.valor || 0) * 7) || 0).toFixed(2);
    const hojeIso = new Date().toISOString().split('T')[0];

    const baseDateStr = contrato.dataProxVenc || hojeIso;
    const proxDate = new Date(baseDateStr + 'T00:00:00');
    proxDate.setDate(proxDate.getDate() + 7);
    const novoVencIso = proxDate.toISOString().split('T')[0];

    document.getElementById('pag-modal-contrato-id').value = contrato.id;
    document.getElementById('pag-modal-resumo-cliente').innerText = `👤 Locatário: ${cli.nome} (${cli.telefone || 'S/N'})`;
    document.getElementById('pag-modal-resumo-moto').innerText = `🏍️ Moto: ${moto.modelo} • Placa: ${moto.placa} • Vencimento Atual: ${formatarDataBr(contrato.dataProxVenc)}`;
    document.getElementById('pag-modal-valor').value = valSemanal;
    document.getElementById('pag-modal-forma').value = contrato.formaPagamento || 'PIX';
    document.getElementById('pag-modal-data-pagamento').value = hojeIso;
    document.getElementById('pag-modal-novo-vencimento').value = novoVencIso;
    document.getElementById('pag-modal-obs').value = `Aluguel semanal ref. vencimento ${formatarDataBr(contrato.dataProxVenc)}`;

    openModal('modal-confirmar-pagamento');
}

function confirmarBaixaPagamentoSemanal(e) {
    e.preventDefault();
    const contratoId = document.getElementById('pag-modal-contrato-id').value;
    const valorPago = parseFloat(document.getElementById('pag-modal-valor').value) || 0;
    const formaPag = document.getElementById('pag-modal-forma').value || 'PIX';
    const dataPagamento = document.getElementById('pag-modal-data-pagamento').value;
    const novoVencimento = document.getElementById('pag-modal-novo-vencimento').value;
    const obs = document.getElementById('pag-modal-obs').value.trim();

    let contratos = getDb('crm_contratos');
    const cIdx = contratos.findIndex(c => c.id === contratoId);
    if (cIdx === -1) return;

    const clientes = getDb('crm_clientes');
    let motos = getDb('crm_motos');
    const cli = clientes.find(x => x.id === contratos[cIdx].clienteId) || { nome: 'Locatário', telefone: '' };
    const mIdx = motos.findIndex(x => x.id === contratos[cIdx].motoId);
    const moto = mIdx > -1 ? motos[mIdx] : { modelo: 'Moto', placa: '-' };

    const vencAnterior = contratos[cIdx].dataProxVenc;
    contratos[cIdx].dataProxVenc = novoVencimento;
    contratos[cIdx].formaPagamento = formaPag;
    contratos[cIdx].pixCobrancaAtual = null;
    contratos[cIdx].bloqueado18hVencRef = '';
    saveDb('crm_contratos', contratos);

    // Se a moto estava bloqueada por inadimplência das 18:00h, desbloqueia automaticamente após confirmação do pagamento!
    let desbloqueouAuto = false;
    if (mIdx > -1) {
        const estavaBloq = motos[mIdx].rastreadorBloqueado === true || motos[mIdx].bloqueadoPorInadimplencia === true;
        motos[mIdx].bloqueadoPorInadimplencia = false;
        motos[mIdx].contratoBloqueadoId = '';
        if (!motos[mIdx].bloqueadoPorKmOleo) {
            motos[mIdx].rastreadorBloqueado = false;
            motos[mIdx].motivoBloqueioAutomatico = '';
            if (estavaBloq) {
                desbloqueouAuto = true;
                const cfgTracker = getTrackerConfig();
                fetch('/api/telemetry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'command_block',
                        id: motos[mIdx].rastreadorImei || '00018E1B',
                        placa: motos[mIdx].placa,
                        bloquear: false,
                        motivo: 'Pagamento Semanal PIX Confirmado — Desbloqueio Automático',
                        xtrackEmail: cfgTracker.xtrackEmail || '',
                        xtrackSenha: cfgTracker.xtrackSenha || ''
                    })
                }).catch(() => {});
            }
        }
        saveDb('crm_motos', motos);
    }

    const novoPag = {
        id: generateId(),
        contratoId: contratoId,
        clienteId: cli.id || '',
        clienteNome: cli.nome,
        clienteTelefone: cli.telefone || '',
        motoId: moto.id || '',
        motoModelo: moto.modelo,
        motoPlaca: moto.placa,
        valor: valorPago.toFixed(2),
        formaPagamento: formaPag,
        dataPagamento: dataPagamento,
        vencimentoAnterior: vencAnterior,
        novoVencimento: novoVencimento,
        obs: (obs || 'Pagamento semanal confirmado') + (desbloqueouAuto ? ' • Moto desbloqueada automaticamente' : ''),
        criadoEm: new Date().toISOString()
    };

    let pagamentos = getDb('crm_pagamentos');
    pagamentos.push(novoPag);
    saveDb('crm_pagamentos', pagamentos);

    closeModal('modal-confirmar-pagamento');
    updateViews();

    mostrarToastNotificacao({
        titulo: desbloqueouAuto
            ? `🔓 Pagamento Confirmado & Moto Desbloqueada (${moto.placa})`
            : `💰 Pagamento Confirmado (${moto.placa})`,
        mensagem: `Recebido R$ ${valorPago.toFixed(2)} de ${cli.nome}. Próximo vencimento: ${formatarDataBr(novoVencimento)}.${desbloqueouAuto ? ' Comando de DESBLOQUEIO enviado ao bloqueador da moto!' : ''}`,
        cor: '#10b981',
        icone: desbloqueouAuto ? 'fa-unlock' : 'fa-sack-dollar'
    });
}

function enviarReciboPagamentoWhats(pagamentoId) {
    const pagamentos = getDb('crm_pagamentos');
    const p = pagamentos.find(x => x.id === pagamentoId);
    if (!p) return;

    const numWhats = (p.clienteTelefone || '').replace(/\D/g, '');
    if (!numWhats) {
        alert('Este cliente não possui telefone/WhatsApp cadastrado.');
        return;
    }

    const msg = `✅ *RECIBO DE PAGAMENTO SEMANAL — FACILITA MOTO*\n\n` +
                `👤 *Locatário:* ${p.clienteNome}\n` +
                `🏍️ *Motocicleta:* ${p.motoModelo} (Placa: ${p.motoPlaca})\n` +
                `💰 *Valor Pago:* R$ ${parseFloat(p.valor || 0).toFixed(2)}\n` +
                `💳 *Forma de Pagamento:* ${p.formaPagamento}\n` +
                `📅 *Data do Recebimento:* ${formatarDataBr(p.dataPagamento)}\n` +
                `📆 *Próximo Vencimento:* ${formatarDataBr(p.novoVencimento)}\n` +
                `🔓 *Status Bloqueador:* Motocicleta Liberada\n\n` +
                `Obrigado pela pontualidade! Bons negócios e pilote com segurança.`;

    const cfgWa = getWhatsAppConfig();
    const temApiWa = !!(cfgWa.metaToken || cfgWa.gatewayUrl);

    dispararMensagemWhatsAppAutonoma({
        telefone: p.clienteTelefone,
        clienteNome: p.clienteNome,
        motoPlaca: p.motoPlaca,
        motoModelo: p.motoModelo,
        tipo: 'desbloqueio_pix',
        mensagem: msg
    }).then(res => {
        if (res && res.success) {
            mostrarToastNotificacao({
                titulo: `🤖 Recibo Enviado via WhatsApp (${p.clienteNome})`,
                mensagem: `Recibo disparado sem intervenção humana via API Oficial!`,
                cor: '#16a34a',
                icone: 'fa-robot'
            });
        }
    });

    if (!temApiWa) {
        window.open(`https://wa.me/55${numWhats}?text=${encodeURIComponent(msg)}`, '_blank');
    }
}

function deletarPagamentoHistorico(pagamentoId) {
    if (!confirm('Deseja excluir este registro do histórico de pagamentos?')) return;
    let pagamentos = getDb('crm_pagamentos');
    pagamentos = pagamentos.filter(p => p.id !== pagamentoId);
    localStorage.setItem('crm_pagamentos', JSON.stringify(pagamentos));
    if (!window.isFirebaseSyncing && window.db) {
        window.db.collection('crm_pagamentos').doc(pagamentoId).delete();
    }
    updateViews();
}

// =========================================================================
// MODULE: CENTRAL DE NOTIFICAÇÕES (PAGAMENTOS 08H/18H, ÓLEO 1.000 KM & BLOQUEIO 1.100 KM)
// =========================================================================
function coletarListaNotificacoesAtivas() {
    const notificacoes = [];
    const motos = getDb('crm_motos');
    const contratos = getDb('crm_contratos');
    const clientes = getDb('crm_clientes');
    const cfgMp = getMercadoPagoConfig();

    // 1. Alertas de Violação da Bateria, Bloqueio por Inadimplência (18h) ou Bloqueio por 1.100 km nas Motos
    motos.forEach(m => {
        const { contrato, cliente } = getCondutorContratoAtivo(m.id, contratos, clientes);
        const nomeCond = cliente ? cliente.nome : 'No Pátio';
        const oleo = getMotoOleoInfo(m);

        if (m.rastreadorImei && m.rastreadorBateriaRemovida) {
            notificacoes.push({
                id: `bat_${m.id}`,
                prioridade: 1,
                tipo: 'rastreador',
                cor: '#dc2626',
                bg: '#fef2f2',
                icone: 'fa-car-battery',
                titulo: `🚨 CABO DA BATERIA REMOVIDO (${m.placa})`,
                descricao: `${m.modelo} (${nomeCond}) teve a alimentação 12V cortada! Rastreador operando na bateria backup.`,
                acaoTexto: 'Abrir Rastreador',
                acaoFn: `abrirPainelRastreadorMoto('${m.id}')`
            });
        }

        if (m.bloqueadoPorInadimplencia) {
            notificacoes.push({
                id: `bloq_inad_${m.id}`,
                prioridade: 1,
                tipo: 'bloqueio_18h',
                cor: '#991b1b',
                bg: '#fef2f2',
                icone: 'fa-lock',
                titulo: `🛑 MOTO BLOQUEADA ÀS 18:00H POR FALTA DE PIX (${m.placa})`,
                descricao: `${m.modelo} (${nomeCond}) foi bloqueada automaticamente porque o aluguel semanal não foi pago até as ${cfgMp.horaBloqueio || '18:00'}h. Só libera após confirmação do PIX!`,
                acaoTexto: 'Abrir PIX Mercado Pago & Liberar',
                acaoFn: contrato ? `abrirModalPixMercadoPago('${contrato.id}')` : `navegarParaView('pagamentos')`
            });
        }

        if (oleo.atingiuBloqueioKm || m.bloqueadoPorKmOleo) {
            notificacoes.push({
                id: `bloq_km_${m.id}`,
                prioridade: 1,
                tipo: 'bloqueio_km',
                cor: '#991b1b',
                bg: '#fef2f2',
                icone: 'fa-lock',
                titulo: `🛑 BLOQUEIO POR KM ATIVADO — 1.100 KM (${m.placa})`,
                descricao: `${m.modelo} (${nomeCond}) rodou ${oleo.kmRodadosCiclo} km sem troca de óleo (${oleo.kmAtual} km). Bloqueio enviado ao rastreador para proteger o motor!`,
                acaoTexto: 'Registrar Troca & Liberar',
                acaoFn: `abrirModalTrocaOleo('${m.id}')`
            });
        } else if (oleo.status === 'vencido') {
            notificacoes.push({
                id: `oleo_venc_${m.id}`,
                prioridade: 2,
                tipo: 'oleo',
                cor: '#dc2626',
                bg: '#fff1f2',
                icone: 'fa-oil-can',
                titulo: `🛢️ TROCA DE ÓLEO VENCIDA (${m.placa}) — ${nomeCond}`,
                descricao: `${m.modelo} atingiu ${oleo.kmAtual} km (Troca: ${oleo.kmProximaTroca} km). Bloqueio automático em ${Math.max(0, oleo.kmRestantesBloqueio)} km (${oleo.kmBloqueioMotor} km)!`,
                acaoTexto: 'Notificar / Registrar Troca',
                acaoFn: `abrirModalTrocaOleo('${m.id}')`
            });
        } else if (oleo.status === 'aviso') {
            notificacoes.push({
                id: `oleo_aviso_${m.id}`,
                prioridade: 4,
                tipo: 'oleo',
                cor: '#d97706',
                bg: '#fffbeb',
                icone: 'fa-oil-can',
                titulo: `⚠️ Troca de Óleo Próxima (${m.placa}) — ${nomeCond}`,
                descricao: `Faltam ${oleo.kmRestantes} km para a revisão de 1.000 km da moto ${m.modelo} (${nomeCond}).`,
                acaoTexto: 'Notificar Condutor',
                acaoFn: `notificarUsuarioIndividualOleo('${m.id}')`
            });
        }
    });

    // 2. Alertas de Pagamentos Semanais (Atrasados, Vencendo Hoje c/ Regra 08h/18h ou em até 2 dias)
    contratos.filter(c => c.status === 'ativo').forEach(c => {
        const cli = clientes.find(x => x.id === c.clienteId) || { nome: 'Locatário' };
        const moto = motos.find(x => x.id === c.motoId) || { modelo: 'Moto', placa: '-', valor: 0 };
        const vInfo = getInfoVencimentoContrato(c);
        const valSemanal = parseFloat(c.valorSemanal || (parseFloat(moto.valor || 0) * 7) || 0).toFixed(2);

        if (vInfo.diffDays !== null) {
            if (vInfo.diffDays < 0) {
                notificacoes.push({
                    id: `pag_atraso_${c.id}`,
                    prioridade: 2,
                    tipo: 'pagamento',
                    cor: '#dc2626',
                    bg: '#fef2f2',
                    icone: 'fa-qrcode',
                    titulo: `💰 PAGAMENTO ATRASADO (${Math.abs(vInfo.diffDays)}d) — ${cli.nome}`,
                    descricao: `Moto ${moto.modelo} (${moto.placa}) • R$ ${valSemanal} • Venceu em ${vInfo.texto}. Bloqueio automático 18h ativo até confirmação do PIX!`,
                    acaoTexto: 'Abrir PIX Mercado Pago',
                    acaoFn: `abrirModalPixMercadoPago('${c.id}')`
                });
            } else if (vInfo.diffDays === 0) {
                notificacoes.push({
                    id: `pag_hoje_${c.id}`,
                    prioridade: 3,
                    tipo: 'pagamento',
                    cor: '#009ee3',
                    bg: '#f0f9ff',
                    icone: 'fa-clock',
                    titulo: `☀️ VENCE HOJE (Aviso 08:00h / Bloqueio 18:00h) — ${cli.nome}`,
                    descricao: `Moto ${moto.modelo} (${moto.placa}) • R$ ${valSemanal}. Se não pagar o PIX até as ${cfgMp.horaBloqueio || '18:00'}h, a moto é bloqueada automaticamente!`,
                    acaoTexto: 'Enviar PIX 08h / Confirmar',
                    acaoFn: `abrirModalPixMercadoPago('${c.id}')`
                });
            } else if (vInfo.diffDays <= 2) {
                notificacoes.push({
                    id: `pag_prox_${c.id}`,
                    prioridade: 5,
                    tipo: 'pagamento',
                    cor: '#2563eb',
                    bg: '#eff6ff',
                    icone: 'fa-calendar-day',
                    titulo: `📅 Aluguel Vence em ${vInfo.diffDays} dia(s) — ${cli.nome}`,
                    descricao: `Moto ${moto.modelo} (${moto.placa}) • R$ ${valSemanal} • Vencimento: ${vInfo.texto} (Notificação programada p/ 08:00h).`,
                    acaoTexto: 'Ver Pagamentos',
                    acaoFn: `navegarParaView('pagamentos')`
                });
            }
        }
    });

    return notificacoes.sort((a, b) => a.prioridade - b.prioridade);
}

function atualizarCentralNotificacoes() {
    const lista = coletarListaNotificacoesAtivas();
    const badgeEl = document.getElementById('topbar-notif-badge');
    const containerEl = document.getElementById('lista-notificacoes-container');
    const btnSino = document.getElementById('btn-sino-notificacoes');

    if (badgeEl) {
        if (lista.length > 0) {
            badgeEl.style.display = 'inline-block';
            badgeEl.innerText = lista.length;
            const temCritico = lista.some(n => n.prioridade <= 2);
            badgeEl.style.background = temCritico ? '#ef4444' : '#f59e0b';
            if (btnSino) btnSino.style.borderColor = temCritico ? '#fca5a5' : '#fde68a';
        } else {
            badgeEl.style.display = 'none';
            if (btnSino) btnSino.style.borderColor = 'var(--border)';
        }
    }

    if (containerEl) {
        if (lista.length === 0) {
            containerEl.innerHTML = `
                <div style="padding:28px 16px; text-align:center; color:var(--text-muted);">
                    <i class="fa-solid fa-circle-check" style="font-size:2rem; color:#10b981; margin-bottom:8px; display:block;"></i>
                    <strong>Tudo em dia na frota!</strong><br>
                    <span style="font-size:0.8rem;">Nenhum pagamento atrasado, troca de óleo vencida ou bloqueio pendente.</span>
                </div>
            `;
        } else {
            containerEl.innerHTML = lista.map(n => `
                <div style="padding:12px 14px; border-bottom:1px solid var(--border); background:${n.bg}; display:flex; gap:12px; align-items:flex-start;">
                    <div style="width:34px; height:34px; border-radius:8px; background:${n.cor}; color:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:0.95rem;">
                        <i class="fa-solid ${n.icone}"></i>
                    </div>
                    <div style="flex:1; min-width:0;">
                        <strong style="font-size:0.83rem; color:#0f172a; display:block; margin-bottom:2px;">${n.titulo}</strong>
                        <p style="font-size:0.77rem; color:#334155; margin:0 0 8px 0; line-height:1.35;">${n.descricao}</p>
                        <button type="button" class="btn btn-primary btn-sm" style="padding:3px 9px; font-size:0.72rem; background:${n.cor}; border:none;" onclick="document.getElementById('painel-notificacoes-dropdown').style.display='none'; ${n.acaoFn}">
                            ${n.acaoTexto} <i class="fa-solid fa-arrow-right" style="font-size:0.65rem;"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }
    }
}

function togglePainelNotificacoes(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('painel-notificacoes-dropdown');
    if (!dropdown) return;
    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        atualizarCentralNotificacoes();
    }
}

document.addEventListener('click', function(e) {
    const wrap = document.getElementById('topbar-notif-wrap');
    const dropdown = document.getElementById('painel-notificacoes-dropdown');
    if (dropdown && dropdown.style.display === 'block' && wrap && !wrap.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

function mostrarToastNotificacao({ titulo, mensagem, cor = '#0284c7', icone = 'fa-bell', duracao = 7000 }) {
    const container = document.getElementById('toast-notif-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.style.cssText = `background:#0f172a; color:#fff; border-left:5px solid ${cor}; border-radius:10px; padding:12px 14px; box-shadow:0 12px 28px rgba(15,23,42,0.35); display:flex; gap:10px; align-items:flex-start; pointer-events:auto; font-size:0.82rem; animation:fadeIn 0.25s ease;`;
    toast.innerHTML = `
        <i class="fa-solid ${icone}" style="color:${cor}; font-size:1.1rem; margin-top:2px;"></i>
        <div style="flex:1;">
            <strong style="display:block; font-size:0.85rem; margin-bottom:2px;">${titulo}</strong>
            <span style="color:#cbd5e1; font-size:0.78rem; line-height:1.35; display:block;">${mensagem}</span>
        </div>
        <span style="cursor:pointer; color:#94a3b8; font-weight:700;" onclick="this.parentElement.remove()">&times;</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        if (toast && toast.parentElement) toast.remove();
    }, duracao);
}

function ativarNotificacoesNavegador() {
    if (!('Notification' in window)) {
        alert('Este navegador não suporta notificações nativas, mas os alertas visuais no painel já estão ativos!');
        return;
    }
    Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
            new Notification('🔔 FACILITA MOTO — Automação 08h / 18h Ativada!', {
                body: 'Notificações de cobrança semanal PIX Mercado Pago (08:00h), bloqueio automático (18:00h) e troca de óleo (1.000/1.100 km) ativas!'
            });
            mostrarToastNotificacao({
                titulo: '🔔 Alertas Ativados no Aparelho',
                mensagem: 'As notificações automáticas de pagamentos PIX (08:00h/18:00h), óleo (1.000 km) e bloqueio (1.100 km) estão ativas.',
                cor: '#10b981',
                icone: 'fa-bell'
            });
        }
    });
}

function dispararAlertasAutomaticosSessao() {
    if (window._jaDisparouAlertasIniciais) return;
    window._jaDisparouAlertasIniciais = true;

    verificarReguaAutomaticaPagamentosEBloqueio18h(false);

    const lista = coletarListaNotificacoesAtivas();
    const criticos = lista.filter(n => n.prioridade <= 3).slice(0, 3);
    criticos.forEach((n, idx) => {
        setTimeout(() => {
            mostrarToastNotificacao({
                titulo: n.titulo,
                mensagem: n.descricao,
                cor: n.cor,
                icone: n.icone,
                duracao: 8500
            });
        }, 900 + (idx * 1200));
    });
}

// ==========================================
// CENTRAL UPDATE SYSTEM
// ==========================================
function updateViews() {
    renderDashboard();
    renderClientes();
    renderPipeline();
    renderFrota();
    renderOleoView();
    renderPagamentosView();
    renderContratos();
    renderUsuarios();
    populateContratoSelects();
    atualizarCentralNotificacoes();
}

function iniciarMonitoramentoAutonomoFrotaIot() {
    const verificarFrota = () => {
        const motos = getDb('crm_motos');
        motos.forEach(m => {
            verificarEAplicarBloqueioAutomaticoPorKm(m, true);
        });

        // Executa de forma autônoma a régua das 08:00h (notificação PIX) e 18:00h (bloqueio automático s/ PIX + desbloqueio pós-PIX)
        verificarReguaAutomaticaPagamentosEBloqueio18h(false);

        const motoIpu = motos.find(m => (m.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === 'IPU2I57' || m.rastreadorImei === '00018E1B');
        if (!motoIpu) return;

        // Consulta pacote mais recente na API de telemetria M2M / App Xtrack
        sincronizarTelemetriaAutonomaMoto(motoIpu.id, true);

        // Se a moto IPU2I57 ainda não possui coordenada salva, tenta localizar de forma autônoma pelo endereço do cliente ou GPS
        if (!motoIpu.rastreadorLat || !motoIpu.rastreadorLng) {
            const { cliente } = getCondutorContratoAtivo(motoIpu.id, getDb('crm_contratos'), getDb('crm_clientes'));
            if (cliente && cliente.endereco && cliente.endereco.trim().length > 4) {
                fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(cliente.endereco)}&limit=1&countrycodes=br&accept-language=pt-BR`)
                    .then(r => r.json())
                    .then(results => {
                        if (results && results.length > 0) {
                            salvarPosicaoRealMotoNoMapa(motoIpu.id, parseFloat(results[0].lat), parseFloat(results[0].lon), results[0].display_name);
                            updateViews();
                        }
                    })
                    .catch(() => {});
            } else if (navigator.geolocation && !window._tentouGpsAutonomoInicial) {
                window._tentouGpsAutonomoInicial = true;
                navigator.geolocation.getCurrentPosition(
                    function(pos) {
                        consultarEnderecoReversoNominatim(motoIpu.id, pos.coords.latitude, pos.coords.longitude);
                    },
                    function() {},
                    { enableHighAccuracy: true, timeout: 6000 }
                );
            }
        }
    };

    setTimeout(verificarFrota, 1200);
    setInterval(verificarFrota, 6000);
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    const foroDataEl = document.getElementById('gov-foro-data');
    if (foroDataEl && !foroDataEl.value) {
        foroDataEl.value = formatarDataBr(new Date().toISOString().split('T')[0]);
    }
    atualizarPreviewContratoGov();
    updateViews();
    iniciarMonitoramentoAutonomoFrotaIot();
    setTimeout(dispararAlertasAutomaticosSessao, 1500);
});

updateViews();

// ============================================================================
// SISTEMA DE ALERTA SONORO DE EMERGÊNCIA (ROUBO / FURTO) — FACILITA MOTO
// Escuta o robô do WhatsApp na nuvem e dispara sirene contínua e modal de ação
// ============================================================================
let _alarmeEmergenciaInterval = null;
let _alarmeEmergenciaAtivo = false;
const _alertasProcessadosIds = new Set();

function tocarSirenePolicial() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sawtooth';
        const now = ctx.currentTime;
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.linearRampToValueAtTime(1100, now + 0.35);
        osc.frequency.linearRampToValueAtTime(500, now + 0.7);
        osc.frequency.linearRampToValueAtTime(1100, now + 1.05);
        osc.frequency.linearRampToValueAtTime(500, now + 1.4);

        gain.gain.setValueAtTime(0.7, now);
        gain.gain.linearRampToValueAtTime(0.7, now + 1.3);
        gain.gain.linearRampToValueAtTime(0, now + 1.5);

        osc.start(now);
        osc.stop(now + 1.5);
    } catch (e) {
        console.warn('Erro ao reproduzir áudio Web Audio:', e);
    }
}

function iniciarSireneEmergencia(alertData) {
    if (_alarmeEmergenciaAtivo) return;
    _alarmeEmergenciaAtivo = true;

    tocarSirenePolicial();
    if (_alarmeEmergenciaInterval) clearInterval(_alarmeEmergenciaInterval);
    _alarmeEmergenciaInterval = setInterval(tocarSirenePolicial, 1800);

    exibirModalEmergenciaRoubo(alertData);
}

function silenciarSireneEmergencia(alertaId) {
    _alarmeEmergenciaAtivo = false;
    if (_alarmeEmergenciaInterval) {
        clearInterval(_alarmeEmergenciaInterval);
        _alarmeEmergenciaInterval = null;
    }
    const modal = document.getElementById('modal-alerta-roubo-furto');
    if (modal) modal.remove();

    try {
        fetch('https://facilita-whatsapp-bot.onrender.com/api/emergencies/dismiss', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: alertaId || '' })
        }).catch(() => {});
    } catch(e) {}
}

function exibirModalEmergenciaRoubo(alertData) {
    let modal = document.getElementById('modal-alerta-roubo-furto');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-alerta-roubo-furto';
        document.body.appendChild(modal);
    }

    const numLimpo = String(alertData.clienteTelefone || '').replace(/\D/g, '');
    const waLink = `https://wa.me/${numLimpo}`;

    modal.innerHTML = `
        <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.85); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; z-index:999999;">
            <div style="background:#1e293b; border:3px solid #ef4444; box-shadow:0 0 40px rgba(239,68,68,0.7); border-radius:18px; max-width:520px; width:92%; padding:28px 24px; text-align:center; color:#fff;">
                <div style="width:72px; height:72px; background:#7f1d1d; border:2px solid #ef4444; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; font-size:2.2rem; color:#fca5a5;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <h2 style="color:#f87171; font-size:1.4rem; font-weight:900; margin-bottom:6px; text-transform:uppercase; letter-spacing:1px;">
                    🚨 ALERTA CRÍTICO: ROUBO / FURTO!
                </h2>
                <p style="color:#cbd5e1; font-size:0.9rem; margin-bottom:18px;">
                    Um condutor acabou de acionar o canal de emergência pelo WhatsApp da Facilita Moto!
                </p>

                <div style="background:#0f172a; border:1px solid #334155; border-radius:12px; padding:16px; text-align:left; margin-bottom:20px; font-size:0.88rem; line-height:1.6;">
                    <div style="margin-bottom:6px;"><strong>👤 Cliente:</strong> <span style="color:#38bdf8;">${alertData.clienteNome || 'Cliente'}</span></div>
                    <div style="margin-bottom:6px;"><strong>📱 Telefone:</strong> <span style="color:#34d399;">${alertData.clienteTelefone || 'WhatsApp'}</span></div>
                    <div style="margin-bottom:6px;"><strong>⏰ Horário:</strong> <span style="color:#fbbf24;">${alertData.hora || 'Agora'}</span></div>
                    <div><strong>💬 Mensagem:</strong> <span style="color:#f1f5f9;">"${alertData.mensagem || 'Roubo ou Furto'}"</span></div>
                </div>

                <div style="display:flex; flex-direction:column; gap:10px;">
                    <a href="${waLink}" target="_blank" class="btn" style="background:#16a34a; color:#fff; padding:14px; border-radius:10px; font-weight:800; font-size:1rem; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:8px;">
                        <i class="fa-brands fa-whatsapp" style="font-size:1.3rem;"></i> FALAR COM O CLIENTE AGORA
                    </a>
                    <button type="button" class="btn" onclick="navegarParaView('rastreamento'); silenciarSireneEmergencia('${alertData.id}');" style="background:#2563eb; color:#fff; padding:12px; border-radius:10px; font-weight:700; font-size:0.92rem; border:none; cursor:pointer;">
                        <i class="fa-solid fa-satellite-dish"></i> ABRIR RASTREADOR XTRACK / BLOQUEIO
                    </button>
                    <button type="button" class="btn" onclick="silenciarSireneEmergencia('${alertData.id}')" style="background:#334155; color:#94a3b8; padding:10px; border-radius:10px; font-weight:600; font-size:0.85rem; border:none; cursor:pointer;">
                        <i class="fa-solid fa-volume-xmark"></i> Silenciar Alarme Sonoro
                    </button>
                </div>
            </div>
        </div>
    `;
}

function iniciarMonitoramentoEmergenciasWhatsApp() {
    setInterval(async () => {
        try {
            const res = await fetch('https://facilita-whatsapp-bot.onrender.com/api/emergencies');
            if (!res.ok) return;
            const data = await res.json();
            const alerts = data.alerts || [];

            if (alerts.length > 0) {
                const latest = alerts[0];
                if (!_alertasProcessadosIds.has(latest.id)) {
                    _alertasProcessadosIds.add(latest.id);
                    iniciarSireneEmergencia(latest);
                }
            }
        } catch (e) {}
    }, 4000);
}

iniciarMonitoramentoEmergenciasWhatsApp();
