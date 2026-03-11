// REI NEO - Sistema de Gestão Suprema 👑
const supabaseUrl = 'https://mnygtmcwgkrkqluaqyfe.supabase.co';
const supabaseKey = 'sb_publishable_Uj4W02FU_mmn4zA86JTukw_vbzRyMqR';
let dbClient = null;

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

// Helper para evitar XSS (Injeção de Script malicioso através de nomes/endereços)
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
        adminLoader.innerHTML = '<p style="color:red;">Falha ao carregar banco.</p>';
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

        // Sincroniza contagem de pedidos
        lastOrderCount = localOrders.length;
        isInitialLoad = false;
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
    adminLoader.style.display = show ? 'block' : 'none';
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
    container.innerHTML = '';
    localCategories.forEach(cat => {
        const prods = localProducts.filter(p => p.category_id === cat.id);
        const section = document.createElement('div');
        section.className = 'admin-category';
        section.innerHTML = `<h3>${cat.name}</h3>`;
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

// 4. UPLOAD DE IMAGEM COM COMPRESSÃO (JS)
async function uploadImage(file) {
    // Comprimir Imagem via Canvas
    const compressedBlob = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                // Max width/height 1000px
                const MAX_SIZE = 1000;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                // Converter para Blob jpeg 80% qualidade
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', 0.8);
            };
        };
    });

    const fileName = `${Math.random()}.jpeg`;
    const filePath = `products/${fileName}`;

    const { error } = await dbClient.storage.from('product-images').upload(filePath, compressedBlob, { contentType: 'image/jpeg' });
    if (error) throw error;

    const { data: { publicUrl } } = dbClient.storage.from('product-images').getPublicUrl(filePath);
    return publicUrl;
}

// 5. SALVAR PRODUTO
const prodModal = document.getElementById('modal-product');
const prodForm = document.getElementById('product-form');

window.openProductModal = (id = null) => {
    prodForm.reset();
    document.getElementById('prod-id').value = id || '';
    if (id) {
        const p = localProducts.find(x => x.id === id);
        document.getElementById('prod-category').value = p.category_id;
        document.getElementById('prod-name').value = p.name;
        document.getElementById('prod-price').value = p.price;
        document.getElementById('prod-desc').value = p.description || '';
        document.getElementById('prod-image-url').value = p.image_url || '';
    }
    prodModal.classList.add('active');
};

addSafeListener('btn-save-product', 'click', async () => {
    const categoryId = document.getElementById('prod-category').value;
    const name = document.getElementById('prod-name').value.trim();
    const priceStr = document.getElementById('prod-price').value;
    const price = parseFloat(priceStr.replace(',', '.')); // Lida com vírgula ou ponto

    if (!categoryId) return alert("ERRO: Selecione uma Categoria válida!");
    if (!name) return alert("ERRO: O Nome do Produto é obrigatório!");
    if (isNaN(price) || price < 0) return alert("ERRO: Digite um Preço válido (ex: 50.90)!");

    const id = document.getElementById('prod-id').value;
    const file = document.getElementById('prod-image-file').files[0];
    let imageUrl = document.getElementById('prod-image-url').value.trim();

    showLoader(true);
    try {
        if (file) {
            try {
                imageUrl = await uploadImage(file);
            } catch (imgErr) {
                console.error("Erro upload:", imgErr);
                alert("Falha ao Enviar Imagem! Verifique o Bucket 'product-images' no Supabase.");
                showLoader(false);
                return;
            }
        }

        const payload = {
            category_id: categoryId,
            name: name,
            price: price,
            description: document.getElementById('prod-desc').value.trim(),
            image_url: imageUrl
        };

        // Mantém ativo se for novo, não altera se já existir (salvo explicitamente)
        if (!id) payload.is_active = true;

        let dbError;
        if (id) {
            const { error: errUpdate } = await dbClient.from('products').update(payload).eq('id', id);
            dbError = errUpdate;
        } else {
            const { error: errInsert } = await dbClient.from('products').insert([payload]);
            dbError = errInsert;
        }

        if (dbError) throw dbError;

        prodModal.classList.remove('active');
        fetchAllData();
    } catch (e) {
        console.error("Erro BD Produto:", e);
        alert(`ERRO NO BANCO: ${e.message || "Falha nas permissões do Supabase (RLS)."}`);
        showLoader(false);
    }
});

// 6. GESTÃO DE CATEGORIAS
const catModal = document.getElementById('modal-category');
const catForm = document.getElementById('category-form');

function renderCategories() {
    const container = document.getElementById('admin-categories-container');
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
    catForm.reset();
    document.getElementById('cat-id').value = id || '';
    if (id) {
        const c = localCategories.find(x => x.id === id);
        document.getElementById('cat-name').value = c.name;
        document.getElementById('cat-order').value = c.order_index;
    }
    catModal.classList.add('active');
};

addSafeListener('btn-save-category', 'click', async () => {
    const name = document.getElementById('cat-name').value.trim();
    if (!name) return alert("ERRO: O Nome da Categoria é obrigatório!");

    const id = document.getElementById('cat-id').value;
    const payload = {
        name: name,
        order_index: parseInt(document.getElementById('cat-order').value) || 0
    };

    showLoader(true);
    try {
        let dbError;
        if (id) {
            const { error } = await dbClient.from('categories').update(payload).eq('id', id);
            dbError = error;
        } else {
            const { error } = await dbClient.from('categories').insert([payload]);
            dbError = error;
        }

        if (dbError) throw dbError;

        catModal.classList.remove('active');
        fetchAllData();
    } catch (e) {
        console.error("Erro BD Categoria:", e);
        alert(`ERRO NO BANCO: ${e.message || "Falha nas permissões do Supabase (RLS)."}`);
        showLoader(false);
    }
});

// 7. PEDIDOS E CLIENTES
function renderOrders() {
    const container = document.getElementById('admin-orders-container');
    container.innerHTML = localOrders.length ? '' : '<p>Nenhum pedido ainda.</p>';
    localOrders.forEach(o => {
        const item = document.createElement('div');
        item.className = 'admin-list-item admin-order-card';
        const date = new Date(o.created_at).toLocaleString('pt-BR');

        const numericHash = parseInt(o.id.replace(/-/g, '').substring(0, 8), 16).toString();
        const shortId = numericHash.substring(numericHash.length - 4);

        let deliveryBadge = '';
        if (o.delivery_type === 'entrega') {
            const fee = o.delivery_fee ? ` (+R$ ${parseFloat(o.delivery_fee).toFixed(2).replace('.', ',')})` : '';
            deliveryBadge = `<span style="background:rgba(227,22,57,0.15); color:#ff4757; border:1px solid rgba(227,22,57,0.3); padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:700; margin-left:8px;">🛵 ENTREGA${fee}</span>`;
        } else if (o.delivery_type === 'retirada') {
            deliveryBadge = `<span style="background:rgba(16,185,129,0.15); color:#2ed573; border:1px solid rgba(16,185,129,0.3); padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:700; margin-left:8px;">🏪 RETIRADA</span>`;
        }

        item.innerHTML = `
            <div>
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                    <strong>Pedido #${shortId}</strong> - <span class="admin-order-status status-${o.status}">${o.status}</span>
                    ${deliveryBadge}
                </div>
                <p style="font-size:0.8rem; margin:4px 0;">${date} - <strong>R$ ${o.total_price.toFixed(2)}</strong></p>
                <div class="order-items-summary">${(JSON.parse(o.items || '[]')).filter(i => !i.name.includes('Desconto')).map(i => `${i.quantity}x ${esc(i.name)}`).join(', ')}</div>
            </div>
            <select onchange="updateOrderStatus('${o.id}', this.value)" class="profile-input" style="width:130px; padding:5px;">
                <option value="pendente" ${o.status === 'pendente' ? 'selected' : ''}>Pendente</option>
                <option value="preparando" ${o.status === 'preparando' ? 'selected' : ''}>Preparando</option>
                <option value="pronto" ${o.status === 'pronto' ? 'selected' : ''}>Pronto</option>
                <option value="entregue" ${o.status === 'entregue' ? 'selected' : ''}>Entregue</option>
            </select>
        `;
        container.appendChild(item);
    });
}

function renderCustomers() {
    const container = document.getElementById('admin-customers-container');
    container.innerHTML = localCustomers.length ? '' : '<p>Nenhum cliente cadastrado.</p>';
    localCustomers.forEach(c => {
        const item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = `
            <div>
                <strong>${esc(c.full_name || 'Anônimo')}</strong>
                <p style="font-size:0.8rem;">${esc(c.phone || '')} | ${esc(c.email || '')}</p>
                <p style="font-size:0.7rem; color:var(--text-muted); white-space:pre-wrap;">${esc(c.address || 'Sem endereço')}</p>
            </div>
        `;
        container.appendChild(item);
    });
}

async function updateOrderStatus(id, status) {
    showLoader(true);
    await dbClient.from('orders').update({ status }).eq('id', id);
    fetchAllData();
}

// 8. GESTÃO DE CUPONS
const couponModal = document.getElementById('modal-coupon');
const couponForm = document.getElementById('coupon-form');

function renderCoupons() {
    const container = document.getElementById('admin-coupons-container');
    container.innerHTML = localCoupons.length ? '' : '<p>Nenhum cupom criado.</p>';
    localCoupons.forEach(c => {
        const item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = `
            <div>
                <strong>${c.code}</strong> - <span style="color:var(--primary-red); font-weight:bold;">${c.discount_percentage}% OFF</span>
                <p style="font-size:0.8rem; color:${c.is_active ? '#4ade80' : '#f87171'};">${c.is_active ? 'Ativo' : 'Inativo'}</p>
            </div>
            <div class="admin-product-actions">
                <button class="btn-toggle-status ${c.is_active ? '' : 'is-paused'}" onclick="toggleCouponStatus('${c.id}', ${c.is_active})">${c.is_active ? 'Ativo' : 'Pausado'}</button>
                <button class="btn-edit-item" onclick="openCouponModal('${c.id}')">Editar</button>
                <button class="btn-edit-item" style="background:#ef4444;" onclick="deleteCoupon('${c.id}')">Excluir</button>
            </div>
        `;
        container.appendChild(item);
    });
}

window.openCouponModal = (id = null) => {
    couponForm.reset();
    document.getElementById('coupon-id').value = id || '';
    if (id) {
        const c = localCoupons.find(x => x.id === id);
        document.getElementById('coupon-code').value = c.code;
        document.getElementById('coupon-discount').value = c.discount_percentage;
    }
    couponModal.classList.add('active');
};

addSafeListener('btn-save-coupon', 'click', async () => {
    const code = document.getElementById('coupon-code').value.trim().toUpperCase();
    const discount = parseInt(document.getElementById('coupon-discount').value);

    if (!code) return alert("ERRO: O Código do Cupom é obrigatório!");
    if (isNaN(discount) || discount < 1 || discount > 100) return alert("ERRO: Desconto inválido! Use um número de 1 a 100.");

    const id = document.getElementById('coupon-id').value;
    const payload = {
        code: code,
        discount_percentage: discount
    };

    if (!id) payload.is_active = true;

    showLoader(true);
    try {
        let dbError;
        if (id) {
            const { error } = await dbClient.from('coupons').update(payload).eq('id', id);
            dbError = error;
        } else {
            const { error } = await dbClient.from('coupons').insert([payload]);
            dbError = error;
        }

        if (dbError) throw dbError;

        couponModal.classList.remove('active');
        fetchAllData();
    } catch (e) {
        console.error("Erro BD Cupom:", e);
        alert(`ERRO NO BANCO: ${e.message || "Falha nas permissões do Supabase (RLS)."}`);
        showLoader(false);
    }
});

window.toggleCouponStatus = async (id, current) => {
    showLoader(true);
    await dbClient.from('coupons').update({ is_active: !current }).eq('id', id);
    fetchAllData();
};

window.deleteCoupon = async (id) => {
    if (!confirm("Excluir este cupom?")) return;
    showLoader(true);
    await dbClient.from('coupons').delete().eq('id', id);
    fetchAllData();
};

// Polling silencioso a cada 10 segundos para buscar novos pedidos
setInterval(() => {
    if (dbClient) fetchAllData(true);
}, 10000);

// Helpers
function populateCategorySelect() {
    const select = document.getElementById('prod-category');
    select.innerHTML = localCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

window.toggleStatus = async (id, current) => {
    showLoader(true);
    try {
        const { error } = await dbClient.from('products').update({ is_active: !current }).eq('id', id);
        if (error) throw error;
        fetchAllData();
    } catch (e) {
        console.error("Erro toggleStatus:", e);
        alert(`Erro ao mudar status: ${e.message}`);
        showLoader(false);
    }
};

window.deleteProduct = async (id) => {
    if (!confirm("REI NEO, tem certeza que quer excluir este produto?")) return;
    showLoader(true);
    try {
        const { error } = await dbClient.from('products').delete().eq('id', id);
        if (error) throw error;
        fetchAllData();
    } catch (e) {
        console.error("Erro deleteProduct:", e);
        alert(`Erro ao excluir produto: ${e.message}`);
        showLoader(false);
    }
};

window.deleteCategory = async (id) => {
    if (!confirm("REI NEO, excluir a categoria apaga os produtos dela! Prosseguir?")) return;
    showLoader(true);
    try {
        const { error } = await dbClient.from('categories').delete().eq('id', id);
        if (error) throw error;
        fetchAllData();
    } catch (e) {
        console.error("Erro deleteCategory:", e);
        alert(`Erro ao excluir categoria: ${e.message}`);
        showLoader(false);
    }
};

// 8. CONFIGURAÇÕES DA LOJA (HORÁRIOS)
function renderSettings() {
    if (!globalSettings) return;

    // Status Global (Botão de Pânico / Override)
    const statusText = document.getElementById('store-status-text');
    const btnToggle = document.getElementById('btn-toggle-store');

    if (globalSettings.is_open) {
        statusText.textContent = "Loja Aberta ✅";
        statusText.style.color = "#10b981";
        btnToggle.style.backgroundColor = "#ef4444";
        btnToggle.innerHTML = '<i class="ph ph-power"></i> Fechar Loja';
    } else {
        statusText.textContent = "Loja Fechada ❌";
        statusText.style.color = "#ef4444";
        btnToggle.style.backgroundColor = "#10b981";
        btnToggle.innerHTML = '<i class="ph ph-power"></i> Abrir Loja';
    }

    // Carrega a taxa de entrega
    const deliveryFeeInput = document.getElementById('delivery-fee-input');
    if (deliveryFeeInput) {
        deliveryFeeInput.value = globalSettings.delivery_fee ?? 5.00;
    }

    // Formulário de Horários
    const container = document.getElementById('schedule-container');
    container.innerHTML = '';

    const daysOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const daysTranslation = {
        'monday': 'Segunda-feira',
        'tuesday': 'Terça-feira',
        'wednesday': 'Quarta-feira',
        'thursday': 'Quinta-feira',
        'friday': 'Sexta-feira',
        'saturday': 'Sábado',
        'sunday': 'Domingo'
    };
    const schedule = globalSettings.schedule || {};

    daysOrder.forEach(key => {
        const day = schedule[key] || { name: daysTranslation[key], isOpen: true, start: "19:00", end: "23:00" };
        const dayName = daysTranslation[key] || key;
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '10px';
        row.style.alignItems = 'center';
        row.style.background = 'rgba(255,255,255,0.02)';
        row.style.padding = '10px';
        row.style.borderRadius = '8px';

        row.innerHTML = `
            <div style="width: 120px;">
                <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                    <input type="checkbox" id="check-${key}" ${day.isOpen ? 'checked' : ''}>
                    ${dayName}
                </label>
            </div>
            <input type="time" id="start-${key}" value="${day.start}" class="profile-input" style="width: 120px;" ${!day.isOpen ? 'disabled' : ''}>
            <span>até</span>
            <input type="time" id="end-${key}" value="${day.end}" class="profile-input" style="width: 120px;" ${!day.isOpen ? 'disabled' : ''}>
        `;
        container.appendChild(row);

        // Lógica de disable
        const checkbox = row.querySelector(`#check-${key}`);
        checkbox.addEventListener('change', (e) => {
            document.getElementById(`start-${key}`).disabled = !e.target.checked;
            document.getElementById(`end-${key}`).disabled = !e.target.checked;
        });
    });
}

// Safely attach event listeners
function addSafeListener(id, event, callback) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, callback);
}

addSafeListener('btn-toggle-store', 'click', async (e) => {
    e.preventDefault();
    if (!globalSettings) return;

    showLoader(true);
    await dbClient.from('settings').update({ is_open: !globalSettings.is_open }).eq('id', 1);
    fetchAllData();
});

// Salvar Taxa de Entrega
addSafeListener('btn-save-delivery-fee', 'click', async () => {
    const feeInput = document.getElementById('delivery-fee-input');
    const fee = parseFloat(feeInput.value);
    if (isNaN(fee) || fee < 0) return alert('ERRO: Digite um valor válido para a taxa (ex: 5.50)');
    showLoader(true);
    try {
        const { error } = await dbClient.from('settings').update({ delivery_fee: fee }).eq('id', 1);
        if (error) throw error;
        alert(`Taxa de Entrega salva: R$ ${fee.toFixed(2).replace('.', ',')}`);
        fetchAllData();
    } catch (e) {
        console.error('Erro ao salvar taxa:', e);
        alert(`ERRO: ${e.message}`);
        showLoader(false);
    }
});

addSafeListener('btn-save-schedule', 'click', async () => {
    showLoader(true);

    const daysOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const daysTranslation = {
        'monday': 'Segunda-feira',
        'tuesday': 'Terça-feira',
        'wednesday': 'Quarta-feira',
        'thursday': 'Quinta-feira',
        'friday': 'Sexta-feira',
        'saturday': 'Sábado',
        'sunday': 'Domingo'
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
    alert('Horários Salvos com Sucesso!');
    fetchAllData();
});

// Eventos de Fechar/Abrir Modal de forma Segura
addSafeListener('btn-new-product', 'click', () => window.openProductModal());
addSafeListener('btn-new-category', 'click', () => window.openCategoryModal());
addSafeListener('btn-new-coupon', 'click', () => window.openCouponModal());
addSafeListener('close-modal-product', 'click', () => { if(prodModal) prodModal.classList.remove('active'); });
addSafeListener('close-modal-category', 'click', () => { if(catModal) catModal.classList.remove('active'); });
addSafeListener('close-modal-coupon', 'click', () => { if(couponModal) couponModal.classList.remove('active'); });

// 9. LÓGICA DE LOGIN ADMIN (SUPABASE AUTH)
const loginOverlay = document.getElementById('login-overlay');
const adminWrapper = document.getElementById('admin-wrapper');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');

async function checkLogin() {
    if (!dbClient && window.supabase) {
        dbClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    }
    if (!dbClient) return;

    const { data: { session } } = await dbClient.auth.getSession();

    if (session) {
        loginOverlay.classList.remove('active');
        loginOverlay.style.display = 'none';
        adminWrapper.style.display = 'block';

        // Se já rodou antes não re-inicia as abas, mas garante dados
        if (localCategories.length === 0 && isInitialLoad) {
            initAdmin();
        }
    } else {
        loginOverlay.classList.add('active');
        loginOverlay.style.display = 'flex';
        adminWrapper.style.display = 'none';
    }
}

if (btnLogin) {
    btnLogin.addEventListener('click', async () => {
        const user = document.getElementById('login-user').value;
        const pass = document.getElementById('login-pass').value;
        const err = document.getElementById('login-error');

        if (!user || user.indexOf('@') === -1) {
            err.style.display = 'block';
            err.textContent = "Use um e-mail válido.";
            return;
        }

        const btnText = btnLogin.textContent;
        btnLogin.textContent = "Autenticando...";
        btnLogin.disabled = true;

        if (!dbClient && window.supabase) {
            dbClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        }

        const { data, error } = await dbClient.auth.signInWithPassword({
            email: user,
            password: pass
        });

        btnLogin.textContent = btnText;
        btnLogin.disabled = false;

        if (error || !data.user) {
            err.style.display = 'block';
            err.innerHTML = "E-mail ou senha incorretos!";
        } else {
            err.style.display = 'none';
            checkLogin();
        }
    });
}

if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        if (dbClient) await dbClient.auth.signOut();
        window.location.reload();
    });
}

// Tenta iniciar se já estiver logado (Aguarda carregamento da página)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { setTimeout(checkLogin, 50); });
} else {
    setTimeout(checkLogin, 50);
}
