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
let lastOrderCount = 0; 
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

// Safely attach event listeners
function addSafeListener(id, event, callback) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener(event, callback);
    } else {
        console.warn(`Elemento com ID ${id} não encontrado para evento ${event}`);
    }
}

function initAdmin() {
    if (!dbClient && window.supabase) {
        dbClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    }
    if (dbClient) {
        initTabs();
        fetchAllData();
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

// 2. BUSCA DE DADOS
async function fetchAllData(isSilent = false) {
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

        localCategories = cats.data || [];
        localProducts = prods.data || [];
        localOrders = orders.data || [];
        localCustomers = customers.data || [];
        localCoupons = coupons.data || [];
        globalSettings = settingsData.data || { is_open: true, schedule: {} };

        lastOrderCount = localOrders.length;
        renderAll();
    } catch (e) {
        console.error(e);
        if (!isSilent) alert("Erro ao sincronizar!");
    } finally {
        if (!isSilent) showLoader(false);
    }
}

function showLoader(show) {
    const loader = document.getElementById('admin-loader');
    if (loader) loader.style.display = show ? 'block' : 'none';
}

function renderAll() {
    renderProducts();
    renderCategories();
    renderOrders();
    renderCustomers();
    renderCoupons();
    renderSettings();
}

// 3. GESTÃO DE PRODUTOS
function renderProducts() {
    const container = document.getElementById('admin-menu-container');
    if (!container) return;
    container.innerHTML = '';

    localCategories.forEach(cat => {
        const catProds = localProducts.filter(p => p.category_id === cat.id);
        const section = document.createElement('div');
        section.className = 'admin-list-container';
        section.style.marginBottom = '30px';
        section.innerHTML = `<h3>${esc(cat.name)}</h3>`;

        catProds.forEach(p => {
            const item = document.createElement('div');
            item.className = 'admin-list-item';
            item.innerHTML = `
                <div style="display:flex; gap:15px; align-items:center;">
                    <img src="${p.image_url || 'img/logo_hotdog_viviane.png'}" style="width:50px; height:50px; object-fit:cover; border-radius:8px;">
                    <div>
                        <strong>${esc(p.name)}</strong>
                        <div class="admin-product-price">R$ ${p.price.toFixed(2).replace('.', ',')}</div>
                    </div>
                </div>
                <div class="admin-product-actions">
                    <button class="btn-toggle-status ${p.is_active ? '' : 'is-paused'}" onclick="toggleProductStatus('${p.id}', ${p.is_active})">${p.is_active ? 'Ativo' : 'Pausado'}</button>
                    <button class="btn-edit-item" onclick="openProductModal('${p.id}')">Editar</button>
                    <button class="btn-edit-item" style="background:#ef4444;" onclick="deleteProduct('${p.id}')">Excluir</button>
                </div>
            `;
            section.appendChild(item);
        });
        container.appendChild(section);
    });
}

window.openProductModal = (id = null) => {
    try {
        const modal = document.getElementById('modal-product');
        const form = document.getElementById('product-form');
        if (!modal || !form) return;
        
        form.reset();
        const idField = document.getElementById('prod-id');
        if (idField) idField.value = id || '';

        // 1. PRIMEIRO popula as categorias
        const catSelect = document.getElementById('prod-category');
        if (catSelect) {
            catSelect.innerHTML = '<option value="">Selecione...</option>' + 
                localCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
        }

        // 2. DEPOIS preenche os dados do produto (inclusive a categoria ja carregada no select)
        if (id) {
            const p = localProducts.find(x => String(x.id) === String(id));
            if (p) {
                if (catSelect) catSelect.value = p.category_id;
                document.getElementById('prod-name').value = p.name;
                document.getElementById('prod-price').value = p.price ? p.price.toFixed(2) : '';
                document.getElementById('prod-desc').value = p.description || '';
                document.getElementById('prod-image-url').value = p.image_url || '';
            }
        }

        modal.classList.add('active');
    } catch (err) { console.error("Erro abrir modal:", err); }
};

addSafeListener('btn-save-product', 'click', async () => {
    try {
        const categoryId = document.getElementById('prod-category').value;
        const name = document.getElementById('prod-name').value.trim();
        const price = parseFloat(document.getElementById('prod-price').value.toString().replace(',', '.'));

        if (!categoryId || !name || isNaN(price)) return alert("Preencha todos os campos corretamente.");

        showLoader(true);
        const file = document.getElementById('prod-image-file').files[0];
        let imageUrl = document.getElementById('prod-image-url').value.trim();

        if (file) {
            imageUrl = await uploadImage(file);
        }

        const id = document.getElementById('prod-id').value;
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
        document.getElementById('modal-product').classList.remove('active');
        fetchAllData();
    } catch (e) {
        alert("Erro ao salvar produto.");
        showLoader(false);
    }
});

async function uploadImage(file) {
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}.${ext}`;
    const filePath = `${fileName}`;
    const { error } = await dbClient.storage.from('product-images').upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type
    });
    if (error) throw error;
    const { data: { publicUrl } } = dbClient.storage.from('product-images').getPublicUrl(filePath);
    return publicUrl;
}

window.toggleProductStatus = async (id, current) => {
    showLoader(true);
    await dbClient.from('products').update({ is_active: !current }).eq('id', id);
    fetchAllData(true);
};

window.deleteProduct = async (id) => {
    if (!confirm("Excluir este produto?")) return;
    showLoader(true);
    await dbClient.from('products').delete().eq('id', id);
    fetchAllData();
};

// 4. GESTÃO DE CATEGORIAS
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
    try {
        const modal = document.getElementById('modal-category');
        const form = document.getElementById('category-form');
        if (!modal || !form) return;
        form.reset();
        const idField = document.getElementById('cat-id');
        if (idField) idField.value = id || '';
        if (id) {
            const c = localCategories.find(x => String(x.id) === String(id));
            if (c) {
                document.getElementById('cat-name').value = c.name;
                document.getElementById('cat-order').value = c.order_index;
            }
        }
        modal.classList.add('active');
    } catch (err) { console.error(err); }
};

addSafeListener('btn-save-category', 'click', async () => {
    try {
        const name = document.getElementById('cat-name').value.trim();
        if (!name) return alert("Nome obrigatório.");
        showLoader(true);
        const id = document.getElementById('cat-id').value;
        const payload = {
            name: name,
            order_index: parseInt(document.getElementById('cat-order').value) || 0
        };
        const { error } = id 
            ? await dbClient.from('categories').update(payload).eq('id', id)
            : await dbClient.from('categories').insert([payload]);
        if (error) throw error;
        document.getElementById('modal-category').classList.remove('active');
        fetchAllData();
    } catch (e) {
        alert("Erro ao salvar categoria.");
        showLoader(false);
    }
});

window.deleteCategory = async (id) => {
    if (!confirm("Excluir categoria e todos os seus produtos?")) return;
    showLoader(true);
    await dbClient.from('products').delete().eq('category_id', id);
    await dbClient.from('categories').delete().eq('id', id);
    fetchAllData();
};

// 5. CUPONS
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
    try {
        const modal = document.getElementById('modal-coupon');
        const form = document.getElementById('coupon-form');
        if (!modal || !form) return;
        form.reset();
        document.getElementById('coupon-id').value = id || '';
        if (id) {
            const c = localCoupons.find(x => String(x.id) === String(id));
            if (c) {
                document.getElementById('coupon-code').value = c.code;
                document.getElementById('coupon-discount').value = c.discount_percentage;
            }
        }
        modal.classList.add('active');
    } catch (err) { console.error(err); }
};

addSafeListener('btn-save-coupon', 'click', async () => {
    try {
        const code = document.getElementById('coupon-code').value.trim().toUpperCase();
        const disc = parseInt(document.getElementById('coupon-discount').value);
        if (!code || isNaN(disc)) return alert("Preencha corretamente.");
        showLoader(true);
        const id = document.getElementById('coupon-id').value;
        const payload = { 
            code: code, 
            discount_percentage: disc,
            is_active: true 
        };
        const { error } = id 
            ? await dbClient.from('coupons').update(payload).eq('id', id)
            : await dbClient.from('coupons').insert([payload]);
        if (error) throw error;
        document.getElementById('modal-coupon').classList.remove('active');
        alert("Cupom salvo com sucesso!");
        fetchAllData();
    } catch (e) {
        console.error("Erro completo ao salvar cupom:", e);
        const msg = e.message || "Verifique as permissões de RLS no Supabase.";
        alert("Erro ao salvar cupom: " + msg);
        showLoader(false);
    }
});

window.deleteCoupon = async (id) => {
    if (!confirm("Excluir cupom?")) return;
    showLoader(true);
    await dbClient.from('coupons').delete().eq('id', id);
    fetchAllData();
};

// 6. PEDIDOS E CONFIGURAÇÕES
function renderOrders() {
    const container = document.getElementById('admin-orders-container');
    if (!container) return;
    container.innerHTML = localOrders.length ? '' : '<p>Sem pedidos.</p>';
    localOrders.forEach(o => {
        const item = document.createElement('div');
        item.className = 'admin-list-item';
        const numericHash = parseInt(o.id.replace(/-/g, '').substring(0, 8), 16).toString();
        const shortId = numericHash.slice(-4).padStart(4, '0');
        item.innerHTML = `<div>Pedido #${shortId} - ${o.status}</div>`;
        container.appendChild(item);
    });
}

function renderCustomers() {
    const container = document.getElementById('admin-customers-container');
    if (!container) return;
    container.innerHTML = localCustomers.length ? '' : '<p>Sem clientes.</p>';
    localCustomers.forEach(c => {
        const item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = `
            <div>
                <strong><i class="ph ph-user"></i> ${esc(c.name || 'Sem nome')}</strong><br>
                <div style="font-size: 0.9rem; color: #a1a1aa;"><i class="ph ph-phone"></i> ${esc(c.phone || '')}</div>
                <div style="font-size: 0.85rem; color: #71717a; margin-top: 5px;"><i class="ph ph-map-pin"></i> ${esc(c.address || '')}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

function renderSettings() {
    const statusText = document.getElementById('store-status-text');
    if (statusText) statusText.innerText = globalSettings.is_open ? 'LOJA ABERTA ✅' : 'LOJA FECHADA ❌';
    
    const feeInp = document.getElementById('delivery-fee-input');
    if (feeInp) feeInp.value = globalSettings.delivery_fee || 0;

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
        row.className = 'schedule-row';
        row.style.display = 'flex';
        row.style.gap = '10px';
        row.style.alignItems = 'center';
        row.innerHTML = `
            <label style="width:120px;"><input type="checkbox" id="check-${key}" ${day.isOpen ? 'checked' : ''}> ${daysTranslation[key]}</label>
            <input type="time" id="start-${key}" value="${day.start}">
            <span>até</span>
            <input type="time" id="end-${key}" value="${day.end}">
        `;
        container.appendChild(row);
    });
}

addSafeListener('btn-save-schedule', 'click', async () => {
    try {
        showLoader(true);
        const daysOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const daysTranslation = {
            'monday': 'Segunda-feira', 'tuesday': 'Terça-feira', 'wednesday': 'Quarta-feira',
            'thursday': 'Quinta-feira', 'friday': 'Sexta-feira', 'saturday': 'Sábado', 'sunday': 'Domingo'
        };
        const newSchedule = {};
        daysOrder.forEach(key => {
            newSchedule[key] = {
                name: daysTranslation[key],
                isOpen: document.getElementById(`check-${key}`).checked,
                start: document.getElementById(`start-${key}`).value,
                end: document.getElementById(`end-${key}`).value
            };
        });
        await dbClient.from('settings').update({ schedule: newSchedule }).eq('id', 1);
        alert("Horários salvos!");
        fetchAllData();
    } catch (e) { alert("Erro ao salvar horários."); showLoader(false); }
});

addSafeListener('btn-save-delivery-fee', 'click', async () => {
    try {
        const fee = parseFloat(document.getElementById('delivery-fee-input').value);
        showLoader(true);
        await dbClient.from('settings').update({ delivery_fee: fee }).eq('id', 1);
        alert("Taxa salva!");
        fetchAllData();
    } catch (e) { alert("Erro."); showLoader(false); }
});

addSafeListener('btn-toggle-store', 'click', async () => {
    try {
        showLoader(true);
        await dbClient.from('settings').update({ is_open: !globalSettings.is_open }).eq('id', 1);
        fetchAllData();
    } catch (e) { showLoader(false); }
});

// Modals close buttons
addSafeListener('close-modal-product', 'click', () => document.getElementById('modal-product')?.classList.remove('active'));
addSafeListener('close-modal-category', 'click', () => document.getElementById('modal-category')?.classList.remove('active'));
addSafeListener('close-modal-coupon', 'click', () => document.getElementById('modal-coupon')?.classList.remove('active'));
addSafeListener('btn-new-product', 'click', () => window.openProductModal());
addSafeListener('btn-new-category', 'click', () => window.openCategoryModal());
addSafeListener('btn-new-coupon', 'click', () => window.openCouponModal());

// Máscara de preço do produto
addSafeListener('prod-price', 'input', (e) => {
    let val = e.target.value.replace(/\D/g, "");
    if (!val) {
        e.target.value = "";
        return;
    }
    val = (parseInt(val, 10) / 100).toFixed(2);
    e.target.value = val;
});

// LOGIN
addSafeListener('btn-login', 'click', checkManualLogin);

// Suporte à tecla Enter nos campos de login
const loginUserInp = document.getElementById('login-user');
const loginPassInp = document.getElementById('login-pass');
if (loginUserInp) loginUserInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkManualLogin(); });
if (loginPassInp) loginPassInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkManualLogin(); });

function checkManualLogin() {
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    console.log("Tentativa de login:", user.toLowerCase(), "Senha (tamanho):", pass.length);
    if (user.toLowerCase() === 'adminhotdogviviane@gmail.com' && (pass === 'Admin166480' || pass === 'Admin166480*-')) {
        localStorage.setItem('hotdog_admin_logged', 'true');
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('admin-wrapper').style.display = 'block';
        initAdmin();
    } else {
        document.getElementById('login-error').style.display = 'block';
    }
}

function checkLogin() {
    if (localStorage.getItem('hotdog_admin_logged') === 'true') {
        const overlay = document.getElementById('login-overlay');
        if (overlay) overlay.style.display = 'none';
        const wrapper = document.getElementById('admin-wrapper');
        if (wrapper) wrapper.style.display = 'block';
        initAdmin();
    }
}

addSafeListener('btn-logout', 'click', () => {
    localStorage.removeItem('hotdog_admin_logged');
    location.reload();
});

// Auto-init
setTimeout(checkLogin, 100);
