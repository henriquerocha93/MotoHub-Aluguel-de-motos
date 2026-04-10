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
window.isFirebaseSyncing = false; // Flag to prevent echo loops

// Start continuous Realtime synchronization
if(db) {
    if(!localStorage.getItem('crm_cloud_migrated')) {
        let hasData = false;
        const batch = db.batch();
        ['crm_clientes', 'crm_motos', 'crm_contratos', 'crm_admins'].forEach(col => {
            const data = JSON.parse(localStorage.getItem(col)) || [];
            if(data.length > 0) {
                hasData = true;
                data.forEach(item => {
                    if(item && item.id) {
                        batch.set(db.collection(col).doc(item.id), item);
                    }
                });
            }
        });
        if(hasData) batch.commit();
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
            if(typeof updateViews === 'function') {
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
    return JSON.parse(localStorage.getItem(key)) || [];
}

function saveDb(key, data) {
    // 1. Sempre salva local pra ter UI instantânea
    localStorage.setItem(key, JSON.stringify(data));
    
    // 2. Se a gravação foi feita manual pelo Admin (e não recebida via Firebase)
    // Sobe a alteração pra nuvem
    if(!window.isFirebaseSyncing && db) {
        const batch = db.batch();
        data.forEach(item => {
            if(item && item.id) {
                const docRef = db.collection(key).doc(item.id);
                batch.set(docRef, item);
            }
        });
        batch.commit().catch(e => console.error("Batch Cloud erro:", e));
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
} catch(e) {}

if (!currentAdmins || !Array.isArray(currentAdmins)) {
    currentAdmins = [];
}

const temHenrique = currentAdmins.find(a => a.email === 'henrique_rocha@live.com');
if(!temHenrique) {
    currentAdmins.push({ id: generateId(), nome: 'Henrique Rocha', email: 'henrique_rocha@live.com', senha: 'Rike1234', role: 'admin' });
    saveDb('crm_admins', currentAdmins);
}

// ==========================================
// AUTH GUARD
// ==========================================
if (!window.location.href.includes('vitrine.html')) {
    const sessionUrl = localStorage.getItem('crm_session');
    if (!sessionUrl) {
        window.location.href = 'vitrine.html';
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            const userSpan = document.getElementById('logged-user-name');
            const userAvatar = document.getElementById('logged-user-avatar');
            if(userSpan) {
                const sObj = JSON.parse(sessionUrl);
                userSpan.innerText = sObj.nome;
                
                if(userAvatar) {
                    userAvatar.src = sObj.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(sObj.nome)}&background=6366f1&color=fff`;
                }

                if(sObj.role === 'funcionario') {
                    const navUsers = document.querySelector('.nav-item[data-target="usuarios"]');
                    if(navUsers) navUsers.style.display = 'none';
                }
            }
        });
    }
}

function fazerLogout() {
    localStorage.removeItem('crm_session');
    window.location.href = 'vitrine.html';
}

// ==========================================
// ROUTING & NAVIGATION
// ==========================================
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if(sidebar && overlay) {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('show');
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
        document.getElementById(`view-${target}`).classList.add('active');

        // Update Page Title
        document.getElementById('page-title').innerText = item.innerText.trim();

        // Re-render specific view data
        updateViews();

        // Fechar sidebar no mobile automatico
        if(window.innerWidth <= 768) {
            const sidebar = document.querySelector('.sidebar');
            const overlay = document.querySelector('.sidebar-overlay');
            if(sidebar && sidebar.classList.contains('open')) {
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
    document.getElementById(id).classList.add('show');
    
    // Clear form if needed
    if(id === 'modal-cliente') document.getElementById('form-cliente').reset();
    if(id === 'modal-usuario') {
        document.getElementById('form-usuario').reset();
        document.getElementById('usr-id').value = '';
        document.getElementById('modal-usuario-title').innerText = 'Novo Usuário Admin';
    }
    if(id === 'modal-moto') {
        document.getElementById('form-moto').reset();
        document.getElementById('modal-moto-title').innerText = 'Nova Moto';
        document.getElementById('moto-id').value = '';
        document.getElementById('moto-foto-base64').value = '';
        document.getElementById('moto-foto-preview').src = '';
        document.getElementById('moto-foto-preview').style.display = 'none';
        document.getElementById('moto-foto-placeholder').style.display = 'flex';
        document.getElementById('btn-remover-foto-moto').style.display = 'none';
    }
    if(id === 'modal-contrato') {
        document.getElementById('form-contrato').reset();
        document.getElementById('cont-id').value = '';
        document.getElementById('btn-encerrar-contrato').style.display = 'none';
        document.getElementById('cont-status').value = 'ativo';
        document.getElementById('cont-status').disabled = true; // Auto handled
        populateContratoSelects();
        calculateDiariaDisplay();
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
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
        if(moto) {
            // Faturamento estimado diário * 30 (simplificado para "Faturamento Estimado")
            faturamentoMensal += parseFloat(moto.valor) * 30;
        }
    });

    document.getElementById('dash-faturamento').innerText = `R$ ${faturamentoMensal.toFixed(2)}`;

    // ==================
    // CICLO DE COBRANÇAS
    // ==================
    const ulAtrasados = document.getElementById('dash-atrasados');
    const ulVenceHoje = document.getElementById('dash-vence-hoje');
    if(ulAtrasados) ulAtrasados.innerHTML = '';
    if(ulVenceHoje) ulVenceHoje.innerHTML = '';
    
    let temAtrasado = false;
    let temHoje = false;

    const todayDateObj = new Date();
    todayDateObj.setHours(0,0,0,0);

    contratos.filter(c => c.status === 'ativo').forEach(cont => {
        if(cont.dataProxVenc) {
            const vencDateObj = new Date(cont.dataProxVenc + 'T00:00:00');
            const cli = clientes.find(x => x.id === cont.clienteId);
            const nomeCli = cli ? cli.nome : 'Desconhecido';
            
            // Format string
            const splitD = cont.dataProxVenc.split('-');
            const dataStr = `${splitD[2]}/${splitD[1]}`;

            // Normalize differences
            const diffTime = vencDateObj.getTime() - todayDateObj.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if(diffDays < 0) {
                temAtrasado = true;
                if(ulAtrasados) {
                    let btnWhats = '';
                    if(cli && cli.telefone) {
                        const numWhats = cli.telefone.replace(/\D/g, '');
                        
                        // Busca a moto para informar no texto
                        const mInfo = motos.find(m => m.id === cont.motoId);
                        const strMoto = mInfo ? `${mInfo.modelo}` : `moto`;
                        
                        // Template Saudação Atrasado
                        let msgAtraso = `Olá, ${cli.nome}! Como você está? Passando por aqui pois identificamos que a renovação da sua ${strMoto} consta em aberto/atraso no nosso sistema. Conseguimos verificar isso hoje?`;
                        let linkWhats = `https://wa.me/55${numWhats}?text=${encodeURIComponent(msgAtraso)}`;
                        
                        btnWhats = `<a href="${linkWhats}" target="_blank" title="Cobrar no WhatsApp" style="float:right;"><i class="fa-brands fa-whatsapp" style="color:#25d366; font-size:1.2rem;"></i></a>`;
                    }
                    ulAtrasados.innerHTML += `<li style="display:flex; justify-content:space-between; align-items:center;"><span><strong>${nomeCli}:</strong> Atrasado desde ${dataStr} (${Math.abs(diffDays)} dias)</span> ${btnWhats}</li>`;
                }
            } else if(diffDays === 0) {
                temHoje = true;
                if(ulVenceHoje) {
                    let btnWhats = '';
                    if(cli && cli.telefone) {
                        const numWhats = cli.telefone.replace(/\D/g, '');
                        
                        // Busca a moto para informar no texto
                        const mInfo = motos.find(m => m.id === cont.motoId);
                        const strMoto = mInfo ? `${mInfo.modelo}` : `moto`;
                        
                        // Template Saudação Vence Hoje
                        let msgHoje = `Olá, ${cli.nome}! Passando rapidamente para lembrar que o pagamento semanal da sua locação (${strMoto}) vence hoje. Qualquer dúvida estou à disposição, aguardo o envio do comprovante!`;
                        let linkWhatsHoje = `https://wa.me/55${numWhats}?text=${encodeURIComponent(msgHoje)}`;
                        
                        btnWhats = `<a href="${linkWhatsHoje}" target="_blank" title="Lembrar no WhatsApp" style="float:right;"><i class="fa-brands fa-whatsapp" style="color:#25d366; font-size:1.2rem;"></i></a>`;
                    }
                    ulVenceHoje.innerHTML += `<li style="display:flex; justify-content:space-between; align-items:center;"><span><strong>${nomeCli}:</strong> Vence hoje (${dataStr})</span> ${btnWhats}</li>`;
                }
            }
        }
    });

    if(!temAtrasado && ulAtrasados) ulAtrasados.innerHTML = `<li class="empty-state">Nenhum cliente em atraso.</li>`;
    if(!temHoje && ulVenceHoje) ulVenceHoje.innerHTML = `<li class="empty-state">Nenhum vencimento para hoje.</li>`;


    // Follow ups
    const today = new Date().toISOString().split('T')[0];
    const ulReminders = document.getElementById('today-reminders');
    ulReminders.innerHTML = '';
    let hasReminder = false;

    clientes.forEach(c => {
        if(c.notas) {
            c.notas.forEach(n => {
                if(n.date === today && n.date !== "") {
                    hasReminder = true;
                    ulReminders.innerHTML += `<li><strong>${c.nome}:</strong> ${n.text}</li>`;
                }
            });
        }
    });

    if(!hasReminder) {
        ulReminders.innerHTML = `<li class="empty-state">Nenhum lembrete para hoje.</li>`;
    }
}

// ==========================================
// MODULE: CLIENTES
// ==========================================
document.getElementById('form-cliente').addEventListener('submit', function(e) {
    e.preventDefault();
    const idObj = document.getElementById('cli-id').value;
    const cliente = {
        id: idObj || generateId(),
        nome: document.getElementById('cli-nome').value,
        telefone: document.getElementById('cli-telefone').value,
        email: document.getElementById('cli-email').value,
        cpf: document.getElementById('cli-cpf').value,
        cnh: document.getElementById('cli-cnh').value,
        endereco: document.getElementById('cli-endereco').value,
        fotoCnh: document.getElementById('cli-cnh-base64').value,
        status: document.getElementById('cli-status').value, // novo, contato, proposta, fechado
        notas: []
    };

    let clientes = getDb('crm_clientes');
    
    if(idObj) {
        // preserve notes
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
    const filtered = clientes.filter(c => c.nome.toLowerCase().includes(query) || c.telefone.includes(query));
    
    const tbody = document.getElementById('table-clientes');
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
            <td>${c.nome}</td>
            <td>${c.telefone}</td>
            <td>${c.email}</td>
            <td><span class="badge badge-primary" style="background:#e0e7ff; color:#4f46e5">${labelStatusMap[c.status]}</span></td>
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
    if(!confirm("Tem certeza que deseja excluir o cliente? (Contratos associados devem ser apagados manualmente)")) return;
    let clientes = getDb('crm_clientes');
    clientes = clientes.filter(c => c.id !== id);
    localStorage.setItem('crm_clientes', JSON.stringify(clientes));
    if(!window.isFirebaseSyncing && window.db) { window.db.collection('crm_clientes').doc(id).delete(); }
    updateViews();
}

function abrirEdicaoCliente(id) {
    openModal('modal-cliente'); // Reseta antes de injetar os dados!

    const c = getDb('crm_clientes').find(x => x.id === id);
    if(!c) return;

    document.getElementById('cli-id').value = c.id;
    document.getElementById('cli-nome').value = c.nome;
    document.getElementById('cli-telefone').value = c.telefone;
    document.getElementById('cli-email').value = c.email || '';
    document.getElementById('cli-cpf').value = c.cpf || '';
    document.getElementById('cli-cnh').value = c.cnh || '';
    document.getElementById('cli-endereco').value = c.endereco || '';
    document.getElementById('cli-status').value = c.status;

    if(c.fotoCnh) {
        document.getElementById('cli-cnh-base64').value = c.fotoCnh;
        document.getElementById('cli-cnh-preview').src = c.fotoCnh;
        document.getElementById('cli-cnh-preview').style.display = 'block';
        document.getElementById('btn-remover-foto-cnh').style.display = 'inline-block';
    } else {
        document.getElementById('cli-cnh-base64').value = '';
        document.getElementById('cli-foto-cnh').value = '';
        document.getElementById('cli-cnh-preview').src = '';
        document.getElementById('cli-cnh-preview').style.display = 'none';
        document.getElementById('btn-remover-foto-cnh').style.display = 'none';
    }
}

// Client Profile / Notes
let currentClienteId = null;

function abrirPerfilCliente(id) {
    const c = getDb('crm_clientes').find(x => x.id === id);
    if(!c) return;
    currentClienteId = c.id;

    document.getElementById('perf-nome').innerText = c.nome;
    document.getElementById('perf-telefone').innerText = c.telefone;
    document.getElementById('perf-email').innerText = c.email || 'Nenhum email';
    document.getElementById('perf-cpf').innerText = c.cpf || 'Não informado';
    document.getElementById('perf-cnh').innerText = c.cnh || 'Não informado';
    document.getElementById('perf-endereco').innerText = c.endereco || 'Não informado';

    const cnhDiv = document.getElementById('perf-cnh-anexo');
    const cnhImg = document.getElementById('perf-foto-cnh');
    if(c.fotoCnh) {
        cnhDiv.style.display = 'block';
        cnhImg.src = c.fotoCnh;
    } else {
        cnhDiv.style.display = 'none';
        cnhImg.src = '';
    }
    
    const labelStatusMap = { 'novo':'Novo Lead', 'contato':'Contato Feito', 'proposta':'Proposta Enviada', 'fechado':'Fechado' };
    document.getElementById('perf-status').innerText = labelStatusMap[c.status];

    renderNotas(c);
    openModal('modal-perfil-cliente');
}

function renderNotas(cliente) {
    const box = document.getElementById('perf-notas');
    box.innerHTML = '';
    if(!cliente.notas || cliente.notas.length === 0) {
        box.innerHTML = '<span class="empty-state">Nenhuma anotação.</span>';
        return;
    }

    // Sort showing newest first if needed, we'll just show as added
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
    
    if(!textObj.value.trim()) return;

    let clientes = getDb('crm_clientes');
    let idx = clientes.findIndex(c => c.id === currentClienteId);
    
    if(idx > -1) {
        if(!clientes[idx].notas) clientes[idx].notas = [];
        clientes[idx].notas.push({
            text: textObj.value,
            date: dateObj.value
        });
        saveDb('crm_clientes', clientes);
        renderNotas(clientes[idx]);
        textObj.value = '';
        dateObj.value = '';
        updateViews(); // Update dashboard reminders
    }
}

// ==========================================
// MODULE: PIPELINE (KANBAN)
// ==========================================
function renderPipeline() {
    const clientes = getDb('crm_clientes');
    
    const columns = {
        'novo': document.getElementById('k-novo-lead').querySelector('.kanban-cards'),
        'contato': document.getElementById('k-contato').querySelector('.kanban-cards'),
        'proposta': document.getElementById('k-proposta').querySelector('.kanban-cards'),
        'fechado': document.getElementById('k-fechado').querySelector('.kanban-cards')
    };

    // Reset columns
    Object.keys(columns).forEach(k => columns[k].innerHTML = '');
    
    const counts = { 'novo': 0, 'contato': 0, 'proposta': 0, 'fechado': 0 };

    clientes.forEach(c => {
        const col = columns[c.status];
        counts[c.status]++;
        if(col) {
            col.innerHTML += `
                <div class="k-card" draggable="true" ondragstart="drag(event)" id="card-${c.id}" data-id="${c.id}">
                    <h4>${c.nome}</h4>
                    <p><i class="fa-solid fa-phone"></i> ${c.telefone}</p>
                    <div class="meta">
                        <span>#${c.id.substring(0,4).toUpperCase()}</span>
                    </div>
                </div>
            `;
        }
    });

    Object.keys(counts).forEach(k => {
        document.getElementById(`count-${k}`).innerText = counts[k];
    });
}

// Drag & Drop Handlers
function allowDrop(ev) {
    ev.preventDefault();
}

function drag(ev) {
    ev.dataTransfer.setData("text", ev.currentTarget.dataset.id);
}

function drop(ev) {
    ev.preventDefault();
    const id = ev.dataTransfer.getData("text");
    
    let targetZone = ev.target;
    // Find closest kanban-cards container
    while(!targetZone.classList.contains('kanban-cards')) {
        targetZone = targetZone.parentNode;
        if(targetZone.tagName === 'BODY') return;
    }

    const newStatus = targetZone.parentNode.getAttribute('data-stage');
    
    let clientes = getDb('crm_clientes');
    const idx = clientes.findIndex(c => c.id === id);
    if(idx > -1) {
        clientes[idx].status = newStatus;
        saveDb('crm_clientes', clientes);
        updateViews(); // Re-render to reflect new list & counters
    }
}


// ==========================================
// MODULE: FROTA
// ==========================================
function previewMotoPhoto(event) {
    const file = event.target.files[0];
    if(!file) return;

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
document.getElementById('form-moto').addEventListener('submit', function(e) {
    e.preventDefault();
    const idObj = document.getElementById('moto-id').value;
    const moto = {
        id: idObj || generateId(),
        placa: document.getElementById('moto-placa').value.toUpperCase(),
        cor: document.getElementById('moto-cor').value,
        modelo: document.getElementById('moto-modelo').value,
        ano: document.getElementById('moto-ano').value,
        valor: document.getElementById('moto-valor').value,
        status: document.getElementById('moto-status').value, // disponivel, manutencao, alugada
        foto: document.getElementById('moto-foto-base64').value
    };

    let motos = getDb('crm_motos');
    
    if(idObj) {
        motos = motos.map(m => m.id === idObj ? moto : m);
        
        // Verifica se a moto foi devolvida (status alterado para disponível)
        if(moto.status === 'disponivel') {
            let contratos = getDb('crm_contratos');
            let contratoModificado = false;
            contratos = contratos.map(c => {
                // Se existe contrato ativo com esta moto, marcamos como encerrado
                if(c.motoId === idObj && c.status === 'ativo') {
                    c.status = 'encerrado';
                    c.fim = new Date().toISOString().split('T')[0]; // Data de hoje
                    contratoModificado = true;
                }
                return c;
            });
            if(contratoModificado) {
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
    const filtered = motos.filter(m => m.placa.toLowerCase().includes(query) || m.modelo.toLowerCase().includes(query));
    
    const tbody = document.getElementById('table-motos');
    tbody.innerHTML = '';

    const contratos = getDb('crm_contratos');
    const clientes = getDb('crm_clientes');

    filtered.forEach(m => {
        let badgeClass = 'badge-disponivel';
        let statusLabel = 'Disponível';
        let modeloExibicao = m.modelo;

        if(m.status === 'alugada') { 
            badgeClass = 'badge-alugada'; 
            statusLabel = 'Alugada'; 
            
            // Busca o contrato ativo para pegar o nome
            const cAtivo = contratos.find(c => c.motoId === m.id && c.status === 'ativo');
            if(cAtivo) {
                const cli = clientes.find(c => c.id === cAtivo.clienteId);
                if(cli) {
                    modeloExibicao += ` <br><span style="font-size:0.8rem; color:var(--primary); font-weight:600;"><i class="fa-solid fa-user-tag"></i> <a href="#" onclick="imprimirContrato('${cAtivo.id}'); return false;" style="color:var(--primary); text-decoration:underline;" title="Ver Documento do Contrato">Com: ${cli.nome}</a></span>`;
                }
            }
        }
        if(m.status === 'manutencao') { badgeClass = 'badge-manutencao'; statusLabel = 'Em Manutenção'; }

        let photoDisplay = `<div style="width:40px; height:34px; border-radius:4px; border:1px solid var(--border); display:flex; align-items:center; justify-content:center; color:var(--text-muted); background:#f1f5f9;"><i class="fa-solid fa-motorcycle"></i></div>`;
        if(m.foto) {
            photoDisplay = `<img src="${m.foto}" style="width:40px; height:34px; object-fit:cover; border-radius:4px; border:1px solid var(--border);">`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="display:flex; align-items:center; gap:10px;">
                    ${photoDisplay}
                    <span style="font-size:0.75rem; color:var(--text-muted);">${m.id.substring(0,4).toUpperCase()}</span>
                </div>
            </td>
            <td><strong>${m.placa}</strong></td>
            <td>${modeloExibicao} <span style="color:var(--text-muted);">(${m.cor} - ${m.ano})</span></td>
            <td>R$ ${parseFloat(m.valor).toFixed(2)}</td>
            <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="abrirEdicaoMoto('${m.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger btn-sm" onclick="deletarMoto('${m.id}')" ${m.status === 'alugada' ? 'disabled' : ''}><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deletarMoto(id) {
    if(!confirm("Excluir moto?")) return;
    let motos = getDb('crm_motos');
    motos = motos.filter(m => m.id !== id);
    localStorage.setItem('crm_motos', JSON.stringify(motos));
    if(!window.isFirebaseSyncing && window.db) { window.db.collection('crm_motos').doc(id).delete(); }
    updateViews();
}

function abrirEdicaoMoto(id) {
    openModal('modal-moto'); // Reseta params padrões primeiro
    
    const moto = getDb('crm_motos').find(m => m.id === id);
    if(!moto) return;

    document.getElementById('moto-id').value = moto.id;
    document.getElementById('moto-placa').value = moto.placa;
    document.getElementById('moto-cor').value = moto.cor || '';
    document.getElementById('moto-modelo').value = moto.modelo;
    document.getElementById('moto-ano').value = moto.ano;
    // Set field values
    document.getElementById('moto-status').value = moto.status;
    document.getElementById('moto-valor').value = moto.valor;

    if(moto.foto) {
        document.getElementById('moto-foto-base64').value = moto.foto;
        document.getElementById('moto-foto-preview').src = moto.foto;
        document.getElementById('moto-foto-preview').style.display = 'inline-block';
        document.getElementById('moto-foto-placeholder').style.display = 'none';
        document.getElementById('btn-remover-foto-moto').style.display = 'inline-block';
    }
    
    document.getElementById('modal-moto-title').innerText = 'Editar Moto';
}

// ==========================================
// MODULE: CONTRATOS
// ==========================================
function populateContratoSelects() {
    const selCliente = document.getElementById('cont-cliente');
    const selMoto = document.getElementById('cont-moto');
    
    selCliente.innerHTML = '<option value="">Selecione um cliente</option>';
    getDb('crm_clientes').forEach(c => {
        selCliente.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
    });

    selMoto.innerHTML = '<option value="">Selecione uma moto</option>';
    getDb('crm_motos').filter(m => m.status === 'disponivel').forEach(m => {
        selMoto.innerHTML += `<option value="${m.id}" data-valor="${m.valor}">${m.placa} - ${m.modelo}</option>`;
    });
}

document.getElementById('cont-moto').addEventListener('change', calculateDiariaDisplay);

function calculateDiariaDisplay() {
    const selMoto = document.getElementById('cont-moto');
    const display = document.getElementById('cont-diaria-display');
    if(selMoto.selectedIndex > 0) {
        const val = selMoto.options[selMoto.selectedIndex].getAttribute('data-valor');
        display.innerText = `R$ ${parseFloat(val).toFixed(2)}`;
    } else {
        display.innerText = 'R$ 0,00';
    }
}


document.getElementById('form-contrato').addEventListener('submit', function(e) {
    e.preventDefault();
    const idObj = document.getElementById('cont-id').value;
    const contStatus = document.getElementById('cont-status').value;

    const motoId = document.getElementById('cont-moto').value;
    const clienteId = document.getElementById('cont-cliente').value;

    if(!motoId || !clienteId) {
        alert("Preencha cliente e moto.");
        return;
    }

    let dataInicioStr = document.getElementById('cont-inicio').value;
    
    // Calcular Vencimento (Início + 7 dias) se for novo contrato
    let calcProxVenc = '';
    if(dataInicioStr && !idObj) {
        let vDate = new Date(dataInicioStr + 'T00:00:00');
        vDate.setDate(vDate.getDate() + 7);
        calcProxVenc = vDate.toISOString().split('T')[0];
    }

    let contratos = getDb('crm_contratos');

    const contrato = {
        id: idObj || generateId(),
        clienteId: clienteId,
        motoId: motoId,
        inicio: dataInicioStr,
        fim: document.getElementById('cont-fim').value,
        caucao: document.getElementById('cont-caucao').value,
        status: contStatus // ativo, encerrado
    };

    if(!idObj) {
        contrato.dataProxVenc = calcProxVenc;
    }
    let motos = getDb('crm_motos');
    
    if(idObj) {
        // Preservar dataProxVenc ao editar
        const oldC = contratos.find(c => c.id === idObj);
        if(oldC) contrato.dataProxVenc = oldC.dataProxVenc;
        
        contratos = contratos.map(c => c.id === idObj ? contrato : c);
    } else {
        contratos.push(contrato);
        // Atualiza status da moto para 'alugada'
        let mIdx = motos.findIndex(m => m.id === motoId);
        if(mIdx > -1) motos[mIdx].status = 'alugada';
        saveDb('crm_motos', motos);
    }

    saveDb('crm_contratos', contratos);
    closeModal('modal-contrato');
    updateViews();
});

function renderContratos() {
    const contratos = getDb('crm_contratos');
    const clientes = getDb('crm_clientes');
    const motos = getDb('crm_motos');
    
    const tbody = document.getElementById('table-contratos');
    tbody.innerHTML = '';

    // reverse to show newest first
    const reversed = [...contratos].reverse();

    const todayDateObj = new Date();
    todayDateObj.setHours(0,0,0,0);

    reversed.forEach(c => {
        const cli = clientes.find(x => x.id === c.clienteId) || { nome: 'Removido' };
        const moto = motos.find(x => x.id === c.motoId) || { placa: 'Removida', modelo: '', valor: 0 };
        
        let badgeClass = c.status === 'ativo' ? 'badge-ativo' : 'badge-encerrado';
        
        let vencDisplay = '-';
        let isAtrasado = false;
        
        if(c.dataProxVenc && c.status === 'ativo') {
            const vDate = new Date(c.dataProxVenc + 'T00:00:00');
            const diffTime = vDate.getTime() - todayDateObj.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            vencDisplay = c.dataProxVenc.split('-').reverse().join('/');
            
            if(diffDays < 0) {
                vencDisplay = `<span style="color:var(--danger); font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> ${vencDisplay}</span>`;
                isAtrasado = true;
            } else if(diffDays === 0) {
                vencDisplay = `<span style="color:var(--warning); font-weight:700;"><i class="fa-regular fa-clock"></i> ${vencDisplay} (Hoje)</span>`;
            } else {
                vencDisplay = `<span>${vencDisplay}</span>`;
            }
        }

        const tr = document.createElement('tr');
        const numWhats = cli.telefone ? cli.telefone.replace(/\D/g, '') : '';
        const btnWhats = numWhats ? `<a href="https://wa.me/55${numWhats}" target="_blank" title="Chamar no WhatsApp" style="margin-left:5px;"><i class="fa-brands fa-whatsapp" style="color:#25d366; font-size:1.1rem;"></i></a>` : '';

        tr.innerHTML = `
            <td>
                <strong>${cli.nome}</strong><br>
                <span style="font-size:0.8rem; color:var(--text-muted);">${cli.telefone || 'S/N'} ${btnWhats}</span>
            </td>
            <td>${moto.modelo} <br><span style="font-size:0.75rem; color:var(--text-muted);">(${moto.placa})</span></td>
            <td>${c.inicio.split('-').reverse().join('/')}</td>
            <td>${vencDisplay}</td>
            <td>R$ ${parseFloat(moto.valor||0).toFixed(2)}</td>
            <td><span class="badge ${badgeClass}">${c.status.toUpperCase()}</span></td>
            <td>
                ${c.status === 'ativo' ? `<button class="btn btn-secondary btn-sm" onclick="abrirEdicaoContrato('${c.id}')"><i class="fa-solid fa-pen"></i></button>` : ''}
                ${c.status === 'ativo' ? `<button class="btn btn-success btn-sm" onclick="registrarPagamento('${c.id}')" title="Registrar Pagamento (+7 Dias)" style="background-color: var(--success); color: white; display: inline-flex; align-items: center; justify-content: center;"><i class="fa-solid fa-sack-dollar"></i></button>` : ''}
                <button class="btn btn-secondary btn-sm" onclick="imprimirContrato('${c.id}')" title="Imprimir Contrato" style="background-color: #475569; color: white;"><i class="fa-solid fa-print"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function registrarPagamento(id) {
    if(!confirm("Confirmar o recebimento? Isso empurrará o próximo vencimento para +7 dias.")) return;
    
    let contratos = getDb('crm_contratos');
    let idx = contratos.findIndex(c => c.id === id);
    if(idx > -1 && contratos[idx].dataProxVenc) {
        let vDate = new Date(contratos[idx].dataProxVenc + 'T00:00:00');
        vDate.setDate(vDate.getDate() + 7);
        contratos[idx].dataProxVenc = vDate.toISOString().split('T')[0];
        
        saveDb('crm_contratos', contratos);
        updateViews();
    }
}

function abrirEdicaoContrato(id) {
    openModal('modal-contrato'); // Reseta o form-contrato antes de injetar os dados!

    const c = getDb('crm_contratos').find(x => x.id === id);
    if(!c) return;

    // Populate selects manually to include the currently rented moto
    const selCliente = document.getElementById('cont-cliente');
    const selMoto = document.getElementById('cont-moto');
    
    selCliente.innerHTML = '<option value="">Selecione um cliente</option>';
    getDb('crm_clientes').forEach(cli => {
        selCliente.innerHTML += `<option value="${cli.id}" ${cli.id === c.clienteId ? 'selected' : ''}>${cli.nome}</option>`;
    });

    selMoto.innerHTML = '<option value="">Selecione uma moto</option>';
    getDb('crm_motos').forEach(m => {
        if(m.status === 'disponivel' || m.id === c.motoId) {
            selMoto.innerHTML += `<option value="${m.id}" data-valor="${m.valor}" ${m.id === c.motoId ? 'selected' : ''}>${m.placa} - ${m.modelo}</option>`;
        }
    });

    document.getElementById('cont-id').value = c.id;
    document.getElementById('cont-inicio').value = c.inicio;
    document.getElementById('cont-fim').value = c.fim;
    document.getElementById('cont-caucao').value = c.caucao || '';
    document.getElementById('cont-status').value = c.status;
    document.getElementById('cont-status').disabled = false;
    
    document.getElementById('btn-encerrar-contrato').style.display = 'block';

    calculateDiariaDisplay();
    // Also disable selecting different moto/client to keep logic simple
    selCliente.disabled = true;
    selMoto.disabled = true;
}

function encerrarContratoAtual() {
    if(!confirm("Encerrar contrato? A moto voltará a ficar disponível.")) return;
    
    const idObj = document.getElementById('cont-id').value;
    let contratos = getDb('crm_contratos');
    let motos = getDb('crm_motos');

    const cIdx = contratos.findIndex(c => c.id === idObj);
    if(cIdx > -1) {
        contratos[cIdx].status = 'encerrado';
        contratos[cIdx].fim = new Date().toISOString().split('T')[0]; // hoje
        
        let mIdx = motos.findIndex(m => m.id === contratos[cIdx].motoId);
        if(mIdx > -1) {
            motos[mIdx].status = 'disponivel';
            saveDb('crm_motos', motos);
        }

        saveDb('crm_contratos', contratos);
        
        // Restore enabled selects
        document.getElementById('cont-cliente').disabled = false;
        document.getElementById('cont-moto').disabled = false;

        closeModal('modal-contrato');
        updateViews();
    }
}

// Add Search Event Listeners
document.getElementById('search-cliente')?.addEventListener('input', renderClientes);
document.getElementById('search-moto')?.addEventListener('input', renderFrota);
document.getElementById('search-usuario')?.addEventListener('input', renderUsuarios);
// document.getElementById('search-contrato')?.addEventListener('input', renderContratos); // To implement if needed

// ==========================================
// MODULE: MEU PERFIL E FOTO
// ==========================================
function previewMyPhoto(event) {
    const file = event.target.files[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('meu-foto-preview').src = e.target.result;
        document.getElementById('meu-foto-base64').value = e.target.result;
    };
    reader.readAsDataURL(file);
}

function abrirMeuPerfil() {
    const sObj = JSON.parse(localStorage.getItem('crm_session'));
    if(!sObj) return;

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
    if(sObj) {
        // Atualizar Sessão Local
        sObj.foto = newFoto;
        localStorage.setItem('crm_session', JSON.stringify(sObj));
        
        // Atualizar foto no canto superior
        if(newFoto) {
            document.getElementById('logged-user-avatar').src = newFoto;
        }

        // Propagar no banco de dados geral
        let admins = getDb('crm_admins');
        const idx = admins.findIndex(a => a.id === sObj.id);
        if(idx > -1) {
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
    
    if(idObj) {
        // Preserve a foto ao editar dados gerenciais
        const oldAdmin = admins.find(a => a.id === idObj);
        if(oldAdmin) admin.foto = oldAdmin.foto;
        
        admins = admins.map(a => a.id === idObj ? admin : a);
    } else {
        // verifica se email existe
        if(admins.find(a => a.email === admin.email)) {
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
    const filtered = admins.filter(a => a.nome.toLowerCase().includes(query) || a.email.toLowerCase().includes(query));
    
    const tbody = document.getElementById('table-usuarios');
    if(!tbody) return;
    tbody.innerHTML = '';

    filtered.forEach(a => {
        const tr = document.createElement('tr');
        const userImg = a.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.nome)}&background=e2e8f0&color=94a3b8`;
        
        tr.innerHTML = `
            <td>
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${userImg}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
                    <span style="font-size:0.75rem; color:var(--text-muted);">#${a.id.substring(0,4).toUpperCase()}</span>
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
    if(admins.length <= 1) {
        alert('Você não pode deletar o único administrador do sistema!');
        return;
    }
    
    const currSession = JSON.parse(localStorage.getItem('crm_session'));
    if(currSession && currSession.id === id) {
        alert('Você não pode deletar a si mesmo enquanto estiver logado!');
        return;
    }

    if(!confirm("Excluir acesso deste administrador?")) return;
    
    admins = admins.filter(a => a.id !== id);
    localStorage.setItem('crm_admins', JSON.stringify(admins));
    if(!window.isFirebaseSyncing && window.db) { window.db.collection('crm_admins').doc(id).delete(); }
    updateViews();
}

function abrirEdicaoUsuario(id) {
    openModal('modal-usuario');
    
    const admin = getDb('crm_admins').find(a => a.id === id);
    if(!admin) return;

    document.getElementById('usr-id').value = admin.id;
    document.getElementById('usr-nome').value = admin.nome;
    document.getElementById('usr-email').value = admin.email;
    document.getElementById('usr-senha').value = admin.senha;
    document.getElementById('usr-nivel').value = admin.role || 'admin';
    
    document.getElementById('modal-usuario-title').innerText = 'Editar Usuário Admin';
}


// ==========================================
// CENTRAL UPDATE SYSTEM
// ==========================================
function updateViews() {
    renderDashboard();
    renderClientes();
    renderPipeline();
    renderFrota();
    renderContratos();
    renderUsuarios();
    populateContratoSelects(); // Mantenha as opções de clientes/motos de contrato sempre frescas
}

// INITIAL CALL
updateViews();

// ==========================================
// CNH PREVIEW & GERADOR DE CONTRATO
// ==========================================
function previewCnhPhoto(event) {
    const file = event.target.files[0];
    if(file) {
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

function imprimirContrato(contratoId) {
    const contratos = getDb('crm_contratos');
    const cont = contratos.find(c => c.id === contratoId);
    if(!cont) return alert('Contrato não encontrado!');
    
    const clientes = getDb('crm_clientes');
    const cliente = clientes.find(c => c.id === cont.clienteId);
    if(!cliente) return alert('Cliente associado não encontrado!');
    
    const motos = getDb('crm_motos');
    const moto = motos.find(m => m.id === cont.motoId);
    if(!moto) return alert('Moto associada não encontrada!');

    const valCaucao = cont.caucao ? parseFloat(cont.caucao).toFixed(2).replace('.', ',') : '0,00';
    const valDiaria = parseFloat(cont.diariaFechada).toFixed(2).replace('.', ',');

    const printHtml = `
<html>
<head>
    <title>Contrato de Locação - ${cliente.nome}</title>
    <style>
        body { font-family: 'Arial', sans-serif; padding: 40px; margin: 0; color: #000; line-height: 1.6; }
        h1 { text-align: center; margin-bottom: 30px; font-size: 20px; text-decoration: underline; }
        p { margin-bottom: 15px; font-size: 14px; }
        .section { margin-bottom: 25px; }
        .assinatura { margin-top: 60px; display: flex; justify-content: space-between; gap: 40px; }
        .assinatura-box { text-align: center; flex: 1; border-top: 1px solid #000; padding-top: 10px; }
        @media print { 
            @page { margin: 2cm; }
            body { padding: 0; }
        }
    </style>
</head>
<body onload="window.print()">
    <h1>CONTRATO DE LOCAÇÃO DE MOTOCICLETA</h1>
    
    <div class="section">
        <p><strong>LOCADOR:</strong> Henrique Rocha Clavijo, CPF: 852.216.190-91<br>
        Endereço: Rua Tenente Alpoin, 516 - Porto Alegre/RS</p>
    </div>

    <div class="section">
        <p><strong>LOCATÁRIO:</strong> Nome: ${cliente.nome}<br>
        CPF: ${cliente.cpf || '__________________'} &nbsp;&nbsp;&nbsp; CNH: ${cliente.cnh || '__________________'}<br>
        Endereço: ${cliente.endereco || '_____________________________________________________'}</p>
    </div>

    <div class="section">
        <p><strong>OBJETO:</strong> Motocicleta Modelo: ${moto.modelo} &nbsp;&nbsp;&nbsp; Placa: ${moto.placa} &nbsp;&nbsp;&nbsp; Ano: ${moto.ano}</p>
        <p><strong>PRAZO:</strong> ${cont.inicio.split('-').reverse().join('/')} até ${cont.fim.split('-').reverse().join('/')}</p>
        <p><strong>VALOR (Diária Base):</strong> R$ ${valDiaria}</p>
        <p><strong>CAUÇÃO:</strong> R$ ${valCaucao}</p>
    </div>

    <div class="section">
        <p><strong>RESPONSABILIDADE:</strong> O locatário responde por multas, danos, acidentes e uso indevido.</p>
        <p><strong>ROUBO/PERDA TOTAL:</strong> Indenização integral conforme tabela FIPE.</p>
        <p><strong>MULTAS:</strong> Autorizada indicação de condutor + taxa administrativa.</p>
        <p><strong>RASTREAMENTO:</strong> Veículo pode possuir rastreador.</p>
        <p><strong>FORO:</strong> Comarca de Porto Alegre/RS</p>
        <p><strong>ASSINATURA DIGITAL</strong> válida conforme legislação brasileira.</p>
    </div>

    <div class="assinatura">
        <div class="assinatura-box">
            LOCADOR
        </div>
        <div class="assinatura-box">
            LOCATÁRIO
        </div>
    </div>
</body>
</html>
    `;

    const ptWindow = window.open('', '_blank');
    ptWindow.document.write(printHtml);
    ptWindow.document.close();
}// Populate initial data demo if empty
if(getDb('crm_clientes').length === 0) {
    const dummyC = [
        {id: generateId(), nome: "João Silva", telefone: "11999999999", email: "joao@email.com", status: "novo", notas: []},
        {id: generateId(), nome: "Breno Souza", telefone: "11988888888", email: "breno@email.com", status: "fechado", notas: []}
    ];
    saveDb('crm_clientes', dummyC);

    const dummyM = [
        {id: generateId(), placa: "XYZ-1234", cor: "Vermelha", modelo: "Honda CG 160", ano: "2023", valor: "55", status: "disponivel"},
        {id: generateId(), placa: "ABC-9876", cor: "Preta", modelo: "Yamaha Fazer", ano: "2022", valor: "80", status: "disponivel"},
    ];
    saveDb('crm_motos', dummyM);

    updateViews();
}
