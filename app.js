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
        ['crm_clientes', 'crm_motos', 'crm_contratos', 'crm_admins'].forEach(col => {
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
    ['crm_clientes', 'crm_motos', 'crm_contratos', 'crm_admins'].forEach(colName => {
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
        provedor: 'traccar',
        url: 'https://api.rastreador.facilitamoto.com.br/v1/telemetry',
        token: '',
        intervaloOleo: 1000,
        avisoAntecipado: 150,
        autoKm: true
    };
    try {
        const saved = JSON.parse(localStorage.getItem('crm_tracker_config'));
        return saved ? Object.assign({}, def, saved) : def;
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
        document.getElementById('cfg-gps-provedor').value = cfg.provedor || 'traccar';
        document.getElementById('cfg-gps-url').value = cfg.url || '';
        document.getElementById('cfg-gps-token').value = cfg.token || '';
        document.getElementById('cfg-gps-intervalo-oleo').value = cfg.intervaloOleo || 1000;
        document.getElementById('cfg-gps-aviso-antecipado').value = cfg.avisoAntecipado || 150;
        document.getElementById('cfg-gps-auto-km').checked = cfg.autoKm !== false;
    }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
}

// ==========================================
// HELPERS: TROCA DE ÓLEO (1.000 KM) & RASTREADOR
// ==========================================
function getMotoOleoInfo(moto) {
    const cfg = getTrackerConfig();
    const intervalo = parseInt(cfg.intervaloOleo) || 1000;
    const avisoAntecipado = parseInt(cfg.avisoAntecipado) || 150;

    const kmAtual = parseInt(moto.kmAtual) || 0;
    const kmUltimaTroca = parseInt(moto.kmUltimaTroca) || 0;
    const kmProximaTroca = parseInt(moto.kmProximaTroca) || (kmUltimaTroca + intervalo);

    const kmRodadosCiclo = Math.max(0, kmAtual - kmUltimaTroca);
    const kmRestantes = kmProximaTroca - kmAtual;
    const percentual = Math.min(100, Math.max(0, Math.round((kmRodadosCiclo / intervalo) * 100)));

    let status = 'ok'; // ok, aviso, vencido
    let label = `Em dia (Faltam ${kmRestantes} km)`;
    let cor = 'var(--success)';
    let badgeBg = '#d1fae5';
    let badgeColor = '#065f46';

    if (kmAtual >= kmProximaTroca || kmRodadosCiclo >= intervalo) {
        status = 'vencido';
        const excesso = Math.max(0, kmAtual - kmProximaTroca);
        label = excesso > 0 ? `TROCA VENCIDA (+${excesso} km)` : `TROCA IMEDIATA (1.000 km)`;
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
        kmRodadosCiclo,
        kmRestantes,
        percentual,
        intervalo,
        status,
        label,
        cor,
        badgeBg,
        badgeColor
    };
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
function renderDashboard() {
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
                            <strong style="color:var(--text-main); font-size:0.92rem;"><i class="fa-solid fa-user-check" style="color:var(--primary);"></i> ${cliente.nome}</strong> ${linkW}<br>
                            <span style="font-size:0.78rem; color:var(--text-muted);">Tel: ${cliente.telefone || 'S/N'} • <a href="#" onclick="abrirContratoNoEditorGov('${contrato.id}'); return false;" style="color:var(--primary); font-weight:600;">Ver Contrato Gov.br</a></span>
                        </div>
                    `;
                } else if (m.status === 'manutencao') {
                    locatarioHtml = `<span class="badge badge-manutencao"><i class="fa-solid fa-screwdriver-wrench"></i> Em Manutenção</span>`;
                } else {
                    locatarioHtml = `<span class="badge badge-disponivel"><i class="fa-solid fa-circle-check"></i> Disponível na Loja</span>`;
                }

                // Vencimento do Aluguel
                let vencimentoHtml = '<span style="color:var(--text-muted); font-size:0.82rem;">Moto sem contrato ativo</span>';
                if (contrato && contrato.status === 'ativo') {
                    const vInfo = getInfoVencimentoContrato(contrato);
                    vencimentoHtml = `
                        <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
                            ${vInfo.htmlBadge}
                            <div style="display:flex; gap:6px; align-items:center;">
                                <button class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:0.72rem; background:#10b981; color:#fff;" onclick="registrarPagamento('${contrato.id}')" title="Confirmar pagamento semanal (+7 dias)">
                                    <i class="fa-solid fa-sack-dollar"></i> +7 Dias
                                </button>
                                <span style="font-size:0.75rem; color:var(--text-muted);">Semanal: R$ ${parseFloat(contrato.valorSemanal || (m.valor * 7) || 0).toFixed(2)}</span>
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

                // Rastreador GPS (Pré-configurado)
                const isBloqueada = m.rastreadorBloqueado === true;
                const gpsPillClass = isBloqueada ? 'gps-blocked' : (m.rastreadorImei ? 'gps-online' : 'gps-preconfig');
                const gpsText = isBloqueada ? 'Bloqueada (Remoto)' : (m.rastreadorImei ? 'GPS Online • Ativo' : 'Pré-Configurado');
                const imeiInfo = m.rastreadorImei ? `IMEI: ${m.rastreadorImei}` : 'Aguardando vínculo IMEI';

                const rastreadorHtml = `
                    <div>
                        <span class="gps-pill ${gpsPillClass}">
                            <span class="gps-dot"></span> ${gpsText}
                        </span>
                        <div style="font-size:0.74rem; color:var(--text-muted); margin-top:4px;">
                            ${imeiInfo} ${m.rastreadorModelo ? `• ${m.rastreadorModelo}` : ''}
                        </div>
                    </div>
                `;

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
                            <button class="btn btn-primary btn-sm" onclick="abrirPainelRastreadorMoto('${m.id}')" title="Abrir Mapa, Telemetria e Bloqueio do Rastreador" style="background:#0284c7;">
                                <i class="fa-solid fa-location-crosshairs"></i> Rastrear
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="abrirModalTrocaOleo('${m.id}')" title="Registrar Troca de Óleo / Atualizar KM">
                                <i class="fa-solid fa-gauge-high"></i> KM
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="abrirEdicaoMoto('${m.id}')" title="Editar Moto / Configurar Rastreador">
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
    const kmUltima = parseInt(document.getElementById('moto-km-ultima-troca')?.value) || 0;
    const proxInput = document.getElementById('moto-km-proxima-troca');
    if (proxInput) {
        proxInput.value = kmUltima + intervalo;
    }
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

    const moto = {
        id: idObj || generateId(),
        placa: document.getElementById('moto-placa').value.toUpperCase(),
        cor: document.getElementById('moto-cor').value,
        modelo: document.getElementById('moto-modelo').value,
        ano: document.getElementById('moto-ano').value,
        renavam: document.getElementById('moto-renavam')?.value || '',
        chassi: document.getElementById('moto-chassi')?.value || '',
        valor: document.getElementById('moto-valor').value,
        status: document.getElementById('moto-status').value,
        foto: document.getElementById('moto-foto-base64').value,
        kmAtual: kmAtual,
        kmUltimaTroca: kmUltimaTroca,
        kmProximaTroca: kmProximaTroca,
        historicoOleo: oldMoto && oldMoto.historicoOleo ? oldMoto.historicoOleo : [],
        rastreadorImei: document.getElementById('moto-rastreador-imei')?.value || '',
        rastreadorChip: document.getElementById('moto-rastreador-chip')?.value || '',
        rastreadorModelo: document.getElementById('moto-rastreador-modelo')?.value || 'Traccar / GPS',
        rastreadorLink: document.getElementById('moto-rastreador-link')?.value || '',
        rastreadorBloqueado: oldMoto ? !!oldMoto.rastreadorBloqueado : false,
        rastreadorUltimaSync: oldMoto ? oldMoto.rastreadorUltimaSync : new Date().toISOString()
    };

    if (idObj) {
        motos = motos.map(m => m.id === idObj ? moto : m);

        if (moto.status === 'disponivel') {
            let contratos = getDb('crm_contratos');
            let contratoModificado = false;
            contratos = contratos.map(c => {
                if (c.motoId === idObj && c.status === 'ativo') {
                    c.status = 'encerrado';
                    c.fim = new Date().toISOString().split('T')[0];
                    contratoModificado = true;
                }
                return c;
            });
            if (contratoModificado) {
                saveDb('crm_contratos', contratos);
            }
        }
    } else {
        motos.push(moto);
    }

    saveDb('crm_motos', motos);
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
        let infoLocacao = `<span style="color:var(--text-muted); font-size:0.8rem;">Disponível no pátio</span>`;

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
                        </span><br>
                        <span style="font-size:0.76rem; color:var(--text-muted);">Vencimento: <strong>${vInfo.texto}</strong></span>
                    </div>
                `;
            }
        }
        if (m.status === 'manutencao') {
            badgeClass = 'badge-manutencao';
            statusLabel = 'Em Manutenção';
            infoLocacao = `<span style="font-size:0.78rem; color:var(--warning);">Em revisão / oficina</span>`;
        }

        const oleo = getMotoOleoInfo(m);

        let photoDisplay = `<div style="width:40px; height:34px; border-radius:4px; border:1px solid var(--border); display:flex; align-items:center; justify-content:center; color:var(--text-muted); background:#f1f5f9;"><i class="fa-solid fa-motorcycle"></i></div>`;
        if (m.foto) {
            photoDisplay = `<img src="${m.foto}" onclick="verFotoMotoCrm('${m.id}')" title="Clique para ampliar a foto" style="width:44px; height:36px; object-fit:cover; border-radius:4px; border:1px solid var(--border); cursor:pointer;">`;
        }

        const isBloq = m.rastreadorBloqueado === true;
        const gpsBadge = isBloq
            ? `<span class="gps-pill gps-blocked"><span class="gps-dot"></span> Bloqueada</span>`
            : `<span class="gps-pill ${m.rastreadorImei ? 'gps-online' : 'gps-preconfig'}"><span class="gps-dot"></span> ${m.rastreadorImei ? 'Online' : 'Pré-Config.'}</span>`;

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
                <small style="color:var(--text-muted); font-size:0.72rem;">${m.rastreadorImei ? `IMEI: ${m.rastreadorImei}` : 'Pronto p/ vincular'}</small>
            </td>
            <td>R$ ${parseFloat(m.valor || 0).toFixed(2)}</td>
            <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
            <td>
                <div style="display:flex; gap:5px;">
                    <button class="btn btn-primary btn-sm" onclick="abrirPainelRastreadorMoto('${m.id}')" title="Rastreador GPS / Bloqueio" style="background:#0284c7;"><i class="fa-solid fa-satellite-dish"></i></button>
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

    document.getElementById('moto-id').value = moto.id;
    document.getElementById('moto-placa').value = moto.placa || '';
    document.getElementById('moto-cor').value = moto.cor || '';
    document.getElementById('moto-modelo').value = moto.modelo || '';
    document.getElementById('moto-ano').value = moto.ano || '';
    if (document.getElementById('moto-renavam')) document.getElementById('moto-renavam').value = moto.renavam || '';
    if (document.getElementById('moto-chassi')) document.getElementById('moto-chassi').value = moto.chassi || '';
    document.getElementById('moto-status').value = moto.status || 'disponivel';
    document.getElementById('moto-valor').value = moto.valor || '';

    const oleo = getMotoOleoInfo(moto);
    if (document.getElementById('moto-km-atual')) document.getElementById('moto-km-atual').value = oleo.kmAtual;
    if (document.getElementById('moto-km-ultima-troca')) document.getElementById('moto-km-ultima-troca').value = oleo.kmUltimaTroca;
    if (document.getElementById('moto-km-proxima-troca')) document.getElementById('moto-km-proxima-troca').value = oleo.kmProximaTroca;

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

    document.getElementById('modal-moto-title').innerText = 'Editar Moto, KM & Rastreador';
}

// ====================================================
// MODULE: ÁREA EXCLUSIVA DE TROCA DE ÓLEO (1.000 KM)
// ====================================================
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

    motos.forEach(m => {
        const info = getMotoOleoInfo(m);
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
                            <i class="fa-solid fa-bell"></i> Controle Automático de 1.000 em 1.000 km Ativo:
                            ${countVencido} moto(s) com troca vencida e ${countAviso} próxima(s) do limite!
                        </strong>
                        <span style="font-size:0.82rem; color:#4b5563;">
                            Informe o KM atual no campo abaixo ou clique em "Sincronizar KM com Rastreadores". Ao realizar o serviço na oficina, clique em "Registrar Troca (+1.000 km)".
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
                const msg = `Olá ${cliente.nome}, aqui é da FACILITA MOTO! A sua moto ${m.modelo} (${m.placa}) está com ${oleo.kmAtual} km registrados (a troca de óleo é feita de 1.000 em 1.000 km, programada para ${oleo.kmProximaTroca} km). Por favor, entre em contato para agendarmos a revisão!`;
                btnWhatsOleo = `<a href="https://wa.me/55${numW}?text=${encodeURIComponent(msg)}" target="_blank" class="btn btn-secondary btn-sm" style="background:#25d366; color:#fff; padding:4px 8px;" title="Chamar condutor no WhatsApp para troca de óleo"><i class="fa-brands fa-whatsapp"></i> Avisar</a>`;
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
                    <button class="btn btn-primary btn-sm" onclick="salvarKmInlineMoto('${m.id}')" title="Salvar KM Atual">
                        <i class="fa-solid fa-check"></i> Salvar KM
                    </button>
                </div>
            </td>
            <td>
                <strong>${oleo.kmUltimaTroca} km</strong><br>
                <small style="color:var(--text-muted);">${ultimaData}</small>
            </td>
            <td>
                <strong style="color:var(--primary); font-size:0.95rem;">${oleo.kmProximaTroca} km</strong><br>
                <small style="color:var(--text-muted);">Ciclo: 1.000 km</small>
            </td>
            <td>
                <div class="km-progress-wrap">
                    <div style="display:flex; justify-content:space-between; font-size:0.76rem; font-weight:700;">
                        <span>Rodados: ${oleo.kmRodadosCiclo} / 1.000 km</span>
                        <span>${oleo.percentual}%</span>
                    </div>
                    <div class="km-progress-bar">
                        <div class="km-progress-fill" style="width:${oleo.percentual}%; background:${oleo.cor};"></div>
                    </div>
                    <span style="font-size:0.73rem; padding:2px 7px; border-radius:4px; background:${oleo.badgeBg}; color:${oleo.badgeColor}; font-weight:700; display:inline-block;">
                        ${oleo.label}
                    </span>
                </div>
            </td>
            <td>
                <span class="gps-pill ${m.rastreadorImei ? 'gps-online' : 'gps-preconfig'}">
                    <span class="gps-dot"></span> ${m.rastreadorImei ? 'KM via GPS Ativo' : 'GPS Pré-Config.'}
                </span>
            </td>
            <td>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="btn btn-primary btn-sm" style="background:var(--success);" onclick="abrirModalTrocaOleo('${m.id}')" title="Registrar Troca de Óleo Realizada (+1.000 km)">
                        <i class="fa-solid fa-oil-can"></i> Registrar Troca (+1.000 km)
                    </button>
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

    motos[idx].kmAtual = novoKm;
    if (!motos[idx].kmProximaTroca) {
        motos[idx].kmProximaTroca = (parseInt(motos[idx].kmUltimaTroca) || 0) + 1000;
    }
    motos[idx].rastreadorUltimaSync = new Date().toISOString();

    saveDb('crm_motos', motos);
    updateViews();

    const info = getMotoOleoInfo(motos[idx]);
    if (info.status === 'vencido') {
        alert(`🚨 AVISO DE MANUTENÇÃO (1.000 KM):\n\nA moto ${motos[idx].modelo} (${motos[idx].placa}) atingiu ${novoKm} km (Troca programada aos ${info.kmProximaTroca} km).\n\nProvidencie a troca de óleo imediatamente!`);
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
    const proxKm = kmTroca + intervalo;

    let motos = getDb('crm_motos');
    const idx = motos.findIndex(m => m.id === motoId);
    if (idx === -1) return;

    motos[idx].kmAtual = Math.max(parseInt(motos[idx].kmAtual) || 0, kmTroca);
    motos[idx].kmUltimaTroca = kmTroca;
    motos[idx].kmProximaTroca = proxKm;
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
}

// ====================================================
// MODULE: INTEGRAÇÃO COM RASTREADOR GPS (PRÉ-CONFIGURADO)
// ====================================================
function abrirPainelRastreadorMoto(motoId) {
    const motos = getDb('crm_motos');
    const moto = motos.find(m => m.id === motoId);
    if (!moto) return;

    const contratos = getDb('crm_contratos');
    const clientes = getDb('crm_clientes');
    const { contrato, cliente } = getCondutorContratoAtivo(moto.id, contratos, clientes);
    const oleo = getMotoOleoInfo(moto);

    document.getElementById('rast-moto-id').value = moto.id;
    document.getElementById('modal-rastreador-title').innerHTML = `<i class="fa-solid fa-satellite-dish" style="color:#38bdf8;"></i> Rastreador GPS: ${moto.modelo} (${moto.placa})`;
    document.getElementById('rast-condutor').innerText = cliente ? `${cliente.nome} (${cliente.telefone})` : 'Sem condutor (Pátio)';
    document.getElementById('rast-vencimento').innerText = contrato && contrato.dataProxVenc ? formatarDataBr(contrato.dataProxVenc) : 'Sem contrato ativo';
    document.getElementById('rast-km-atual').innerText = `${oleo.kmAtual} km`;
    document.getElementById('rast-km-oleo').innerText = `${oleo.kmProximaTroca} km (${oleo.label})`;

    const isBloq = moto.rastreadorBloqueado === true;
    const statusBloqEl = document.getElementById('rast-status-bloqueio');
    const btnBloq = document.getElementById('btn-toggle-bloqueio-moto');
    if (isBloq) {
        statusBloqEl.innerText = '🔒 BLOQUEADA REMOTAMENTE';
        statusBloqEl.style.color = 'var(--danger)';
        btnBloq.innerHTML = '<i class="fa-solid fa-unlock"></i> Desbloquear Motocicleta Remotamente';
        btnBloq.className = 'btn btn-primary btn-sm';
    } else {
        statusBloqEl.innerText = '🔓 Desbloqueada (Operação Normal)';
        statusBloqEl.style.color = 'var(--success)';
        btnBloq.innerHTML = '<i class="fa-solid fa-lock"></i> Enviar Bloqueio Preventivo (Cláusula 10ª)';
        btnBloq.className = 'btn btn-danger btn-sm';
    }

    document.getElementById('rast-input-imei').value = moto.rastreadorImei || '';
    document.getElementById('rast-input-km').value = oleo.kmAtual;

    const extLink = document.getElementById('rast-external-link');
    if (moto.rastreadorLink) {
        extLink.href = moto.rastreadorLink;
        extLink.style.display = 'inline-block';
    } else {
        extLink.style.display = 'none';
    }

    openModal('modal-rastreador');
}

function salvarTelemetriaRastreadorMoto() {
    const motoId = document.getElementById('rast-moto-id').value;
    const imei = document.getElementById('rast-input-imei').value.trim();
    const novoKm = parseInt(document.getElementById('rast-input-km').value) || 0;

    let motos = getDb('crm_motos');
    const idx = motos.findIndex(m => m.id === motoId);
    if (idx === -1) return;

    motos[idx].rastreadorImei = imei;
    motos[idx].kmAtual = novoKm;
    motos[idx].rastreadorUltimaSync = new Date().toISOString();

    saveDb('crm_motos', motos);
    updateViews();
    abrirPainelRastreadorMoto(motoId);

    const oleo = getMotoOleoInfo(motos[idx]);
    if (oleo.status === 'vencido') {
        alert(`🚨 ALERTA DO RASTREADOR (1.000 KM):\nHodômetro sincronizado em ${novoKm} km! A moto ${motos[idx].modelo} atingiu o limite de troca de óleo (${oleo.kmProximaTroca} km).`);
    } else {
        alert(`✅ Dados do rastreador e quilometragem (${novoKm} km) sincronizados com sucesso!`);
    }
}

function alternarBloqueioRemotoMoto() {
    const motoId = document.getElementById('rast-moto-id').value;
    let motos = getDb('crm_motos');
    const idx = motos.findIndex(m => m.id === motoId);
    if (idx === -1) return;

    const vaiBloquear = !motos[idx].rastreadorBloqueado;
    const msgConfirm = vaiBloquear
        ? `Confirmar envio de COMANDO DE BLOQUEIO REMOTO para ${motos[idx].modelo} (${motos[idx].placa})?\n\nConforme Cláusula 10.3 do Contrato, certifique-se de que a motocicleta está em condição tecnicamente segura (parada).`
        : `Confirmar DESBLOQUEIO REMOTO da motocicleta ${motos[idx].modelo} (${motos[idx].placa})?`;

    if (!confirm(msgConfirm)) return;

    motos[idx].rastreadorBloqueado = vaiBloquear;
    saveDb('crm_motos', motos);
    updateViews();
    abrirPainelRastreadorMoto(motoId);
}

function sincronizarTodosRastreadores() {
    const cfg = getTrackerConfig();
    const motos = getDb('crm_motos');
    let alertas = [];

    motos.forEach(m => {
        m.rastreadorUltimaSync = new Date().toISOString();
        const oleo = getMotoOleoInfo(m);
        if (oleo.status === 'vencido') {
            alertas.push(`• ${m.modelo} (${m.placa}): ${oleo.kmAtual} km — TROCA DE ÓLEO VENCIDA!`);
        } else if (oleo.status === 'aviso') {
            alertas.push(`• ${m.modelo} (${m.placa}): Faltam ${oleo.kmRestantes} km para a troca de 1.000 km.`);
        }
    });

    saveDb('crm_motos', motos);
    updateViews();

    if (alertas.length > 0) {
        alert(`📡 Sincronização GPS (${cfg.provedor.toUpperCase()}) concluída!\n\nAvisos de Manutenção (Ciclo 1.000 km):\n` + alertas.join('\n'));
    } else {
        alert(`📡 Sincronização GPS (${cfg.provedor.toUpperCase()}) concluída! Todas as ${motos.length} motos estão com telemetria e óleo em dia.`);
    }
}

function salvarConfigRastreadorGlobal(e) {
    e.preventDefault();
    const cfg = {
        provedor: document.getElementById('cfg-gps-provedor').value,
        url: document.getElementById('cfg-gps-url').value.trim(),
        token: document.getElementById('cfg-gps-token').value.trim(),
        intervaloOleo: parseInt(document.getElementById('cfg-gps-intervalo-oleo').value) || 1000,
        avisoAntecipado: parseInt(document.getElementById('cfg-gps-aviso-antecipado').value) || 150,
        autoKm: document.getElementById('cfg-gps-auto-km').checked
    };
    localStorage.setItem('crm_tracker_config', JSON.stringify(cfg));
    closeModal('modal-config-rastreador-global');
    updateViews();
    alert('✅ Pré-configuração do Rastreador GPS e alerta de 1.000 km salva com sucesso!');
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
    if (!confirm("Confirmar o recebimento semanal? Isso empurrará o próximo vencimento para +7 dias.")) return;

    let contratos = getDb('crm_contratos');
    let idx = contratos.findIndex(c => c.id === id);
    if (idx > -1) {
        const baseDateStr = contratos[idx].dataProxVenc || new Date().toISOString().split('T')[0];
        let vDate = new Date(baseDateStr + 'T00:00:00');
        vDate.setDate(vDate.getDate() + 7);
        contratos[idx].dataProxVenc = vDate.toISOString().split('T')[0];

        saveDb('crm_contratos', contratos);
        updateViews();
    }
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
        'gov-locador-nome', 'gov-locador-cpf', 'gov-locador-tel',
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
        <div class="sub-header">Com pagamento semanal, caução, responsabilidade por danos, multas e regras de utilização</div>
        <p>Pelo presente instrumento particular, as partes identificadas abaixo celebram o presente Contrato de Locação de Motocicleta, mediante as cláusulas e condições seguintes.</p>

        <h4>CLÁUSULA 1ª — IDENTIFICAÇÃO DAS PARTES</h4>
        <p><strong>1.1. LOCADOR — PROPRIETÁRIO OU RESPONSÁVEL PELA LOCAÇÃO</strong><br>
        Nome completo/Razão social: ${v('gov-locador-nome', 'Henrique Rocha Clavijo')}<br>
        CPF/CNPJ: ${v('gov-locador-cpf', '85221619091')}<br>
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
        <p>3.2. Data e horário de início: ${v('gov-prazo-inicio', '__/__/________')}, às ${v('gov-prazo-hora', '______')} horas.</p>
        <p>3.3. Prazo da locação: ${v('gov-prazo-duracao', '__________________________________________')}.</p>
        <p>3.4. A renovação poderá ocorrer mediante concordância entre as partes, inclusive por escrito ou por meio eletrônico que permita comprovar a manifestação de vontade.</p>
        <p>3.5. O LOCATÁRIO declara que utilizará a motocicleta de acordo com a legislação vigente, as condições deste contrato e a finalidade autorizada pelo LOCADOR.</p>
        <p>3.6. A motocicleta deverá ser conduzida por pessoa legalmente habilitada e autorizada, observadas as disposições deste instrumento.</p>

        <h4>CLÁUSULA 4ª — VALOR DO ALUGUEL, VENCIMENTO E CAUÇÃO</h4>
        <p>4.1. O valor do aluguel será de R$ ${v('gov-fin-semanal', '__________')} (${v('gov-fin-semanal-extenso', '________________________________')}), por semana.</p>
        <p>4.2. O vencimento ocorrerá toda ${v('gov-fin-dia-venc', '__________________')}, até as ${v('gov-fin-hora-venc', '______')} horas.</p>
        <p>4.3. A forma de pagamento será: ${v('gov-fin-forma-pag', '__________________________________')}.</p>
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
        <p>5.7. A responsabilidade não será automaticamente atribuída ao LOCATÁRIO por todo e qualquer acidente, independentemente das circunstâncias. A apuração observará a legislação aplicável, as provas disponíveis e a responsabilidade de cada envolvido.</p>
        <p>5.8. Caso o LOCADOR possua seguro, a cobertura e as eventuais franquias serão observadas conforme as condições da apólice. O LOCATÁRIO não será responsável por valores que não lhe sejam legal ou contratualmente atribuíveis.</p>

        <h4>CLÁUSULA 6ª — PROIBIÇÃO DE EMPRÉSTIMO, CESSÃO OU SUBLOCAÇÃO</h4>
        <p>6.1. A motocicleta será disponibilizada exclusivamente para uso do LOCATÁRIO identificado neste contrato.</p>
        <p>6.2. É expressamente proibido emprestar, ceder, transferir a posse ou sublocar a motocicleta a qualquer outra pessoa, gratuitamente ou mediante pagamento, sem autorização prévia e expressa por escrito do LOCADOR.</p>
        <p>6.3. O LOCATÁRIO não poderá permitir que terceiros conduzam a motocicleta, mesmo que sejam familiares, amigos, colegas de trabalho ou pessoas de sua confiança.</p>
        <p>6.4. O descumprimento desta cláusula constituirá infração contratual grave e poderá resultar na rescisão do contrato, na exigência de devolução da motocicleta e na cobrança dos prejuízos comprovadamente decorrentes da infração.</p>
        <p>6.5. A devolução deverá ocorrer voluntariamente ou pelos meios legalmente permitidos, não sendo autorizada a retomada mediante violência, ameaça ou exercício arbitrário das próprias razões.</p>

        <h4>CLÁUSULA 7ª — MULTAS DE TRÂNSITO E RESPONSABILIDADE DO LOCATÁRIO</h4>
        <p>7.1. O LOCATÁRIO será responsável pelas infrações de trânsito decorrentes de sua conduta durante o período da locação, incluindo o pagamento das multas e dos encargos legalmente atribuíveis à sua responsabilidade.</p>
        <p>7.2. Caso uma multa referente ao período da locação seja encaminhada diretamente ao LOCADOR, este poderá solicitar o reembolso do valor devido pelo LOCATÁRIO, mediante apresentação da notificação ou de documentação comprobatória da infração.</p>
        <p>7.3. O LOCATÁRIO deverá fornecer os dados, assinar os formulários e apresentar os documentos necessários à identificação do condutor infrator, observados os prazos e procedimentos legais.</p>
        <p>7.4. A pontuação decorrente da infração deverá ser atribuída conforme a legislação de trânsito. Este contrato não autoriza compra, venda ou transferência irregular de pontos na CNH.</p>
        <p>7.5. <strong>Taxa administrativa por ponto:</strong> quando uma infração praticada pelo LOCATÁRIO exigir providências administrativas do LOCADOR, as partes estabelecem uma taxa contratual de referência de R$ 120,00 (cento e vinte reais) por ponto relacionado à infração, destinada a cobrir os custos administrativos de tratamento da ocorrência, quando juridicamente admissível.</p>
        <p>7.6. A cobrança prevista na cláusula anterior deverá observar os limites legais aplicáveis, a proporcionalidade, a transparência e a efetiva justificativa da despesa. Ela não representa compra ou transferência de pontuação, nem substitui o pagamento da multa ao órgão de trânsito. Se a cobrança integral não for juridicamente admissível, somente poderá ser exigido o valor permitido por lei.</p>
        <p>7.7. O LOCATÁRIO deverá pagar os valores devidos no prazo de ${v('gov-multa-prazo-dias', '______')} dias após receber a documentação e a solicitação de pagamento.</p>
        <p>7.8. O não pagamento de valores vencidos poderá caracterizar inadimplemento contratual, autorizando a cobrança do débito e, quando cabível, a rescisão e a solicitação de devolução da motocicleta, observados os procedimentos legais.</p>

        <h4>CLÁUSULA 8ª — RETENÇÃO DA CAUÇÃO POR ATÉ 40 DIAS PARA VERIFICAÇÃO DE MULTAS</h4>
        <p>8.1. O LOCATÁRIO declara estar ciente de que determinadas infrações cometidas durante a locação podem não estar disponíveis nos sistemas oficiais de trânsito no momento da devolução da motocicleta.</p>
        <p>8.2. Para permitir a conferência de possíveis multas ainda não identificadas, as partes estabelecem um período contratual de retenção preventiva da caução de <strong>até 40 (quarenta) dias corridos, contados da data da devolução da motocicleta.</strong></p>
        <p>8.3. Durante esse período, o LOCADOR poderá manter retida a caução, no limite necessário à finalidade prevista nesta cláusula, para consultar os sistemas oficiais de trânsito e verificar a existência de infrações referentes ao período em que a motocicleta esteve sob responsabilidade do LOCATÁRIO.</p>
        <p>8.4. Se forem identificadas multas referentes ao período da locação e atribuíveis ao LOCATÁRIO, o LOCADOR poderá descontar da caução os valores legalmente devidos, mediante apresentação dos documentos disponíveis e demonstrativo dos descontos.</p>
        <p>8.5. <strong>Se não houver multas identificadas nem outros débitos pendentes que justifiquem legalmente a retenção, o valor integral da caução deverá ser devolvido ao LOCATÁRIO</strong> após o período de verificação, em até 2 (dois) dias úteis para processamento da transferência.</p>
        <p>8.6. Se, ao término dos 40 dias, existir infração comprovadamente relacionada ao período da locação cuja notificação ou valor ainda esteja pendente, as partes poderão ajustar por escrito uma retenção proporcional e justificada, limitada ao montante razoavelmente necessário para cobrir o débito.</p>
        <p>8.7. A retenção não poderá ser indefinida nem exceder o valor justificável. O LOCADOR deverá apresentar as informações disponíveis que fundamentem a continuidade da retenção.</p>
        <p>8.8. O prazo de 40 dias é uma condição contratual de verificação, e não um prazo legal universal do DETRAN para lançamento ou aplicação de multas. A ausência de registro nesse período não garante que nenhuma multa possa ser comunicada posteriormente.</p>
        <p>8.9. Caso uma multa válida seja comunicada após a devolução da caução, o LOCATÁRIO continuará responsável pelos valores legalmente atribuíveis a infrações praticadas durante o período da locação, mediante comprovação e observância dos procedimentos legais aplicáveis.</p>

        <h4>CLÁUSULA 9ª — ATRASO NO ALUGUEL SEMANAL</h4>
        <p>9.1. O não pagamento do aluguel na data e no horário estabelecidos caracterizará atraso contratual.</p>
        <p>9.2. Em caso de atraso, o LOCADOR poderá notificar o LOCATÁRIO e, se houver dispositivo de bloqueio instalado e previamente informado, adotar o bloqueio remoto da motocicleta, desde que tecnicamente seguro e sem colocar o condutor ou terceiros em risco.</p>
        <p>9.3. O bloqueio nunca deverá interromper o funcionamento do motor durante a circulação da motocicleta ou em situação que possa causar acidente.</p>
        <p>9.4. <strong>Após 3 (três) dias consecutivos de atraso</strong>, o LOCADOR poderá rescindir o contrato por inadimplemento, exigir a devolução da motocicleta e iniciar os procedimentos legalmente permitidos para sua recuperação.</p>
        <p>9.5. A devolução deverá ser solicitada por meio de comunicação ao LOCATÁRIO, com indicação do local e das condições para entrega, respeitados os procedimentos legais aplicáveis.</p>
        <p>9.6. O LOCADOR poderá utilizar a caução para compensar aluguéis vencidos e demais valores legitimamente devidos, mediante demonstrativo dos descontos.</p>
        <p>9.7. O atraso não implica perda automática e integral da caução independentemente dos débitos existentes. A caução será aplicada aos valores efetivamente devidos, e eventual saldo remanescente deverá ser devolvido.</p>
        <p>9.8. Caso a motocicleta não seja devolvida voluntariamente, o LOCADOR poderá buscar as medidas extrajudiciais ou judiciais cabíveis, não sendo autorizada a apreensão forçada fora dos meios legais.</p>

        <h4>CLÁUSULA 10ª — BLOQUEIO E RASTREAMENTO DA MOTOCICLETA</h4>
        <p>10.1. O LOCATÁRIO declara estar ciente de que a motocicleta possui ou poderá possuir sistema de rastreamento e/ou bloqueio remoto, conforme informado pelo LOCADOR.</p>
        <p>10.2. O sistema será utilizado para proteção patrimonial, localização do veículo e cumprimento das condições contratuais, respeitados os direitos das partes e a legislação aplicável.</p>
        <p>10.3. O bloqueio remoto somente poderá ocorrer em condições tecnicamente seguras. É proibido desligar o motor durante a circulação ou executar qualquer comando que possa provocar acidente.</p>
        <p>10.4. O bloqueio não autoriza a retomada coercitiva do veículo, o ingresso não autorizado em imóvel ou qualquer outra medida que dependa de procedimento legal ou ordem judicial.</p>
        <p>10.5. O LOCATÁRIO não poderá remover, adulterar, danificar ou desativar deliberadamente o rastreador ou qualquer dispositivo de segurança instalado na motocicleta.</p>
        <p>10.6. A utilização do sistema deverá respeitar a finalidade informada, os direitos do LOCATÁRIO e as normas aplicáveis à proteção de dados pessoais.</p>

        <h4>CLÁUSULA 11ª — CONSERVAÇÃO, MANUTENÇÃO E USO ADEQUADO</h4>
        <p>11.1. O LOCATÁRIO declara receber a motocicleta nas condições descritas no termo de vistoria anexo a este contrato.</p>
        <p>11.2. O LOCATÁRIO deverá zelar pela motocicleta, utilizá-la de acordo com a legislação de trânsito e comunicar imediatamente qualquer falha mecânica, dano ou condição que possa comprometer a segurança.</p>
        <p>11.3. O desgaste natural decorrente do uso regular não será considerado dano imputável ao LOCATÁRIO.</p>
        <p>11.4. Os custos de reparação de danos causados por mau uso, negligência, acidente atribuível ao LOCATÁRIO ou descumprimento contratual serão de responsabilidade deste, mediante comprovação.</p>
        <p>11.5. As manutenções preventivas e os reparos decorrentes do desgaste normal, bem como os defeitos preexistentes não causados pelo LOCATÁRIO, serão tratados conforme a legislação aplicável e as condições acordadas entre as partes.</p>
        <p>11.6. O LOCATÁRIO não poderá realizar modificações permanentes na motocicleta sem autorização expressa do LOCADOR.</p>

        <h4>CLÁUSULA 12ª — DEVOLUÇÃO DA MOTOCICLETA</h4>
        <p>12.1. Ao término do contrato ou em caso de rescisão, o LOCATÁRIO deverá devolver a motocicleta, suas chaves e os acessórios entregues, no local combinado entre as partes.</p>
        <p>12.2. Será realizada vistoria de devolução, preferencialmente com registro fotográfico, para comparação com o estado do veículo na entrega.</p>
        <p>12.3. O LOCATÁRIO deverá informar eventuais danos, falhas ou ocorrências que tenham surgido durante o período da locação.</p>
        <p>12.4. A devolução da motocicleta não elimina a responsabilidade por obrigações referentes ao período da locação que venham a ser comprovadas posteriormente, respeitados os limites legais.</p>

        <h4>CLÁUSULA 13ª — DEVOLUÇÃO E UTILIZAÇÃO DA CAUÇÃO AO FINAL DO CONTRATO</h4>
        <p>13.1. Ao final da locação, a caução será utilizada para compensar débitos vencidos, multas atribuíveis ao LOCATÁRIO, danos comprovados e demais valores legitimamente devidos nos termos deste contrato.</p>
        <p>13.2. O LOCADOR apresentará demonstrativo dos descontos realizados e, quando aplicável, orçamentos, notas fiscais, recibos ou outros documentos que comprovem as despesas.</p>
        <p>13.3. Se não houver danos, débitos ou despesas pendentes, o valor integral da caução será devolvido, observada a retenção preventiva para verificação de multas prevista na Cláusula 8ª.</p>
        <p>13.4. Havendo descontos legítimos, o saldo remanescente será devolvido ao LOCATÁRIO no prazo previsto neste contrato, respeitado o período de verificação de multas e a necessidade de apuração de débitos efetivamente pendentes.</p>
        <p>13.5. Caso os prejuízos comprovados ultrapassem o valor da caução, o LOCATÁRIO deverá pagar a diferença na medida de sua responsabilidade legal e contratual.</p>
        <p>13.6. A caução não será automaticamente perdida em sua totalidade por qualquer irregularidade. A compensação deverá corresponder aos valores efetivamente devidos, observados os limites legais.</p>

        <h4>CLÁUSULA 14ª — RESCISÃO CONTRATUAL</h4>
        <p>14.1. O contrato poderá ser encerrado pelo término do prazo, por acordo entre as partes ou por descumprimento contratual que justifique a rescisão.</p>
        <p>14.2. Constituem hipóteses de rescisão, entre outras:<br>
        a) Atraso no aluguel conforme as condições da Cláusula 9ª;<br>
        b) Empréstimo, cessão ou sublocação não autorizados;<br>
        c) Utilização ilícita ou contrária à finalidade contratual;<br>
        d) Omissão deliberada de acidente ou dano relevante;<br>
        e) Adulteração de dispositivos de segurança;<br>
        f) Descumprimento grave das obrigações de conservação e utilização;<br>
        g) Falsidade de informações ou documentos relevantes para a contratação.</p>
        <p>14.3. Rescindido o contrato, o LOCATÁRIO deverá devolver a motocicleta, sem prejuízo da cobrança de aluguéis vencidos, danos comprovados e demais valores legalmente exigíveis.</p>
        <p>14.4. A retomada da motocicleta, quando não houver entrega voluntária, deverá ocorrer pelos meios legalmente permitidos, sem violência, ameaça, constrangimento ou exercício arbitrário das próprias razões.</p>
        <p>14.5. A rescisão não autoriza a apropriação automática de valores da caução além dos débitos e prejuízos efetivamente devidos.</p>

        <h4>CLÁUSULA 15ª — DECLARAÇÕES DO LOCATÁRIO</h4>
        <p>O LOCATÁRIO declara que:<br>
        a) Forneceu informações e documentos verdadeiros;<br>
        b) Possui CNH válida e categoria compatível com a motocicleta;<br>
        c) Leu e compreendeu as condições deste contrato;<br>
        d) Está ciente do valor do aluguel semanal, do vencimento e do valor da caução;<br>
        e) Compromete-se a não emprestar, ceder ou sublocar a motocicleta, nem permitir que terceiros a conduzam sem autorização expressa do LOCADOR;<br>
        f) Comunicará prontamente acidentes, roubos, furtos, multas e ocorrências relevantes;<br>
        g) Devolverá a motocicleta conforme as condições deste instrumento;<br>
        h) Está ciente das regras de verificação de multas e retenção preventiva da caução por até 40 dias, nos termos da Cláusula 8ª;<br>
        i) Está ciente de que o bloqueio remoto somente poderá ocorrer em condições seguras e conforme a legislação aplicável.</p>

        <h4>CLÁUSULA 16ª — DISPOSIÇÕES GERAIS</h4>
        <p>16.1. Qualquer alteração deste contrato deverá ser formalizada por escrito e aceita por ambas as partes.</p>
        <p>16.2. As comunicações contratuais poderão ser realizadas pelos telefones, endereços eletrônicos ou aplicativos de mensagens informados pelas partes, desde que seja possível comprovar seu envio e conteúdo.</p>
        <p>16.3. A eventual invalidade de uma cláusula não prejudicará as demais disposições válidas deste instrumento.</p>
        <p>16.4. O presente contrato poderá ser assinado fisicamente ou por meio eletrônico que permita identificar os signatários e demonstrar a integridade do documento.</p>
        <p>16.5. As partes declaram que tiveram oportunidade de ler o contrato, esclarecer dúvidas e guardar uma cópia assinada.</p>

        <h4>CLÁUSULA 17ª — FORO</h4>
        <p>17.1. As partes elegem o foro legalmente competente para resolver eventuais controvérsias decorrentes deste contrato, respeitadas as regras legais de competência e eventual legislação especial aplicável.</p>
        <p>E, por estarem de acordo, assinam o presente instrumento em duas vias de igual teor ou por meio eletrônico.</p>
        <p><strong>Local:</strong> ${v('gov-foro-local', '_________________________________________________')} &nbsp;&nbsp;&nbsp; <strong>Data:</strong> ${v('gov-foro-data', '__/__/____________')}</p>

        <!-- ESPAÇO RESERVADO PARA ASSINATURA DIGITAL GOV.BR -->
        <div class="govbr-sign-grid">
            <div class="govbr-sign-box">
                <div class="govbr-sign-badge">ÁREA RESERVADA PARA ASSINATURA GOV.BR / FÍSICA</div>
                <div style="margin: 12px 0; font-size: 11px; color: #64748b;">Posicione o selo de Assinatura Eletrônica Gov.br aqui</div>
                <div style="border-top: 1px solid #1e293b; padding-top: 6px; font-size: 12px;">
                    <strong>LOCADOR:</strong> ${v('gov-locador-nome', 'Henrique Rocha Clavijo')}<br>
                    CPF/CNPJ: ${v('gov-locador-cpf', '85221619091')}
                </div>
            </div>
            <div class="govbr-sign-box">
                <div class="govbr-sign-badge">ÁREA RESERVADA PARA ASSINATURA GOV.BR / FÍSICA</div>
                <div style="margin: 12px 0; font-size: 11px; color: #64748b;">Posicione o selo de Assinatura Eletrônica Gov.br aqui</div>
                <div style="border-top: 1px solid #1e293b; padding-top: 6px; font-size: 12px;">
                    <strong>LOCATÁRIO:</strong> ${v('gov-locatario-nome', '____________________________________')}<br>
                    CPF: ${v('gov-locatario-cpf', '___________________________')}
                </div>
            </div>
        </div>

        <div class="govbr-sign-grid" style="margin-top:10px;">
            <div style="font-size:12px;">
                <strong>TESTEMUNHA 1</strong><br>
                Nome: ${v('gov-test1-nome', '________________________________________')}<br>
                CPF: ${v('gov-test1-cpf', '_________________________________________')}<br>
                Assinatura: _______________________________________
            </div>
            <div style="font-size:12px;">
                <strong>TESTEMUNHA 2</strong><br>
                Nome: ${v('gov-test2-nome', '________________________________________')}<br>
                CPF: ${v('gov-test2-cpf', '_________________________________________')}<br>
                Assinatura: _______________________________________
            </div>
        </div>

        <hr style="margin: 28px 0; border: none; border-top: 2px solid #94a3b8; page-break-before: always;">

        <h4>ANEXO I — TERMO DE ENTREGA E VISTORIA DA MOTOCICLETA</h4>
        <p><strong>Placa:</strong> ${v('gov-moto-placa', '_____________________')}<br>
        <strong>Data e horário da entrega:</strong> ${v('gov-prazo-inicio', '____________')} às ${v('gov-prazo-hora', '______')} horas<br>
        <strong>Quilometragem:</strong> ${v('gov-moto-km', '_________________________________________')}<br>
        <strong>Nível de combustível:</strong> ${v('gov-vist-combustivel', '____________________________________')}<br>
        <strong>Pneus:</strong> ${v('gov-vist-pneus', '____________________________________________________')}<br>
        <strong>Freios:</strong> ${v('gov-vist-freios', '___________________________________________________')}<br>
        <strong>Faróis, lanternas e setas:</strong> ${v('gov-vist-farois', '__________________________________')}<br>
        <strong>Retrovisores:</strong> ${v('gov-vist-retrovisores', '______________________________________________')}<br>
        <strong>Carroceria, carenagem e pintura:</strong> ${v('gov-vist-carenagem', '_____________________________')}<br>
        <strong>Chaves e acessórios entregues:</strong> ${v('gov-vist-chaves', '______________________________')}<br>
        <strong>Danos preexistentes identificados:</strong> ${v('gov-vist-danos', '___________________________')}</p>
        <p><strong>Registro fotográfico realizado:</strong> ${fotosCheck}<br>
        <strong>Observações adicionais:</strong> ${v('gov-vist-obs', '_____________________________________')}</p>
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
                    <strong>Assinatura do LOCATÁRIO:</strong> ${v('gov-locatario-nome', '___________________________')}
                </div>
            </div>
        </div>

        <hr style="margin: 24px 0; border: none; border-top: 1px solid #cbd5e1;">

        <h4>ANEXO II — CONDIÇÕES FINANCEIRAS</h4>
        <p><strong>Valor do aluguel semanal:</strong> R$ ${v('gov-fin-semanal', '________________________________')} (${v('gov-fin-semanal-extenso', '____________________')})<br>
        <strong>Dia e horário do vencimento:</strong> Toda ${v('gov-fin-dia-venc', '________________')} até as ${v('gov-fin-hora-venc', '______')} horas<br>
        <strong>Valor da caução:</strong> R$ ${v('gov-fin-caucao', '________________________________________')}<br>
        <strong>Forma de pagamento:</strong> ${v('gov-fin-forma-pag', '______________________________________')}<br>
        <strong>Chave PIX ou dados para pagamento:</strong> ${v('gov-anexo2-pix', '_________________________')}<br>
        <strong>Prazo de devolução da caução após a conferência:</strong> ${v('gov-anexo2-prazo-caucao', '______________')}<br>
        <strong>Uso autorizado da motocicleta:</strong> ${v('gov-anexo2-uso', '______________________________')}<br>
        <strong>Outras condições acordadas:</strong> ${v('gov-anexo2-outras', '________________________________')}</p>

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
                    <strong>Assinatura do LOCATÁRIO:</strong> ${v('gov-locatario-nome', '___________________________')}
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

// ==========================================
// CENTRAL UPDATE SYSTEM
// ==========================================
function updateViews() {
    renderDashboard();
    renderClientes();
    renderPipeline();
    renderFrota();
    renderOleoView();
    renderContratos();
    renderUsuarios();
    populateContratoSelects();
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    const foroDataEl = document.getElementById('gov-foro-data');
    if (foroDataEl && !foroDataEl.value) {
        foroDataEl.value = formatarDataBr(new Date().toISOString().split('T')[0]);
    }
    atualizarPreviewContratoGov();
    updateViews();
});

updateViews();
