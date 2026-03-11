// CREDENCIAIS SUPABASE (Mesmas do admin)
const supabaseUrl = 'https://mnygtmcwgkrkqluaqyfe.supabase.co';
const supabaseKey = 'sb_publishable_Uj4W02FU_mmn4zA86JTukw_vbzRyMqR';
let dbClient = null;

// ELEMENTOS DA DOM
const loader = document.getElementById('loader');
const loginScreen = document.getElementById('login-screen');
const kdsDashboard = document.getElementById('kds-dashboard');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const btnLogout = document.getElementById('btn-logout');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnSound = document.getElementById('btn-sound');
const iconSound = document.getElementById('icon-sound');
const btnTestSound = document.getElementById('btn-test-sound');
const realtimeDot = document.getElementById('realtime-dot');
const realtimeText = document.getElementById('realtime-text');
const realtimeContainer = document.getElementById('realtime-status-container');
// Som gerado via Web Audio API (sem arquivo externo)
let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

let isSoundEnabled = true;
let kdsOrders = [];
let lastOrderCount = 0; // Para redundância de som
let isInitialLoad = true;
let realtimeSubscription = null;
let realtimeHeartbeat = null;

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    if (window.supabase) {
        dbClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        checkSession();
    } else {
        showError("Erro: Supabase não carregado.");
    }
});

// AUTENTICAÇÃO
async function checkSession() {
    const { data: { session } } = await dbClient.auth.getSession();
    if (session) {
        showKdsDashboard();
    } else {
        showLoginScreen();
    }
}

function showLoginScreen() {
    loader.classList.remove('active');
    kdsDashboard.style.display = 'none';
    loginScreen.style.display = 'flex';
}

function showKdsDashboard() {
    loginScreen.style.display = 'none';
    loader.classList.remove('active');
    kdsDashboard.style.display = 'flex';

    // Áudio agora é desbloqueado no primeiro clique do usuário no botão de som,
    // não precisa mais tentar o hack do autoplay.

    fetchActiveOrders();
    subscribeToRealtime();

    setInterval(updateTimeCounters, 60000); // Atualiza os tempos "Há X min" a cada 1 minuto
}

// LOGIN SUBMIT
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    loginError.style.display = 'none';
    loader.classList.add('active');

    const { data, error } = await dbClient.auth.signInWithPassword({ email, password });

    if (error) {
        loader.classList.remove('active');
        loginError.textContent = error.message;
        loginError.style.display = 'block';
    } else {
        showKdsDashboard();
    }
});

btnLogout.addEventListener('click', async () => {
    await dbClient.auth.signOut();
    if (realtimeSubscription) dbClient.removeChannel(realtimeSubscription);
    location.reload();
});

// FUNÇÕES DE BOTÕES DE TOPO
btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Erro ao tentar full screen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
});

btnSound.addEventListener('click', async () => {
    // 1. Tenta reforçar a permissão de notificações nativas
    if ("Notification" in window) {
        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        } else if (Notification.permission === 'denied') {
            alert("⚠️ Notificações Bloqueadas!\n\nPara receber alertas de novos pedidos, clique no cadeado ao lado da URL e mude 'Notificações' para 'Permitir'.");
        }
    }

    // 2. Reforça OneSignal se disponível
    if (window.OneSignalDeferred) {
        OneSignalDeferred.push(async function (OneSignal) {
            const isPushSupported = OneSignal.Notifications.isPushSupported();
            if (isPushSupported) {
                await OneSignal.Notifications.requestPermission();
            }
        });
    }

    // 3. Toggle do som (função original)
    isSoundEnabled = !isSoundEnabled;
    if (isSoundEnabled) {
        iconSound.className = 'ph-fill ph-bell-ringing';
        iconSound.style.color = '';
        // Teste de som rápido para confirmar
        playNotification(true);
    } else {
        iconSound.className = 'ph ph-bell-slash';
        iconSound.style.color = '#ef4444';
    }
});

btnTestSound.addEventListener('click', () => {
    // Toca o sino e mostra flash para teste
    playNotification(true);
    document.body.classList.add('kds-flash');
    setTimeout(() => {
        document.body.classList.remove('kds-flash');
    }, 2400);
});

function playNotification(isTest = false) {
    if (!isSoundEnabled && !isTest) return;

    // A. Notificação Nativa (Browser)
    if ("Notification" in window && Notification.permission === "granted" && !isTest) {
        new Notification("🌭 Novo Pedido Chegou!", {
            body: "Verifique o painel da cozinha agora.",
            icon: "img/logo_hotdog_viviane.png"
        });
    }

    // B. Alerta Sonoro: SINO DE OURO 🔔
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;

        // Harmônicos do Sino: Fundamental + Brilho
        const freqs = [523.25, 1046.50, 1567.98, 2093.00]; // Dó5, Dó6, Sol6, Dó7

        freqs.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'triangle'; // Som mais rico que sine, mais suave que sawtooth
            osc.frequency.value = f;

            osc.connect(gain);
            gain.connect(ctx.destination);

            // Envelope do Sino: Ataque instantâneo e decaimento longo
            const volume = i === 0 ? 0.4 : 0.2 / i; // Fundamental mais alta
            const duration = 1.5 - (i * 0.2); // Harmônicos agudos somem mais rápido

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(volume, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

            osc.start(now);
            osc.stop(now + duration);
        });
    } catch (e) {
        console.log('Áudio não disponível:', e);
    }

    // C. Flash visual na tela
    if (!isTest) {
        document.body.classList.add('kds-flash');
        setTimeout(() => {
            document.body.classList.remove('kds-flash');
        }, 2400); // 3 piscadas de 0.8s = 2.4s
    }
}

// BUSCA E RENDERIZAÇÃO DE PEDIDOS
async function fetchActiveOrders() {
    const { data, error } = await dbClient
        .from('orders')
        .select('*')
        .in('status', ['pendente', 'preparando', 'pronto'])
        .order('created_at', { ascending: true }); // Mais antigos primeiro

    if (error) {
        console.error("Erro ao buscar pedidos", error);
        return;
    }

    kdsOrders = data || [];

    // Redundância: Toca som se houver novo pedido detectado via polling (caso realtime falhe)
    if (!isInitialLoad && kdsOrders.filter(o => o.status === 'pendente').length > lastOrderCount) {
        playNotification();
    }
    lastOrderCount = kdsOrders.filter(o => o.status === 'pendente').length;
    isInitialLoad = false;

    renderLanes();
}

function renderLanes() {
    const pendentes = kdsOrders.filter(o => o.status === 'pendente');
    const preparando = kdsOrders.filter(o => o.status === 'preparando');
    const prontos = kdsOrders.filter(o => {
        if (o.status !== 'pronto') return false;
        // Só exibe se for mais recente que 24 horas
        const diffHours = (new Date() - new Date(o.created_at)) / 3600000;
        return diffHours <= 24;
    });

    document.getElementById('count-pendente').textContent = pendentes.length;
    document.getElementById('count-preparando').textContent = preparando.length;
    document.getElementById('count-pronto').textContent = prontos.length;

    renderCards('cards-pendente', pendentes);
    renderCards('cards-preparando', preparando);
    renderCards('cards-pronto', prontos);
}

function renderCards(containerId, orders) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="kds-empty-state">
                <i class="ph ph-coffee"></i>
                Nenhum pedido nesta etapa.
            </div>`;
        return;
    }

    orders.forEach(order => {
        const orderDate = new Date(order.created_at);
        const diffMinutes = Math.floor((new Date() - orderDate) / 60000);
        const timeText = diffMinutes > 0 ? `Há ${diffMinutes} min` : 'Agora';
        const isLate = diffMinutes > 30;

        let items = [];
        try { items = JSON.parse(order.items); } catch (e) { }

        let customerInfo = {};
        try { customerInfo = JSON.parse(order.customer_details); } catch (e) { }

        const totalItems = items.reduce((acc, i) => acc + (i.name.includes("Desconto") ? 0 : i.quantity), 0);
        // Gera um ID numérico falso de 4 a 5 digitos a partir do UUID para ser lido mais facilmente
        const numericHash = parseInt(order.id.replace(/-/g, '').substring(0, 8), 16).toString();
        const shortId = numericHash.substring(numericHash.length - 4);

        let badgeClass = order.delivery_type === 'entrega' ? 'entrega' : 'retirada';
        let badgeLabel = order.delivery_type === 'entrega' ? 'Entrega' : 'Retirada';

        const card = document.createElement('div');
        card.className = `kds-card-compact ${diffMinutes === 0 ? 'new' : ''}`;
        card.onclick = () => openKdsModal(order.id);

        card.innerHTML = `
            <div class="kds-compact-header">
                <div class="kds-compact-id">#${shortId}</div>
                <div class="kds-compact-time ${isLate ? 'late' : ''}"><i class="ph ph-clock"></i> ${timeText}</div>
            </div>
            <div class="kds-compact-body">
                <div class="kds-compact-client"><i class="ph ph-user"></i> ${customerInfo.name || 'Cliente'}</div>
                <div class="kds-compact-items-count">${totalItems} itens</div>
            </div>
            <div class="kds-compact-footer">
                <div class="kds-badge-mini ${badgeClass}">${badgeLabel}</div>
                <div class="kds-action-hint" style="display:flex; gap:10px; align-items:center;">
                    <span style="font-size:0.75rem; text-decoration:underline;">Detalhes</span>
                    ${getCompactActionButtons(order)}
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function getCompactActionButtons(order) {
    if (order.status === 'pendente') {
        return `<button class="btn-primary" onclick="event.stopPropagation(); changeOrderStatus('${order.id}', 'preparando'); " style="padding: 6px 12px; font-size: 0.8rem; border-radius: 4px; pointer-events:all;"><i class="ph ph-cooking-pot"></i> Preparar</button>`;
    } else if (order.status === 'preparando') {
        const undoBtn = `<button class="btn-secondary tooltip" onclick="event.stopPropagation(); changeOrderStatus('${order.id}', 'pendente'); " style="padding: 6px 10px; font-size: 1rem; border-radius: 4px; pointer-events:all; outline:none; border: 1px solid rgba(255,255,255,0.2); background: transparent;" title="Desfazer (Voltar p/ Pendentes)"><i class="ph ph-arrow-u-up-left"></i></button>`;
        return `
            ${undoBtn}
            <button class="kds-btn-done" onclick="event.stopPropagation(); changeOrderStatus('${order.id}', 'pronto'); " style="padding: 6px 12px; font-size: 0.8rem; border-radius: 4px; border:none; color:white; font-weight:bold; cursor:pointer; pointer-events:all;"><i class="ph ph-check-circle"></i> Pronto</button>
        `;
    } else if (order.status === 'pronto') {
        let customerInfo = {};
        try { customerInfo = JSON.parse(order.customer_details); } catch (e) { }
        const phone = (customerInfo.phone || '').replace(/\D/g, '');
        let waMsg = '';
        if (order.delivery_type === 'entrega') {
            waMsg = encodeURIComponent(`Olá ${customerInfo.name || ''}! \ud83d\ude0a Seu pedido está a caminho! Nosso entregador já saiu com seu pedido. Fique de olho! \ud83d\ude0b`);
        } else {
            waMsg = encodeURIComponent(`Olá ${customerInfo.name || ''}! \ud83d\ude0a Seu pedido está pronto para retirada! Pode vir buscar quando quiser. Te esperamos! \ud83c\udf55`);
        }
        const waUrl = phone ? `https://wa.me/55${phone}?text=${waMsg}` : null;
        const waBtnHtml = waUrl
            ? `<a href="${waUrl}" target="_blank" onclick="event.stopPropagation();" class="btn-whatsapp-compact"><i class="ph-fill ph-whatsapp-logo"></i> Avisar</a>`
            : '';

        const undoBtn = `<button class="btn-secondary tooltip" onclick="event.stopPropagation(); changeOrderStatus('${order.id}', 'preparando'); " style="padding: 6px 10px; font-size: 1rem; border-radius: 4px; pointer-events:all; outline:none; border: 1px solid rgba(255,255,255,0.2); background: transparent;" title="Desfazer (Voltar para Preparo)"><i class="ph ph-arrow-u-up-left"></i></button>`;

        return `
            ${undoBtn}
            ${waBtnHtml}
            <button class="btn-secondary" onclick="event.stopPropagation(); changeOrderStatus('${order.id}', 'entregue'); " style="padding: 6px 12px; font-size: 0.8rem; border-radius: 4px; pointer-events:all;"><i class="ph ph-paper-plane-tilt"></i> Entregar</button>
        `;
    }
    return '';
}

function openKdsModal(orderId) {
    const order = kdsOrders.find(o => o.id.toString() === orderId.toString());
    if (!order) return;

    let items = []; try { items = JSON.parse(order.items); } catch (e) { }
    let customerInfo = {}; try { customerInfo = JSON.parse(order.customer_details); } catch (e) { }

    const numericHash = parseInt(order.id.replace(/-/g, '').substring(0, 8), 16).toString();
    const shortId = numericHash.substring(numericHash.length - 4);
    document.getElementById('modal-order-id').textContent = `#${shortId}`;
    document.getElementById('modal-customer-name').textContent = customerInfo.name || 'Cliente Sem Nome';

    // Configura o Endereço ou Mostra Retirada
    const addressContainer = document.getElementById('modal-order-address');
    if (order.delivery_type === 'entrega') {
        const addrText = customerInfo.address || 'Endereço não informado';
        addressContainer.innerHTML = `<strong>📍 Endereço de Entrega:</strong><br><span style="white-space: pre-wrap;">${addrText}</span>`;
        addressContainer.style.display = 'block';
        document.getElementById('modal-order-badge').innerHTML = `<div class="kds-delivery-badge entrega" style="margin: 0;"><i class="ph-fill ph-motorcycle"></i> ENTREGA</div>`;
    } else {
        addressContainer.style.display = 'none';
        document.getElementById('modal-order-badge').innerHTML = `<div class="kds-delivery-badge retirada" style="margin: 0;"><i class="ph-fill ph-storefront"></i> RETIRADA NO LOCAL</div>`;
    }

    // Lista de Itens
    const itemsContainer = document.getElementById('modal-order-items');
    itemsContainer.innerHTML = (Array.isArray(items) ? items : []).filter(i => i && i.name && !i.name.includes("Desconto")).map(i => `
        <li><span class="qty">${i.quantity}</span> ${i.name}</li>
    `).join('');

    // Botões
    const actionsContainer = document.getElementById('modal-order-actions');
    actionsContainer.innerHTML = getActionButtons(order, customerInfo);

    const modal = document.getElementById('kds-order-modal');
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('active');
        modal.style.opacity = '1';
        modal.style.visibility = 'visible';
        modal.style.pointerEvents = 'auto';
    }, 10);
}

function closeKdsModal() {
    const modal = document.getElementById('kds-order-modal');
    modal.classList.remove('active');
    modal.style.opacity = '0';
    modal.style.visibility = 'hidden';
    modal.style.pointerEvents = 'none';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

function getActionButtons(order, customerInfo = {}) {
    if (order.status === 'pendente') {
        return `<button class="btn-primary" onclick="changeOrderStatus('${order.id}', 'preparando'); closeKdsModal();" style="flex:1; padding: 15px; font-size: 1.2rem;"><i class="ph ph-cooking-pot"></i> Começar a Preparar</button>`;
    } else if (order.status === 'preparando') {
        return `
            <div style="display:flex; gap:12px; width:100%;">
                <button class="btn-secondary" onclick="changeOrderStatus('${order.id}', 'pendente'); closeKdsModal();" style="flex:0.2; padding: 14px; font-size: 1.5rem; display:flex; justify-content:center; align-items:center;" title="Desfazer (Voltar p/ Pendentes)"><i class="ph ph-arrow-u-up-left"></i></button>
                <button class="kds-btn-done" onclick="changeOrderStatus('${order.id}', 'pronto'); closeKdsModal();" style="flex:1; padding: 15px; font-size: 1.2rem; cursor: pointer; border: none; border-radius: var(--radius-md); font-weight: bold;"><i class="ph ph-check-circle"></i> Marcar como Pronto</button>
            </div>`;
    } else if (order.status === 'pronto') {
        // Montar mensagem de WhatsApp personalizada
        const phone = (customerInfo.phone || '').replace(/\D/g, '');
        let waMsg = '';
        let waBtnLabel = '';
        if (order.delivery_type === 'entrega') {
            waMsg = encodeURIComponent(`Olá ${customerInfo.name || ''}! \ud83d\ude0a Seu pedido está a caminho! Nosso entregador já saiu com seu pedido. Fique de olho! \ud83d\ude0b`);
            waBtnLabel = "📨 Avisar: Saiu pra Entrega";
        } else {
            waMsg = encodeURIComponent(`Olá ${customerInfo.name || ''}! \ud83d\ude0a Seu pedido está pronto para retirada! Pode vir buscar quando quiser. Te esperamos! \ud83c\udf55`);
            waBtnLabel = "📨 Avisar: Pronto p/ Retirada";
        }
        const waUrl = phone ? `https://wa.me/55${phone}?text=${waMsg}` : null;
        const waBtnHtml = waUrl
            ? `<a href="${waUrl}" target="_blank" style="flex:1; display:flex; align-items:center; justify-content:center; gap:8px; background:#25d366; color:#fff; font-weight:bold; font-size:1rem; padding:14px; border-radius:8px; text-decoration:none;">${waBtnLabel}</a>`
            : '';
        return `
            <div style="display:flex; gap:12px; flex-direction:column; width:100%;">
                ${waBtnHtml}
                <div style="display:flex; gap:12px; width:100%;">
                    <button class="btn-secondary" onclick="changeOrderStatus('${order.id}', 'preparando'); closeKdsModal();" style="flex:0.2; padding: 14px; font-size: 1.5rem; display:flex; justify-content:center; align-items:center;" title="Desfazer (Voltar para Preparo)"><i class="ph ph-arrow-u-up-left"></i></button>
                    <button class="btn-secondary" onclick="changeOrderStatus('${order.id}', 'entregue'); closeKdsModal();" style="flex:1; padding: 14px; font-size: 1rem;"><i class="ph ph-paper-plane-tilt"></i> Entregar / Despachar</button>
                </div>
            </div>`;
    }
    return '';
}

// Escuta o botão de fechar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    const btnClose = document.getElementById('close-kds-modal');
    if (btnClose) btnClose.addEventListener('click', closeKdsModal);
});

// ATUALIZAR STATUS NO BANCO
window.changeOrderStatus = async function (orderId, newStatus) {
    const orderIndex = kdsOrders.findIndex(o => o.id.toString() === orderId.toString());
    if (orderIndex > -1) {
        // Optimistic UI Update pra parecer mais rapido
        const oldStatus = kdsOrders[orderIndex].status;
        kdsOrders[orderIndex].status = newStatus;
        if (newStatus === 'entregue') {
            kdsOrders.splice(orderIndex, 1);
        }
        renderLanes();

        // Em background, atualiza o bano
        const { error } = await dbClient.from('orders').update({ status: newStatus }).eq('id', orderId);
        if (error) {
            console.error("Erro ao atualizar status", error);
            // Reverte em caso de erro
            if (newStatus !== 'entregue') {
                kdsOrders[orderIndex].status = oldStatus;
            } else {
                fetchActiveOrders(); // Força fetch total
            }
            renderLanes();
            alert("Erro ao atualizar o pedido no servidor.");
        }
    }
}

// SUPABASE REALTIME (A MAGIA)
function subscribeToRealtime() {
    realtimeSubscription = dbClient.channel('custom-all-channel')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'orders' },
            (payload) => {
                const { eventType, new: newRecord, old: oldRecord } = payload;

                if (eventType === 'INSERT') {
                    if (['pendente', 'preparando', 'pronto'].includes(newRecord.status)) {
                        kdsOrders.push(newRecord);
                        playNotification();
                        renderLanes();
                    }
                }
                else if (eventType === 'UPDATE') {
                    const index = kdsOrders.findIndex(o => o.id === newRecord.id);
                    if (['pendente', 'preparando', 'pronto'].includes(newRecord.status)) {
                        if (index > -1) {
                            kdsOrders[index] = newRecord;
                        } else {
                            kdsOrders.push(newRecord);
                        }
                    } else {
                        // Se foi pra "entregue" ou algo assim, remove da KDS
                        if (index > -1) kdsOrders.splice(index, 1);
                    }
                    renderLanes();
                }
                else if (eventType === 'DELETE') {
                    const index = kdsOrders.findIndex(o => o.id === oldRecord.id);
                    if (index > -1) {
                        kdsOrders.splice(index, 1);
                        renderLanes();
                    }
                }
            }
        )
        .subscribe((status) => {
            console.log("Status Realtime:", status);
            updateRealtimeUI(status);
        });

    // Heartbeat: checa a cada 30 min se deslogou sozinho e re-inscreve
    if (realtimeHeartbeat) clearInterval(realtimeHeartbeat);
    realtimeHeartbeat = setInterval(() => {
        if (realtimeSubscription && realtimeSubscription.state !== 'joined') {
            console.log("Tentando reconectar Supabase Realtime...");
            dbClient.removeChannel(realtimeSubscription);
            subscribeToRealtime();
        }
    }, 30 * 60 * 1000);

    // Polling redundante a cada 15 segundos para garantir que nenhum pedido fuja sem som
    setInterval(() => {
        if (dbClient) fetchActiveOrders();
    }, 15000);
}

function updateRealtimeUI(status) {
    if (!realtimeDot || !realtimeText) return;

    if (status === 'SUBSCRIBED') {
        realtimeDot.style.backgroundColor = '#10b981'; // Verde
        realtimeDot.classList.add('pulse-dot');
        realtimeText.textContent = 'Ao Vivo';
        realtimeText.style.color = '#10b981';
    } else if (status === 'TIMED_OUT' || status === 'CLOSED') {
        realtimeDot.style.backgroundColor = '#ef4444'; // Vermelho
        realtimeDot.classList.remove('pulse-dot');
        realtimeText.textContent = 'Reconectando...';
        realtimeText.style.color = '#ef4444';

        // Tenta re-inscrever em caso de erro
        setTimeout(subscribeToRealtime, 5000);
    } else {
        realtimeDot.style.backgroundColor = '#f59e0b'; // Laranja
        realtimeDot.classList.remove('pulse-dot');
        realtimeText.textContent = 'Conectando...';
        realtimeText.style.color = '#f59e0b';
    }
}

function updateTimeCounters() {
    renderLanes();
}

function showError(msg) {
    loader.innerHTML = `<p style="color:#ef4444; font-weight:bold;">${msg}</p>`;
}
