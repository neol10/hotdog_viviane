// REI NEO - Sistema de Gestão Suprema 👑
const supabaseUrl = 'https://mnygtmcwgkrkqluaqyfe.supabase.co';
const supabaseKey = 'sb_publishable_Uj4W02FU_mmn4zA86JTukw_vbzRyMqR';
let dbClient = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

// Elementos Globais
const adminLoader = document.getElementById('admin-loader');
let adminTabs = null;
let adminTabContents = null;

// Memória Local
let localCategories = [];
let localProducts = [];
let localOrders = [];
let localCustomers = [];
let localCoupons = [];
let globalSettings = null;
let lastOrderCount = 0; // Para notificação de áudio
let isInitialLoad = true;

// Helper para evitar XSS
function esc(t) {
    if (!t) return "";
    return t.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function initAdmin() {
    if (!dbClient && window.supabase) {
        dbClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    }
    if (dbClient) {
        initTabs();
        fetchAllData();
    } else {
        if (adminLoader) adminLoader.innerHTML = '<p style="color:red;">Falha ao carregar banco.</p>';
    }
}

// 1. SISTEMA DE ABAS
function initTabs() {
    adminTabs = document.querySelectorAll('.admin-tab');
    adminTabContents = document.querySelectorAll('.admin-tab-content');

    adminTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;

            adminTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            adminTabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === target) content.classList.add('active');
            });
        });
    });
}

// 2. BUSCA DE DADOS (DASHBOARD)
async function fetchAllData(isSilent = false) {
    if (!dbClient) return;
    if (!isSilent) showLoader(true);
    try {
        const [cats, prods, orders, customers, coupons, settingsData] = await Promise.all([
            dbClient.from('categories').select('*').order('order_index'),
            dbClient.from('products').select('*').order('name'),
            dbClient.from('orders').select('*').order('created_at', { ascending: false }),
            dbClient.from('customers').select('*').order('created_at', { ascending: false }),
            dbClient.from('coupons').select('*').order('created_at', { ascending: false }),
            dbClient.from('settings').select('*').eq('id', 1).single()
        ]);

        if (cats.error) console.error("Erro categorias:", cats.error);
        if (prods.error) console.error("Erro produtos:", prods.error);

        localCategories = cats.data || [];
        localProducts = prods.data || [];
        localOrders = orders.data || [];
        localCustomers = customers.data || [];
        localCoupons = coupons.data || [];
        globalSettings = settingsData.data || { is_open: true, schedule: {} };

        // Sincroniza contagem de pedidos
        if (localOrders.length > lastOrderCount && !isInitialLoad) {
            const sound = document.getElementById('order-sound');
            if (sound) sound.play().catch(e => console.warn("Erro ao tocar áudio:", e));
        }

        lastOrderCount = localOrders.length;
        isInitialLoad = false;

        renderAll();
    } catch (e) {
        console.error(e);
        if (!isSilent) alert("Erro ao sincronizar dados!");
    } finally {
        if (!isSilent) showLoader(false);
    }
}

function showLoader(show) {
    if (adminLoader) adminLoader.style.display = show ? 'block' : 'none';
}

function renderAll() {
    renderProducts();
    renderCategories();
    renderOrders();
    renderCustomers();
    renderCoupons();
    renderSettings();
    populateCategorySelect();
}

// 3. GESTÃO DE PRODUTOS
function renderProducts() {
    const container = document.getElementById('admin-menu-container');
    if (!container) return;
    container.innerHTML = '';
    localCategories.forEach(cat => {
        const prods = localProducts.filter(p => p.category_id === cat.id);
        const section = document.createElement('div');
        section.className = 'admin-category';
        section.innerHTML = `<h3>${esc(cat.name)}</h3>`;
        const list = document.createElement('div');
        list.className = 'admin-products-list';
        prods.forEach(p => {
            const item = document.createElement('div');
            item.className = 'admin-product-item';
            item.innerHTML = `
                <div class="admin-product-info">
                    <h4>${esc(p.name)}</h4>
                    <p>${esc(p.description || '')}</p>
                </div>
                <div class="admin-product-price">R$ ${p.price.toFixed(2).replace('.', ',')}</div>
                <div class="admin-product-actions">
                    <button class="btn-toggle-status ${p.is_active ? '' : 'is-paused'}" onclick="toggleStatus('${p.id}', ${p.is_active})">
                        ${p.is_active ? 'Ativo' : 'Pausado'}
                    </button>
                    <button class="btn-edit-item" onclick="openProductModal('${p.id}')">Editar</button>
                    <button class="btn-edit-item" style="background:#ef4444;" onclick="deleteProduct('${p.id}')">X</button>
                </div>
            `;
            list.appendChild(item);
        });
        section.appendChild(list);
        container.appendChild(section);
    });
}

// 4. UPLOAD DE IMAGEM
async function uploadImage(file) {
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}.${ext}`;
    const { error } = await dbClient.storage.from('product-images').upload(fileName, file);
    if (error) throw error;
    const { data: { publicUrl } } = dbClient.storage.from('product-images').getPublicUrl(fileName);
    return publicUrl;
}

// 5. SALVAR PRODUTO
const prodModal = document.getElementById('modal-product');
const prodForm = document.getElementById('product-form');

window.openProductModal = (id = null) => {
    if (!prodForm || !prodModal) return;
    prodForm.reset();
    document.getElementById('prod-id').value = id || '';
    
    // 1. Popula categorias primeiro
    populateCategorySelect();

    if (id) {
        console.log("Editando ID:", id);
        console.log("Tipos no localProducts:", localProducts.map(x => ({id: x.id, type: typeof x.id})));
        
        // Converte ambos para String para comparação 100% segura
        const p = localProducts.find(x => String(x.id) === String(id));
        
        if (p) {
            console.log("Encontrei o produto:", p);
            document.getElementById('prod-category').value = String(p.category_id);
            document.getElementById('prod-name').value = p.name;
            document.getElementById('prod-price').value = p.price;
            document.getElementById('prod-desc').value = p.description || '';
            document.getElementById('prod-image-url').value = p.image_url || '';
        } else {
            console.error("ERRO: Produto ID " + id + " não encontrado em localProducts!", localProducts);
        }
    }
    prodModal.classList.add('active');
};

addSafeListener('btn-save-product', 'click', async () => {
    const categoryId = document.getElementById('prod-category').value;
    const name = document.getElementById('prod-name').value.trim();
    const priceStr = document.getElementById('prod-price').value;
    const price = parseFloat(priceStr.toString().replace(',', '.'));

    if (!categoryId || !name || isNaN(price)) return alert("Preencha os campos obrigatórios!");

    const id = document.getElementById('prod-id').value;
    const file = document.getElementById('prod-image-file').files[0];
    let imageUrl = document.getElementById('prod-image-url').value.trim();

    showLoader(true);
    try {
        if (file) imageUrl = await uploadImage(file);

        const payload = {
            category_id: categoryId,
            name: name,
            price: price,
            description: document.getElementById('prod-desc').value.trim(),
            image_url: imageUrl
        };

        if (!id) payload.is_active = true;

        const { error } = id 
            ? await dbClient.from('products').update(payload).eq('id', id)
            : await dbClient.from('products').insert([payload]);

        if (error) throw error;
        prodModal.classList.remove('active');
        fetchAllData();
    } catch (e) {
        console.error(e);
        alert("Erro ao salvar produto.");
        showLoader(false);
    }
});

// 6. GESTÃO DE CATEGORIAS
const catModal = document.getElementById('modal-category');
const catForm = document.getElementById('category-form');

function renderCategories() {
    const container = document.getElementById('admin-categories-container');
    if (!container) return;
    container.innerHTML = '';
    localCategories.forEach(c => {
        const item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = `
            <span><strong>${esc(c.name)}</strong> (Ordem: ${c.order_index})</span>
            <div class="admin-product-actions">
                <button class="btn-edit-item" onclick="openCategoryModal('${c.id}')">Editar</button>
                <button class="btn-edit-item" style="background:#ef4444;" onclick="deleteCategory('${c.id}')">Excluir</button>
            </div>
        `;
        container.appendChild(item);
    });
}

window.openCategoryModal = (id = null) => {
    if (!catForm || !catModal) return;
    catForm.reset();
    document.getElementById('cat-id').value = id || '';
    if (id) {
        // Converte IDs para String para comparação segura
        const c = localCategories.find(x => String(x.id) === String(id));
        if (c) {
            document.getElementById('cat-name').value = c.name;
            document.getElementById('cat-order').value = c.order_index;
        }
    }
    catModal.classList.add('active');
};

addSafeListener('btn-save-category', 'click', async () => {
    const name = document.getElementById('cat-name').value.trim();
    if (!name) return alert("Nome obrigatório!");

    const id = document.getElementById('cat-id').value;
    const payload = {
        name: name,
        order_index: parseInt(document.getElementById('cat-order').value) || 0
    };

    showLoader(true);
    try {
        const { error } = id 
            ? await dbClient.from('categories').update(payload).eq('id', id)
            : await dbClient.from('categories').insert([payload]);

        if (error) throw error;
        catModal.classList.remove('active');
        fetchAllData();
    } catch (e) {
        alert("Erro ao salvar categoria.");
        showLoader(false);
    }
});

// 7. PEDIDOS E CLIENTES
function renderOrders() {
    const container = document.getElementById('admin-orders-container');
    if (!container) return;
    container.innerHTML = localOrders.length ? '' : '<p>Nenhum pedido ainda.</p>';
    localOrders.forEach(o => {
        const item = document.createElement('div');
        item.className = 'admin-list-item admin-order-card';
        const date = new Date(o.created_at).toLocaleString('pt-BR');
        item.innerHTML = `
            <div>
                <strong>Pedido #${o.id.substring(0, 5)}</strong> - <span class="admin-order-status status-${o.status}">${o.status}</span>
                <p style="font-size:0.8rem;">${date} - R$ ${o.total_price.toFixed(2).replace('.', ',')}</p>
            </div>
            <select onchange="updateOrderStatus('${o.id}', this.value)" class="profile-input" style="width:130px;">
                <option value="pendente" ${o.status === 'pendente' ? 'selected' : ''}>Pendente</option>
                <option value="preparando" ${o.status === 'preparando' ? 'selected' : ''}>Preparando</option>
                <option value="pronto" ${o.status === 'pronto' ? 'selected' : ''}>Pronto</option>
                <option value="entregue" ${o.status === 'entregue' ? 'selected' : ''}>Entregue</option>
            </select>
        `;
        container.appendChild(item);
    });
}

async function updateOrderStatus(id, status) {
    showLoader(true);
    await dbClient.from('orders').update({ status }).eq('id', id);
    fetchAllData();
}

function renderCustomers() {
    const container = document.getElementById('admin-customers-container');
    if (!container) return;
    container.innerHTML = localCustomers.length ? '' : '<p>Nenhum cliente.</p>';
    localCustomers.forEach(c => {
        const item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = `<div><strong>${esc(c.full_name)}</strong><br><small>${esc(c.phone)}</small></div>`;
        container.appendChild(item);
    });
}

// 8. CUPONS
const couponModal = document.getElementById('modal-coupon');
const couponForm = document.getElementById('coupon-form');

function renderCoupons() {
    const container = document.getElementById('admin-coupons-container');
    if (!container) return;
    container.innerHTML = localCoupons.length ? '' : '<p>Nenhum cupom.</p>';
    localCoupons.forEach(c => {
        const item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = `
            <div><strong>${c.code}</strong> - ${c.discount_percentage}% OFF</div>
            <div class="admin-product-actions">
                <button class="btn-edit-item" onclick="openCouponModal('${c.id}')">Editar</button>
                <button class="btn-edit-item" style="background:#ef4444;" onclick="deleteCoupon('${c.id}')">Excluir</button>
            </div>
        `;
        container.appendChild(item);
    });
}

window.openCouponModal = (id = null) => {
    if (!couponForm || !couponModal) return;
    couponForm.reset();
    document.getElementById('coupon-id').value = id || '';
    if (id) {
        const c = localCoupons.find(x => x.id === id);
        if (c) {
            document.getElementById('coupon-code').value = c.code;
            document.getElementById('coupon-discount').value = c.discount_percentage;
        }
    }
    couponModal.classList.add('active');
};

addSafeListener('btn-save-coupon', 'click', async () => {
    const code = document.getElementById('coupon-code').value.trim().toUpperCase();
    const discount = parseInt(document.getElementById('coupon-discount').value);
    if (!code || isNaN(discount)) return alert("Preencha corretamente!");

    const id = document.getElementById('coupon-id').value;
    const payload = { code, discount_percentage: discount };
    if (!id) payload.is_active = true;

    showLoader(true);
    try {
        const { error } = id 
            ? await dbClient.from('coupons').update(payload).eq('id', id)
            : await dbClient.from('coupons').insert([payload]);
        if (error) throw error;
        couponModal.classList.remove('active');
        fetchAllData();
    } catch (e) {
        alert("Erro ao salvar cupom.");
        showLoader(false);
    }
});

window.deleteCoupon = async (id) => {
    if (!confirm("Excluir cupom?")) return;
    showLoader(true);
    await dbClient.from('coupons').delete().eq('id', id);
    fetchAllData();
};

// 9. CONFIGURAÇÕES (LOJA)
function renderSettings() {
    if (!globalSettings) return;

    const statusText = document.getElementById('store-status-text');
    const btnToggle = document.getElementById('btn-toggle-store');

    if (statusText && btnToggle) {
        statusText.textContent = globalSettings.is_open ? "Loja Aberta ✅" : "Loja Fechada ❌";
        statusText.style.color = globalSettings.is_open ? "#10b981" : "#ef4444";
        btnToggle.innerHTML = globalSettings.is_open ? '<i class="ph ph-power"></i> Fechar' : '<i class="ph ph-power"></i> Abrir';
    }

    const feeInput = document.getElementById('delivery-fee-input');
    if (feeInput) feeInput.value = globalSettings.delivery_fee || 0;

    const container = document.getElementById('schedule-container');
    if (!container) return;
    container.innerHTML = '';

    const daysOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const daysTranslation = {
        'monday': 'Segunda-feira', 'tuesday': 'Terça-feira', 'wednesday': 'Quarta-feira',
        'thursday': 'Quinta-feira', 'friday': 'Sexta-feira', 'saturday': 'Sábado', 'sunday': 'Domingo'
    };

    const schedule = globalSettings.schedule || {};
    daysOrder.forEach(key => {
        const day = schedule[key] || { isOpen: true, start: "19:00", end: "23:00" };
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '10px';
        row.style.alignItems = 'center';
        row.style.background = 'rgba(255,255,255,0.02)';
        row.style.padding = '8px';
        row.style.borderRadius = '8px';
        row.innerHTML = `
            <div style="width: 120px;"><label><input type="checkbox" id="check-${key}" ${day.isOpen ? 'checked' : ''}> ${daysTranslation[key]}</label></div>
            <input type="time" id="start-${key}" value="${day.start}" class="profile-input" style="width:110px;">
            <span>até</span>
            <input type="time" id="end-${key}" value="${day.end}" class="profile-input" style="width:110px;">
        `;
        container.appendChild(row);
    });
}

addSafeListener('btn-save-schedule', 'click', async () => {
    showLoader(true);
    const daysOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const newSchedule = {};
    daysOrder.forEach(key => {
        newSchedule[key] = {
            isOpen: document.getElementById(`check-${key}`).checked,
            start: document.getElementById(`start-${key}`).value,
            end: document.getElementById(`end-${key}`).value
        };
    });
    await dbClient.from('settings').update({ schedule: newSchedule }).eq('id', 1);
    alert('Horários Salvos!');
    fetchAllData();
});

addSafeListener('btn-save-delivery-fee', 'click', async () => {
    const fee = parseFloat(document.getElementById('delivery-fee-input').value);
    showLoader(true);
    await dbClient.from('settings').update({ delivery_fee: fee }).eq('id', 1);
    alert('Taxa Salva!');
    fetchAllData();
});

addSafeListener('btn-toggle-store', 'click', async () => {
    showLoader(true);
    await dbClient.from('settings').update({ is_open: !globalSettings.is_open }).eq('id', 1);
    fetchAllData();
});

// Helpers
function populateCategorySelect() {
    const select = document.getElementById('prod-category');
    if (select) {
        select.innerHTML = '<option value="">Selecione...</option>' + 
            localCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    }
}

function addSafeListener(id, event, callback) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, callback);
}

window.toggleStatus = async (id, current) => {
    showLoader(true);
    await dbClient.from('products').update({ is_active: !current }).eq('id', id);
    fetchAllData(true);
};

window.deleteProduct = async (id) => {
    if (!confirm("Excluir produto?")) return;
    showLoader(true);
    await dbClient.from('products').delete().eq('id', id);
    fetchAllData();
};

window.deleteCategory = async (id) => {
    if (!confirm("Excluir categoria apaga os produtos dela!")) return;
    showLoader(true);
    await dbClient.from('products').delete().eq('category_id', id);
    await dbClient.from('categories').delete().eq('id', id);
    fetchAllData();
};

// 10. LOGIN
const loginOverlay = document.getElementById('login-overlay');
const adminWrapper = document.getElementById('admin-wrapper');

async function checkLogin() {
    if (!dbClient && window.supabase) dbClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    if (!dbClient) return;

    const { data: { session } } = await dbClient.auth.getSession();
    if (session) {
        if (loginOverlay) loginOverlay.style.display = 'none';
        if (adminWrapper) adminWrapper.style.display = 'block';
        initAdmin();
    } else {
        if (loginOverlay) loginOverlay.style.display = 'flex';
        if (adminWrapper) adminWrapper.style.display = 'none';
    }
}

addSafeListener('btn-login', 'click', async () => {
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const err = document.getElementById('login-error');

    if (!user || !pass) return alert("Preencha tudo!");

    const btn = document.getElementById('btn-login');
    btn.textContent = "Entrando...";
    btn.disabled = true;

    const { error } = await dbClient.auth.signInWithPassword({ email: user, password: pass });
    
    btn.textContent = "Liberar Acesso";
    btn.disabled = false;

    if (error) {
        if (err) {
            err.style.display = 'block';
            err.textContent = "Credenciais inválidas!";
        }
    } else {
        checkLogin();
    }
});

addSafeListener('btn-logout', 'click', async () => {
    await dbClient.auth.signOut();
    location.reload();
});

// Auto-init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(checkLogin, 100));
} else {
    setTimeout(checkLogin, 100);
}

// Polling silencioso
setInterval(() => { if(dbClient) fetchAllData(true); }, 15000);

// Links modais
addSafeListener('btn-new-product', 'click', () => window.openProductModal());
addSafeListener('btn-new-category', 'click', () => window.openCategoryModal());
addSafeListener('btn-new-coupon', 'click', () => window.openCouponModal());
addSafeListener('close-modal-product', 'click', () => prodModal?.classList.remove('active'));
addSafeListener('close-modal-category', 'click', () => catModal?.classList.remove('active'));
addSafeListener('close-modal-coupon', 'click', () => couponModal?.classList.remove('active'));
