// ==================================================
// FACILITA MOTO • GERENCIADOR DE INSTALAÇÃO DO APP (PWA)
// Compatível com PC (Windows/Mac), Android e iOS (iPhone/iPad)
// ==================================================

let deferredInstallPrompt = null;

// Registra Service Worker com atualização forçada em mobile
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
            console.log('✅ [PWA] Service Worker registrado com sucesso:', reg.scope);
            if (reg.update) {
                reg.update();
            }
        }).catch((err) => {
            console.warn('⚠️ [PWA] Falha ao registrar Service Worker:', err);
        });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('🔄 [PWA] Nova versão do app carregada! Atualizando tela...');
        window.location.reload();
    });
}

// Captura evento de instalação no PC (Chrome/Edge) e Android
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    console.log('📲 [PWA] Evento de instalação capturado e pronto para disparo.');
});

window.addEventListener('appinstalled', () => {
    console.log('🎉 [PWA] Aplicativo instalado com sucesso!');
    deferredInstallPrompt = null;
});

// Função acionada pelo botão "Criar App" / "Instalar Aplicativo"
function acionarInstalacaoApp() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    if (isStandalone) {
        alert('O aplicativo FACILITA MOTO já está instalado e aberto em modo app no seu dispositivo!');
        return;
    }

    // Caso 1: Dispositivos com suporte nativo a prompt (PC Chrome/Edge e Android)
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('Usuário aceitou a instalação do aplicativo');
            }
            deferredInstallPrompt = null;
        });
        return;
    }

    // Caso 2: iOS (iPhone/iPad - Safari)
    if (isIOS) {
        abrirModalInstrucoesApp('ios');
        return;
    }

    // Caso 3: Desktop ou Navegador sem prompt automático
    abrirModalInstrucoesApp('desktop');
}

// Criação e exibição da Modal de Instruções de Instalação
function abrirModalInstrucoesApp(tipo) {
    let modal = document.getElementById('modal-instrucoes-pwa');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-instrucoes-pwa';
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.78);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        `;
        document.body.appendChild(modal);
    }

    const conteudoIOS = `
        <div style="background: #131c2e; border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; max-width: 440px; width: 100%; padding: 26px 22px; color: #f8fafc; text-align: center; box-shadow: 0 20px 45px rgba(0,0,0,0.5);">
            <div style="width: 62px; height: 62px; margin: 0 auto 16px; border-radius: 14px; background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; color: #38bdf8;">
                <i class="fa-brands fa-apple"></i>
            </div>
            <h3 style="margin: 0 0 8px; font-size: 1.25rem; font-weight: 800;">Instalar no iPhone / iPad</h3>
            <p style="font-size: 0.88rem; color: #94a3b8; margin: 0 0 22px; line-height: 1.45;">
                Adicione o app da <strong>FACILITA MOTO</strong> à sua tela de início para abrir em tela cheia com acesso instantâneo:
            </p>
            
            <div style="text-align: left; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px 16px; margin-bottom: 22px; display: flex; flex-direction: column; gap: 14px; font-size: 0.88rem;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="width: 28px; height: 28px; border-radius: 50%; background: #38bdf8; color: #090d16; font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0;">1</span>
                    <span>No Safari, toque no botão <strong>Compartilhar</strong> (<i class="fa-solid fa-arrow-up-from-bracket" style="color:#38bdf8;"></i>) na barra inferior.</span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="width: 28px; height: 28px; border-radius: 50%; background: #38bdf8; color: #090d16; font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0;">2</span>
                    <span>Role para cima e toque em <strong>"Adicionar à Tela de Início"</strong> (<i class="fa-regular fa-square-plus" style="color:#38bdf8;"></i>).</span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="width: 28px; height: 28px; border-radius: 50%; background: #38bdf8; color: #090d16; font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0;">3</span>
                    <span>Toque em <strong>"Adicionar"</strong> no canto superior direito. Pronto!</span>
                </div>
            </div>

            <button type="button" onclick="fecharModalInstrucoesApp()" style="width: 100%; background: #38bdf8; color: #090d16; font-weight: 800; font-size: 0.95rem; padding: 12px; border-radius: 10px; border: none; cursor: pointer;">
                Entendi
            </button>
        </div>
    `;

    const conteudoDesktop = `
        <div style="background: #131c2e; border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; max-width: 440px; width: 100%; padding: 26px 22px; color: #f8fafc; text-align: center; box-shadow: 0 20px 45px rgba(0,0,0,0.5);">
            <div style="width: 62px; height: 62px; margin: 0 auto 16px; border-radius: 14px; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; color: #10b981;">
                <i class="fa-solid fa-laptop"></i>
            </div>
            <h3 style="margin: 0 0 8px; font-size: 1.25rem; font-weight: 800;">Criar Aplicativo no Computador</h3>
            <p style="font-size: 0.88rem; color: #94a3b8; margin: 0 0 22px; line-height: 1.45;">
                Você pode instalar a <strong>FACILITA MOTO</strong> como um programa leve no seu Windows ou Mac com ícone na área de trabalho e barra de tarefas:
            </p>
            
            <div style="text-align: left; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px 16px; margin-bottom: 22px; display: flex; flex-direction: column; gap: 14px; font-size: 0.88rem;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="width: 28px; height: 28px; border-radius: 50%; background: #10b981; color: #090d16; font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0;">1</span>
                    <span>No topo do seu navegador (Google Chrome ou Edge), clique no ícone de <strong>Instalar</strong> (<i class="fa-solid fa-circle-down" style="color:#10b981;"></i>) na barra de endereços.</span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="width: 28px; height: 28px; border-radius: 50%; background: #10b981; color: #090d16; font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0;">2</span>
                    <span>Ou clique nos <strong>3 pontinhos do menu</strong> do navegador > <strong>"Salvar e Compartilhar"</strong> > <strong>"Instalar aplicativo"</strong>.</span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="width: 28px; height: 28px; border-radius: 50%; background: #10b981; color: #090d16; font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0;">3</span>
                    <span>O app será aberto em janela dedicada sem barras de navegador!</span>
                </div>
            </div>

            <button type="button" onclick="fecharModalInstrucoesApp()" style="width: 100%; background: #10b981; color: #090d16; font-weight: 800; font-size: 0.95rem; padding: 12px; border-radius: 10px; border: none; cursor: pointer;">
                Entendi
            </button>
        </div>
    `;

    modal.innerHTML = tipo === 'ios' ? conteudoIOS : conteudoDesktop;
    modal.style.display = 'flex';
}

function fecharModalInstrucoesApp() {
    const modal = document.getElementById('modal-instrucoes-pwa');
    if (modal) modal.style.display = 'none';
}
