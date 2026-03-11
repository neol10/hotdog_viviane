// Aguarda o DOM ser carregado
document.addEventListener('DOMContentLoaded', async () => {

    // 0. SUPABASE CLIENT
    const supabaseUrl = 'https://mnygtmcwgkrkqluaqyfe.supabase.co';
    const supabaseKey = 'sb_publishable_Uj4W02FU_mmn4zA86JTukw_vbzRyMqR';
    const supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

    // Helper para evitar XSS (Injeção de Script)
    function esc(t) {
        if (!t) return "";
        return t.toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // 0. VARIÁVEL GLOBAL
    let estaAberto = true;
    // 1 & 2 & 3 Serão reinicializados pelo Supabase APÓS o carregamento da DOM Dinâmica
    // Função para reativar fade, scrollspy e smooth scroll após desenhar pizzas
    function initScrollEvents() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                }
            });
        }, { threshold: 0.1, rootMargin: "0px 0px 50px 0px" });

        document.querySelectorAll('.fade-in-section').forEach(el => observer.observe(el));

        const sections = document.querySelectorAll('.menu-section');
        const navLinks = document.querySelectorAll('.category-link');

        window.addEventListener('scroll', () => {
            const navbar = document.querySelector('.navbar');
            if (window.scrollY > 30) {
                if (navbar) navbar.classList.add('navbar-hidden');
            } else {
                if (navbar) navbar.classList.remove('navbar-hidden');
            }

            let current = '';
            sections.forEach(section => {
                const sectionTop = section.offsetTop;
                if (pageYOffset >= (sectionTop - 250)) {
                    current = section.getAttribute('id');
                }
            });
            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${current}`) {
                    link.classList.add('active');
                }
            });
        });

        document.querySelectorAll('.category-link').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const targetId = this.getAttribute('href');
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    window.scrollTo({ top: targetElement.offsetTop - 150, behavior: 'smooth' });
                }
            });
        });
    }

    // SUPABASE: BUSCANDO OS DADOS DINÂMICOS
    window.globalProducts = [];
    async function loadMenu() {
        const dynamicContainer = document.getElementById('dynamic-menu-container');
        const menuLoader = document.getElementById('menu-loader');

        if (!dynamicContainer || !menuLoader || !supabase) return;

        try {
            // Mostrar skeleton em vez de sumir com o container (Skeletons já estão no HTML e visíveis por padrão)
            const { data: categories, error: catError } = await supabase.from('categories').select('*').order('order_index');
            const { data: products, error: prodError } = await supabase.from('products').select('*').eq('is_active', true).order('name');
            const { data: settingsData, error: setError } = await supabase.from('settings').select('*').eq('id', 1).single();

            if (catError || prodError) throw new Error("Database falhou");

            dynamicContainer.innerHTML = '';
            // Salva array no window para leitura do modal
            window.globalProducts = products;

            // PROCESSAMENTO DA TABELA DE CONFIGURAÇÕES
            const settings = settingsData || { is_open: true, schedule: {} };
            const agora = new Date();
            const diaNum = agora.getDay();
            const daysOrder = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const todayKey = daysOrder[diaNum];
            const todayConfig = settings.schedule[todayKey] || { isOpen: true, start: "18:00", end: "23:00" };

            function timeToMinutes(t) {
                if (!t) return 0;
                const parts = t.split(':');
                return parseInt(parts[0]) * 60 + parseInt(parts[1]);
            }

            const horaAtual = agora.getHours() * 60 + agora.getMinutes();
            const abertura = timeToMinutes(todayConfig.start);
            const fechamento = timeToMinutes(todayConfig.end);

            estaAberto = settings.is_open && todayConfig.isOpen && (horaAtual >= abertura && horaAtual < fechamento);

            if (!estaAberto) {
                const banner = document.createElement('div');
                banner.id = 'closed-banner';
                banner.innerHTML = `
                    <div class="closed-banner-inner">
                        <i class="ph-fill ph-moon"></i>
                        <div>
                            <strong>Estamos fechados no momento</strong>
                            <span>Voltamos em breve!</span>
                        </div>
                    </div>
                `;
                document.body.prepend(banner);
                document.body.classList.add('is-closed');
                const checkoutBtn = document.getElementById('checkout-btn');
                if (checkoutBtn) {
                    checkoutBtn.disabled = true;
                    checkoutBtn.textContent = 'Fechado agora';
                }
            }

            // ATUALIZAR O TEXTO DO RODAPÉ BASEADO NOS SETTINGS
            updateFooterSchedule(settings.schedule);

            categories.forEach(cat => {
                const prods = products.filter(p => p.category_id === cat.id);
                if (prods.length === 0) return;

                // Mapeamento pra criar o link correto da Navbar
                const catKeys = {
                    'Hot Dog': { icon: 'ph-hotdog', id: 'hot-dog' },
                    'Hot Dogs': { icon: 'ph-hotdog', id: 'hot-dog' },
                    'Pastel': { icon: 'ph-cooking-pot', id: 'pastel' },
                    'Pastéis': { icon: 'ph-cooking-pot', id: 'pastel' },
                    'Sucos': { icon: 'ph-drop', id: 'sucos' },
                    'Bebidas': { icon: 'ph-wine', id: 'bebidas' },
                    'Porções': { icon: 'ph-bowl-food', id: 'porcoes' },
                    'Sobremesas': { icon: 'ph-ice-cream', id: 'sobremesas' }
                };
                const props = catKeys[cat.name] || { icon: 'ph-hotdog', id: `cat-${cat.id}` };
                // Garantia extra: Limpa caminhos antigos se necessário (Opcional)


                let sectionHtml = `
                <section id="${props.id}" class="menu-section">
                    <h2 class="section-title"><i class="ph-fill ${props.icon}"></i> ${cat.name}</h2>
                    <div class="menu-grid">
                `;

                prods.forEach(prod => {
                    let formattedPrice = 'R$ ' + prod.price.toFixed(2).replace('.', ',');
                    let bgImg = prod.image_url ? `style="background-image: url('${prod.image_url}');"` : '';
                    let disabledAttr = !estaAberto ? 'disabled style="opacity:0.4; cursor:not-allowed;" title="Fechado no momento"' : '';

                    // Renderização Uniforme: Todos usam o layout de card com imagem agora (Grid)
                    // Exceto se quisermos manter a lista para algo muito específico no futuro
                    sectionHtml += `
                    <div class="glass-card product-card" data-aos="fade-up">
                        <div class="card-image-wrapper">
                            <div class="img-placeholder" ${bgImg}></div>
                            <span class="price-tag" style="background: linear-gradient(135deg, var(--primary-yellow), #e0a800); color: #07090e; font-weight: 800;">${formattedPrice}</span>
                        </div>
                        <div class="card-content">
                            <h3 class="product-title">${prod.name}</h3>
                            <p class="product-desc">${prod.description || ''}</p>
                            <button class="btn-mustard open-detail-btn" style="width:100%; justify-content:center; padding: 12px;" data-name="${prod.name}" data-price="${prod.price}" ${disabledAttr}><i class="ph ph-plus"></i> Adicionar ao Carrinho</button>
                        </div>
                    </div>`;
                });

                sectionHtml += `</div></section>`;
                dynamicContainer.insertAdjacentHTML('beforeend', sectionHtml);
            });

            menuLoader.style.display = 'none';

            // REMOVE O LOADER OVERALL (REI NEO Fix)
            const mainLoader = document.getElementById('loader');
            if (mainLoader) {
                mainLoader.classList.remove('active');
                setTimeout(() => mainLoader.style.display = 'none', 500);
            }

            // Liga as animações e o scroll da Navbar!
            initScrollEvents();

        } catch (e) {
            console.error("Erro banco: ", e);
            menuLoader.innerHTML = '<p style="color:red;">Não foi possível carregar o cardápio. Tente atualizar a página.</p>';
        }
    }

    // HELPER: Desenha os Horários no Rodapé a partir do JSON do Banco
    function updateFooterSchedule(schedule) {
        const list = document.getElementById('footer-schedule-list');
        if (!list) return;

        const days = [
            { id: 'monday', label: 'Segunda', abbr: 'Seg' },
            { id: 'tuesday', label: 'Terça', abbr: 'Ter' },
            { id: 'wednesday', label: 'Quarta', abbr: 'Qua' },
            { id: 'thursday', label: 'Quinta', abbr: 'Qui' },
            { id: 'friday', label: 'Sexta', abbr: 'Sex' },
            { id: 'saturday', label: 'Sábado', abbr: 'Sáb' },
            { id: 'sunday', label: 'Domingo', abbr: 'Dom' }
        ];

        // Tentar agrupar Seg a Qui se forem iguais
        let grouped = '';

        days.forEach(d => {
            const config = schedule[d.id] || { isOpen: true, start: "19:00", end: "23:00" };
            if (config.isOpen) {
                grouped += `<li><strong>${d.label}:</strong> ${config.start} - ${config.end}</li>`;
            } else {
                grouped += `<li><strong>${d.label}:</strong> <span style="color:#ef4444; font-weight:600;">Fechado</span></li>`;
            }
        });

        list.innerHTML = grouped;
    }

    // Manda desenhar a vitrine!
    loadMenu();

    // 3. NAVEGAÇÃO SUAVE PARA ANCHORS
    // Opcional, via JS (embora o css scroll-behavior já cuide muito disso)
    document.querySelectorAll('.category-link').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();

            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);

            if (targetElement) {
                // Rola para a seção com offset considerando navbares fixos
                window.scrollTo({
                    top: targetElement.offsetTop - 150,
                    behavior: 'smooth'
                });
            }
        });
    });

    // 4. TOGGLE DARK/LIGHT MODE
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        const themeIcon = themeToggleBtn.querySelector('i');

        // Restaurar tema salvo ao carregar a página
    const savedTheme = localStorage.getItem('hotdogViviane_Theme');
        if (savedTheme === 'light') {
            document.body.classList.add('light-mode');
            themeIcon.classList.remove('ph-sun');
            themeIcon.classList.add('ph-moon');
        }

        themeToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');

            // Trocar o ícone conforme o tema e salvar preferência
            if (document.body.classList.contains('light-mode')) {
                themeIcon.classList.remove('ph-sun');
                themeIcon.classList.add('ph-moon');
                localStorage.setItem('hotdogViviane_Theme', 'light');
            } else {
                themeIcon.classList.remove('ph-moon');
                themeIcon.classList.add('ph-sun');
                localStorage.setItem('hotdogViviane_Theme', 'dark');
            }
        });
    }

    // 4b. MENU HAMBURGUER (MOBILE)
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const navLinks = document.getElementById('nav-links');
    const hamburgerIcon = document.getElementById('hamburger-icon');

    if (hamburgerBtn && navLinks) {
        hamburgerBtn.addEventListener('click', () => {
            const isOpen = navLinks.classList.toggle('open');
            hamburgerIcon.className = isOpen ? 'ph ph-x' : 'ph ph-list';
        });

        // Fecha o menu ao clicar em qualquer link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('open');
                hamburgerIcon.className = 'ph ph-list';
            });
        });
    }

    // 5. LÓGICA DO CARRINHO (MODAL E CARRINHO FUNCIONAL)
    const cartModal = document.getElementById('cart-modal');
    const closeCartBtn = document.getElementById('close-cart');
    const headerCartBtn = document.getElementById('header-cart-btn');
    const cartBadge = document.getElementById('cart-badge');
    const emptyCartMsg = document.querySelector('.empty-cart-msg');
    const cartItemsContainer = document.querySelector('.cart-items-container');
    const cartTotalPrice = document.getElementById('cart-total-price');
    const checkoutBtn = document.getElementById('checkout-btn');

    let cart = JSON.parse(localStorage.getItem('hotdogViviane_Cart')) || [];
    let activeCoupon = JSON.parse(localStorage.getItem('hotdogViviane_Coupon')) || null;
    let deliveryType = localStorage.getItem('hotdogViviane_DeliveryType') || 'retirada'; // 'retirada' | 'entrega'
    let globalDeliveryFee = 0; // será carregado do Supabase

    // Carregar a taxa de entrega do banco
    if (supabase) {
        supabase.from('settings').select('delivery_fee').eq('id', 1).single()
            .then(({ data }) => {
                if (data && data.delivery_fee != null) {
                    globalDeliveryFee = parseFloat(data.delivery_fee);
                }
                // Atualizar display se já estiver no modo entrega
                if (deliveryType === 'entrega') {
                    const feeDisplay = document.getElementById('delivery-fee-display');
                    if (feeDisplay) feeDisplay.textContent = `R$ ${globalDeliveryFee.toFixed(2).replace('.', ',')}`;
                }
                if (cart.length > 0) updateCartUI();
            });
    }

    // Configura o toggle de Retirada/Entrega
    const btnRetirada = document.getElementById('btn-retirada');
    const btnEntrega = document.getElementById('btn-entrega');
    const deliveryFeeLine = document.getElementById('delivery-fee-line');
    const deliveryFeeDisplay = document.getElementById('delivery-fee-display');

    function setDeliveryType(type) {
        deliveryType = type;
        localStorage.setItem('hotdogViviane_DeliveryType', type);

        if (type === 'entrega') {
            btnRetirada.classList.remove('active');
            btnEntrega.classList.add('active');
            if (deliveryFeeLine) deliveryFeeLine.style.display = 'block';
            if (deliveryFeeDisplay) deliveryFeeDisplay.textContent = `R$ ${globalDeliveryFee.toFixed(2).replace('.', ',')}`;
        } else {
            btnEntrega.classList.remove('active');
            btnRetirada.classList.add('active');
            if (deliveryFeeLine) deliveryFeeLine.style.display = 'none';
        }
        updateCartUI();
    }

    // Restaura o estado salvo
    if (deliveryType === 'entrega') setDeliveryType('entrega');

    if (btnRetirada) btnRetirada.addEventListener('click', () => setDeliveryType('retirada'));
    if (btnEntrega) btnEntrega.addEventListener('click', () => setDeliveryType('entrega'));

    // Se tiver item pendente no navegador, puxa na inicialização
    if (cart.length > 0) {
        setTimeout(() => updateCartUI(), 200);
    }

    // Funções de Abrir/Fechar
    // ======================
    // ✨ MICRO-INTERAÇÃO: Partícula voando para o carrinho
    function flyToCart(originElement) {
        if (!originElement || !cartBadge) return;

        const originRect = originElement.getBoundingClientRect();
        const targetRect = cartBadge.getBoundingClientRect();

        const fly = document.createElement('div');
        fly.className = 'fly-item';
        fly.textContent = '🍕';
        fly.style.left = `${originRect.left + originRect.width / 2 - 18}px`;
        fly.style.top = `${originRect.top + originRect.height / 2 - 18}px`;
        document.body.appendChild(fly);

        const dx = (targetRect.left + targetRect.width / 2) - (originRect.left + originRect.width / 2);
        const dy = (targetRect.top + targetRect.height / 2) - (originRect.top + originRect.height / 2);

        fly.style.transition = 'transform 0.75s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.75s ease';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                fly.style.transform = `translate(${dx}px, ${dy}px) scale(0.2)`;
                fly.style.opacity = '0';
            });
        });

        // Badge bounce ao aterrissar
        setTimeout(() => {
            cartBadge.classList.remove('bounce');
            void cartBadge.offsetWidth; // Force reflow
            cartBadge.classList.add('bounce');
            fly.remove();
        }, 720);
    }

    function openCart() {
        if (cartModal) cartModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeCart() {
        if (cartModal) cartModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Função Helper: Notificação Rápida Visual (Toast)
    function showToast(message) {
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <i class="ph-fill ph-check-circle"></i>
            <span>${message}</span>
        `;
        toastContainer.appendChild(toast);

        // Anima a entrada
        requestAnimationFrame(() => {
            requestAnimationFrame(() => toast.classList.add('show'));
        });

        // Some e destrói após 3 segundos
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400); // 400ms = tempo da minha transition
        }, 3000);
    }

    if (headerCartBtn) headerCartBtn.addEventListener('click', openCart);
    if (closeCartBtn) closeCartBtn.addEventListener('click', closeCart);
    window.addEventListener('click', (e) => {
        if (e.target === cartModal) closeCart();
    });

    // Função de Adicionar Opcionais (Abrir Modal de Detalhes)
    document.addEventListener('click', (e) => {
        const detailBtn = e.target.closest('.open-detail-btn');
        if (detailBtn) {
            let name = detailBtn.dataset.name;
            if (name) openProductDetail(name);
            return;
        }

        const addBtn = e.target.closest('.add-to-cart');
        if (addBtn) {
            if (!estaAberto) {
                showToast('Estamos fechados no momento!');
                return;
            }
            let name = addBtn.dataset.name;
            let price = parseFloat(addBtn.dataset.price);

            if (!name || isNaN(price)) return;

            const existingItem = cart.find(item => item.name === name);
            if (existingItem) {
                existingItem.quantity += 1;
            } else {
                cart.push({ name, price, quantity: 1 });
            }

            // ✨ Micro-interações
            addBtn.classList.remove('clicked');
            void addBtn.offsetWidth;
            addBtn.classList.add('clicked');
            flyToCart(addBtn);

            updateCartUI();
            showToast(`${name} adicionado ao carrinho!`);
        }
    });

    // 6. LÓGICA DO MODAL DE DETALHES DO PRODUTO (TELA CHEIA)
    const productDetailModal = document.getElementById('product-detail-modal');
    const closeDetailBtn = document.getElementById('close-product-detail');
    const detailAddBtn = document.getElementById('btn-add-detail-cart');

    let currentDetailProduct = null;
    let detailQty = 1;
    let currentExtras = [];
    let basePrice = 0;

    function resetDetailModal() {
        detailQty = 1;
        currentExtras = [];
        document.getElementById('detail-qty-value').textContent = detailQty;
        const extrasList = document.getElementById('detail-extras-list');
        if (extrasList) extrasList.innerHTML = '';
        const extrasSec = document.getElementById('detail-extras-section');
        if (extrasSec) extrasSec.style.display = 'none';
    }

    function updateTotalDetailPrice() {
        if (!currentDetailProduct) return;
        let extrasTotal = currentExtras.reduce((sum, e) => sum + e.price, 0);
        let finalPrice = (basePrice + extrasTotal) * detailQty;
        document.getElementById('detail-total-price').textContent = 'R$ ' + finalPrice.toFixed(2).replace('.', ',');
    }

    function openProductDetail(productName) {
        if (!window.globalProducts) return;
        const prod = window.globalProducts.find(p => p.name === productName);
        if (!prod) return;

        currentDetailProduct = prod;
        basePrice = prod.price;
        resetDetailModal();

        document.getElementById('detail-title').textContent = prod.name;
        document.getElementById('detail-desc').textContent = prod.description || '';
        document.getElementById('detail-price').textContent = 'R$ ' + prod.price.toFixed(2).replace('.', ',');

        const imgBox = document.getElementById('detail-image');
        if (prod.image_url) {
            imgBox.style.backgroundImage = `url('${prod.image_url}')`;
        } else {
            imgBox.style.backgroundImage = 'none';
            imgBox.style.backgroundColor = 'var(--bg-card)';
        }

        const extrasList = document.getElementById('detail-extras-list');
        const extrasSection = document.getElementById('detail-extras-section');

        // Os elementos fictícios de "Personalize seu pedido" foram removidos conforme solicitação.
        // A lógica de opcionais virá dinamicamente do banco no futuro.
        extrasSection.style.display = 'none';

        const relatedList = document.getElementById('detail-related-list');
        const relatedSection = document.getElementById('detail-related-section');
        relatedList.innerHTML = '';

        const crossSells = window.globalProducts.filter(p => p.name !== prod.name).slice(0, 5);
        if (crossSells.length > 0) {
            crossSells.forEach(rel => {
                const rCard = document.createElement('div');
                rCard.className = 'related-card';
                const imgRel = rel.image_url || 'https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=300&auto=format&fit=crop';
                rCard.innerHTML = `
                    <div class="related-img" style="background-image: url('${imgRel}'); background-color: var(--bg-card);"></div>
                    <div class="related-info">
                        <h5>${rel.name}</h5>
                        <span>R$ ${rel.price.toFixed(2).replace('.', ',')}</span>
                    </div>
                `;
                rCard.addEventListener('click', () => {
                    openProductDetail(rel.name);
                });
                relatedList.appendChild(rCard);
            });
            relatedSection.style.display = 'block';
        } else {
            relatedSection.style.display = 'none';
        }

        updateTotalDetailPrice();
        if (productDetailModal) productDetailModal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Lógica do botão Compartilhar
        const btnShare = document.getElementById('btn-share-product');
        if (btnShare) {
            btnShare.onclick = () => {
                const text = `🌭 Olha que delícia! Estou com vontade de pedir: *${prod.name}* no Hotdog Viviane.\n\nVeja no cardápio online: https://hotdogviviane.vercel.app/`;
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
            };
        }
    }

    if (closeDetailBtn) {
        closeDetailBtn.addEventListener('click', () => {
            productDetailModal.classList.remove('active');
            document.body.style.overflow = '';
        });
    }

    const btnMinus = document.getElementById('detail-qty-minus');
    if (btnMinus) {
        btnMinus.addEventListener('click', () => {
            if (detailQty > 1) { detailQty--; document.getElementById('detail-qty-value').textContent = detailQty; updateTotalDetailPrice(); }
        });
    }

    const btnPlus = document.getElementById('detail-qty-plus');
    if (btnPlus) {
        btnPlus.addEventListener('click', () => {
            detailQty++; document.getElementById('detail-qty-value').textContent = detailQty; updateTotalDetailPrice();
        });
    }

    if (detailAddBtn) {
        detailAddBtn.addEventListener('click', () => {
            if (!estaAberto) {
                showToast('Estamos fechados no momento!'); return;
            }
            if (!currentDetailProduct) return;

            let finalName = currentDetailProduct.name;
            if (currentExtras.length > 0) {
                const extrasNames = currentExtras.map(e => e.name).join(', ');
                finalName += ` (+ ${extrasNames})`;
            }
            let extrasTotal = currentExtras.reduce((sum, e) => sum + e.price, 0);
            let finalPrice = basePrice + extrasTotal;

            const existingItem = cart.find(item => item.name === finalName);
            if (existingItem) {
                existingItem.quantity += detailQty;
            } else {
                cart.push({ name: finalName, price: finalPrice, quantity: detailQty });
            }

            updateCartUI();
            productDetailModal.classList.remove('active');
            document.body.style.overflow = '';
            showToast(`${currentDetailProduct.name} adicionado ao carrinho!`);
        });
    }

    // Função para atualizar a Interface do Carrinho
    function updateCartUI() {
        // Atualiza Badge
        const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

        if (totalItems > 0) {
            cartBadge.style.display = 'flex';
            cartBadge.textContent = totalItems;

            emptyCartMsg.style.display = 'none';
            cartItemsContainer.style.display = 'block';
            checkoutBtn.disabled = false;
        } else {
            cartBadge.style.display = 'none';
            cartBadge.textContent = '0';

            emptyCartMsg.style.display = 'block';
            cartItemsContainer.style.display = 'none';
            checkoutBtn.disabled = true;
        }

        // Renderiza itens
        cartItemsContainer.innerHTML = '';
        let subtotalVal = 0;

        cart.forEach((item, index) => {
            subtotalVal += item.price * item.quantity;

            const itemElement = document.createElement('div');
            itemElement.classList.add('cart-item');

            itemElement.innerHTML = `
                <div class="cart-item-info">
                    <h4>${item.name}</h4>
                    <span>R$ ${item.price.toFixed(2).replace('.', ',')}</span>
                </div>
                <div class="cart-item-controls">
                    <div class="cart-item-qty">
                        <button class="decrease-qty" data-index="${index}"><i class="ph ph-minus"></i></button>
                        <span>${item.quantity}</span>
                        <button class="increase-qty" data-index="${index}"><i class="ph ph-plus"></i></button>
                    </div>
                    <button class="cart-item-remove" data-index="${index}"><i class="ph ph-trash"></i></button>
                </div>
            `;
            cartItemsContainer.appendChild(itemElement);
        });

        // Aplica Taxa de Entrega se necessário
        const deliveryFee = (deliveryType === 'entrega') ? globalDeliveryFee : 0;

        // Atualiza Total Price com Desconto e Taxa
        let discountHtml = '';
        let totalVal = subtotalVal + deliveryFee;

        if (activeCoupon) {
            const discountValue = (subtotalVal * activeCoupon.discount_percentage) / 100;
            totalVal = subtotalVal - discountValue + deliveryFee;
            discountHtml = `<span style="display:block; font-size: 0.8rem; color: var(--primary-red);">Subtotal: R$ ${subtotalVal.toFixed(2).replace('.', ',')} | Desconto: -R$ ${discountValue.toFixed(2).replace('.', ',')} (${activeCoupon.discount_percentage}%)</span>`;
        }

        cartTotalPrice.innerHTML = `${discountHtml}R$ ${totalVal.toFixed(2).replace('.', ',')}`;


        // Eventos nos botões recém renderizados (+, - e remover)
        document.querySelectorAll('.increase-qty').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = e.target.closest('button').dataset.index;
                cart[idx].quantity += 1;
                updateCartUI();
            });
        });

        document.querySelectorAll('.decrease-qty').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = e.target.closest('button').dataset.index;
                if (cart[idx].quantity > 1) {
                    cart[idx].quantity -= 1;
                } else {
                    cart.splice(idx, 1); // remove se chegar a 0
                }
                updateCartUI();
            });
        });

        document.querySelectorAll('.cart-item-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = e.target.closest('button').dataset.index;
                cart.splice(idx, 1);
                updateCartUI();
            });
        });

        // Salvar Carrinho no Navegador a cada atualização
        localStorage.setItem('hotdogViviane_Cart', JSON.stringify(cart));
        localStorage.setItem('hotdogViviane_Coupon', JSON.stringify(activeCoupon));
    }

    // Aplicação de Cupom
    const btnApplyCoupon = document.getElementById('btn-apply-coupon');
    const inputCoupon = document.getElementById('coupon-input');
    const msgCoupon = document.getElementById('coupon-msg');

    if (btnApplyCoupon && supabase) {
        btnApplyCoupon.addEventListener('click', async () => {
            const code = inputCoupon.value.trim().toUpperCase();
            if (!code) return;

            btnApplyCoupon.textContent = '...';
            btnApplyCoupon.disabled = true;

            try {
                const { data: coupon, error } = await supabase
                    .from('coupons')
                    .select('*')
                    .eq('code', code)
                    .eq('is_active', true)
                    .maybeSingle();

                if (coupon) {
                    activeCoupon = coupon;
                    msgCoupon.style.display = 'block';
                    msgCoupon.style.color = '#10b981';
                    msgCoupon.textContent = `Cupom aplicado! ${coupon.discount_percentage}% OFF.`;
                    updateCartUI();
                } else {
                    activeCoupon = null;
                    msgCoupon.style.display = 'block';
                    msgCoupon.style.color = 'var(--primary-red)';
                    msgCoupon.textContent = 'Cupom inválido ou expirado.';
                    updateCartUI();
                }
            } catch (e) {
                console.warn(e);
            } finally {
                btnApplyCoupon.textContent = 'Aplicar';
                btnApplyCoupon.disabled = false;
            }
        });
    }

    // ==========================================
    // 6. PERFIL DE USUÁRIO (LOCALSTORAGE)
    // ==========================================
    const profileBtn = document.getElementById('header-profile-btn');
    const profileModal = document.getElementById('profile-modal');
    const closeProfileBtn = document.getElementById('close-profile');
    const profileTabs = document.querySelectorAll('.profile-tab');
    const profileContents = document.querySelectorAll('.profile-tab-content');

    const inputName = document.getElementById('profile-name');
    const inputPhone = document.getElementById('profile-phone');
    const inputAddress = document.getElementById('profile-address');
    const btnSaveProfile = document.getElementById('btn-save-profile');
    const msgSaveProfile = document.getElementById('profile-save-msg');

    // Histórico
    const historyContainer = document.getElementById('orders-history-container');

    // Máscara dinâmica de Celular/WhatsApp: (XX) XXXXX-XXXX
    if (inputPhone) {
        inputPhone.addEventListener('input', async function (e) {
            let val = e.target.value.replace(/\D/g, '');
            let x = val.match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
            e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');

            // Auto-preenchimento (Login automático) ao completar 11 dígitos
            if (val.length === 11 && supabase) {
                try {
                    const formattedPhone = e.target.value.trim();
                    console.log("🔍 Buscando perfil para:", val);
                    const { data: customer, error: rpcErr } = await supabase.rpc('get_customer_by_phone', { phone_query: val });
                    if (rpcErr) console.error("❌ Erro RPC Perfil:", rpcErr);
                    console.log("✅ Resultado Perfil:", customer);
                    const profileRec = (customer && customer.length > 0) ? customer[0] : null;

                    if (profileRec) {
                        if (profileRec.full_name) inputName.value = profileRec.full_name;
                        if (profileRec.address) inputAddress.value = profileRec.address;

                        // Atualiza o local storage 
                        localStorage.setItem('hotdogViviane_Profile', JSON.stringify({
                            name: profileRec.full_name || "",
                            phone: formattedPhone,
                            address: profileRec.address || ""
                        }));

                        // Avisa o usuário e já prepara o histórico recarregado
                        if (typeof showToast === 'function') {
                            showToast("🙌 Seja bem-vindo de volta! Seus dados foram recuperados.");
                        }
                        renderOrderHistory();
                    }
                } catch (err) {
                    console.warn("Cliente novo ou erro na busca", err);
                }
            }
        });
    }

    // Abre modal
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            profileModal.classList.add('active');
            document.body.style.overflow = 'hidden';

            // Limpa o badge ao abrir o perfil
            const pBadge = document.getElementById('profile-badge');
            if (pBadge) {
                pBadge.style.display = 'none';
                pBadge.classList.remove('pulse');
            }

            loadProfileData();
            renderOrderHistory();
        });
    }

    // Fecha modal
    if (closeProfileBtn) {
        closeProfileBtn.addEventListener('click', () => {
            profileModal.classList.remove('active');
            document.body.style.overflow = '';
        });
    }

    // Fechar ao clicar fora do profile
    profileModal.addEventListener('click', (e) => {
        if (e.target === profileModal) {
            profileModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // Sistema de Abas do Perfil
    profileTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active classes
            profileTabs.forEach(t => t.classList.remove('active'));
            profileContents.forEach(c => c.classList.remove('active'));

            // Set active
            tab.classList.add('active');
            const targetId = `tab-${tab.dataset.tab}`;
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Carregar Dados do LocalStorage
    function loadProfileData() {
        const savedProfile = JSON.parse(localStorage.getItem('hotdogViviane_Profile'));
        if (savedProfile) {
            inputName.value = savedProfile.name || "";
            inputPhone.value = savedProfile.phone || "";
            inputAddress.value = savedProfile.address || "";
        }
    }

    // Salvar Dados no LocalStorage e SUPABASE
    if (btnSaveProfile) {
        btnSaveProfile.addEventListener('click', async () => {
            const name = inputName.value.trim();
            const rawPhone = inputPhone.value.trim();
            const phone = rawPhone.replace(/\D/g, ''); // Normaliza para salvar no banco
            const address = inputAddress.value.trim();

            if (!name || !phone) {
                alert("Por favor, preencha nome e celular.");
                return;
            }

            const profileData = {
                full_name: name,
                phone: phone,
                address: address,
                email: null // reservado para expansão
            };

            // Backup local instantâneo (mantém o original para o input)
            localStorage.setItem('hotdogViviane_Profile', JSON.stringify({
                name: name,
                phone: rawPhone,
                address: address
            }));

                        // Sync Supabase (REI NEO Tracker)
            if (supabase) {
                try {
                    console.log("💾 Salvando perfil no Supabase:", profileData);
                    // Busca se já existe pelo telefone normalizado
                    const { data: existing, error: findError } = await supabase
                        .from('customers')
                        .select('id')
                        .eq('phone', phone)
                        .maybeSingle(); // maybeSingle não joga erro se não achar nada

                    if (findError) console.error("❌ Erro ao buscar cliente existente:", findError);

                    if (existing) {
                        console.log("📝 Atualizando cliente ID:", existing.id);
                        const { error: updErr } = await supabase.from('customers').update(profileData).eq('id', existing.id);
                        if (updErr) console.error("❌ Erro ao atualizar perfil:", updErr);
                    } else {
                        console.log("✨ Criando novo cliente");
                        const { error: insErr } = await supabase.from('customers').insert([profileData]);
                        if (insErr) console.error("❌ Erro ao inserir perfil:", insErr);
                    }
                } catch (e) {
                    console.warn("Sincronização com o banco falhou, mas dados salvos no aparelho.", e);
                }
            }

            // Feedback visual e fechar (opcional)
            msgSaveProfile.style.display = 'block';
            setTimeout(() => {
                msgSaveProfile.style.display = 'none';
                // REI NEO, vamos fechar o modal para dar sensação de conclusão
                profileModal.classList.remove('active');
                document.body.style.overflow = '';
            }, 1000);
        });
    }

    // Renderizar Histórico de Pedidos do Banco
    async function renderOrderHistory() {
        if (!historyContainer) return;

        historyContainer.innerHTML = '<div style="text-align:center; padding: 20px;"><i class="ph ph-spinner ph-spin" style="font-size:2rem; color:var(--primary-red);"></i><p>Carregando histórico...</p></div>';

        const profile = JSON.parse(localStorage.getItem('hotdogViviane_Profile')) || {};
        const phone = (profile.phone || '').replace(/\D/g, ''); // Normaliza para busca

        let dbOrders = [];
        if (supabase && phone) {
            try {
                console.log("🕰️ Buscando histórico para telefone:", phone);
                // Busca SEGURA via RPC: O cliente não tem mais permissão de ler a tabela 'orders' diretamente.
                // A função 'get_my_orders' no banco garante que ele só receba os SEUS pedidos.
                const { data: orders, error: rpcErr } = await supabase.rpc('get_my_orders', { phone_query: phone });

                if (rpcErr) {
                    console.error("❌ Erro RPC Histórico:", rpcErr);
                } else {
                    console.log("✅ Histórico recuperado:", orders);
                    if (orders) dbOrders = orders;
                }
            } catch (e) {
                console.warn("Erro ao buscar histórico via RPC, fallback para LocalStorage.", e);
            }
        }

        // Se falhar o banco ou não tiver conectado, usa o localStorage antigo
        const savedOrders = JSON.parse(localStorage.getItem('hotdogViviane_Orders')) || [];

        if (dbOrders.length === 0 && savedOrders.length === 0) {
            historyContainer.innerHTML = `
                <div class="empty-cart-msg">
                    <i class="ph ph-clock-counter-clockwise"></i>
                    <p>Nenhum pedido anterior encontrado.</p>
                    <span>Seus próximos pedidos ficarão salvos aqui.</span>
                </div>
            `;
            return;
        }

        historyContainer.innerHTML = '';

        // Prioridade para dados do Banco, se houver
        if (dbOrders.length > 0) {
            dbOrders.forEach((order) => {
                const dateStr = new Date(order.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                });

                let items = [];
                try { items = JSON.parse(order.items); } catch (e) { }

                let itemsPreview = items.filter(i => !i.name.includes("Desconto")).map(i => `${i.quantity}x ${esc(i.name)}`).join(', ');
                if (itemsPreview.length > 50) itemsPreview = itemsPreview.substring(0, 47) + '...';

                // Repete a lógica de numérico e delivery_type (como no KDS)
                const numericHash = parseInt(order.id.replace(/-/g, '').substring(0, 8), 16).toString();
                const shortId = numericHash.substring(numericHash.length - 4);
                let badgeClass = order.delivery_type === 'entrega' ? 'entrega' : 'retirada';
                let badgeLabel = order.delivery_type === 'entrega' ? 'Entrega' : 'Retirada';

                // Mapeia os status internos pro cliente
                let statusLabel = 'Aguardando Cofirmação';
                let statusColor = '#f59e0b';
                if (order.status === 'preparando') { statusLabel = 'Na Cozinha'; statusColor = '#3b82f6'; }
                if (order.status === 'pronto' || order.status === 'enviado') { statusLabel = order.delivery_type === 'entrega' ? 'Saiu pra Entrega' : 'Pronto para Retirar'; statusColor = '#8b5cf6'; }
                if (order.status === 'entregue') { statusLabel = 'Finalizado'; statusColor = '#10b981'; }

                const card = document.createElement('div');
                card.style.cssText = `
                    background: rgba(255,255,255,0.03); 
                    border: 1px solid var(--border-color); 
                    padding: 16px; 
                    border-radius: var(--radius-md); 
                    margin-bottom: 12px;
                `;

                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; align-items:center;">
                        <span style="font-size: 0.85rem; color: var(--text-muted);"><i class="ph ph-calendar"></i> ${dateStr}</span>
                        <strong style="color: var(--primary-red);">R$ ${order.total_price.toFixed(2).replace('.', ',')}</strong>
                    </div>
                    <div style="display:flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.8rem; align-items:center;">
                        <span style="color: #fff; font-weight:bold;">Pedido #${shortId}</span>
                        <span style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">${badgeLabel}</span>
                        <span style="color: ${statusColor}; font-weight:bold;">${statusLabel}</span>
                    </div>
                    <p style="font-size: 0.95rem; color: var(--text-light); margin-bottom: 12px;">${itemsPreview}</p>
                    <button class="btn-primary" onclick="reorderItemsFromDB('${encodeURIComponent(JSON.stringify(items))}')" style="width: 100%; padding: 10px; font-size: 0.9rem;">
                        <i class="ph ph-arrows-clockwise"></i> Pedir Novamente
                    </button>
                `;
                historyContainer.appendChild(card);
            });
        } else {
            // Fallback usando o local storage antigo
            savedOrders.reverse().forEach((order, index) => {
                const originalIndex = savedOrders.length - 1 - index;
                const dateStr = new Date(order.date).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                });

                let itemsPreview = order.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
                if (itemsPreview.length > 50) itemsPreview = itemsPreview.substring(0, 47) + '...';

                const card = document.createElement('div');
                card.style.cssText = `
                    background: rgba(255,255,255,0.03); 
                    border: 1px solid var(--border-color); 
                    padding: 16px; 
                    border-radius: var(--radius-md); 
                    margin-bottom: 12px;
                `;

                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-size: 0.85rem; color: var(--text-muted);"><i class="ph ph-calendar"></i> ${dateStr}</span>
                        <strong style="color: var(--primary-red);">R$ ${order.total.toFixed(2).replace('.', ',')}</strong>
                    </div>
                    <p style="font-size: 0.95rem; color: var(--text-light); margin-bottom: 12px;">${itemsPreview}</p>
                    <button class="btn-primary" onclick="reorderItems(${originalIndex})" style="width: 100%; padding: 10px; font-size: 0.9rem;">
                        <i class="ph ph-arrows-clockwise"></i> Pedir Novamente
                    </button>
                `;
                historyContainer.appendChild(card);
            });
        }
    }

    // Função Global para recarregar do banco
    window.reorderItemsFromDB = function (encodedItems) {
        try {
            const itemsArr = JSON.parse(decodeURIComponent(encodedItems));
            if (itemsArr && itemsArr.length) {
                cart.length = 0;
                // Carrega ignorando taxas antigas pois o sistema recalcula na hora
                itemsArr.filter(i => !i.name.includes("Taxa de Entrega") && !i.name.includes("Desconto")).forEach(item => {
                    cart.push({ ...item });
                });
                updateCartUI();
                profileModal.classList.remove('active');
                openCart();
            }
        } catch (e) { console.error("Erro recarregando pedido:", e); }
    };

    // Função Global atrelada ao window para recarregar um carrinho via clique inline HTML (Fallback)
    window.reorderItems = function (orderIndex) {
        const savedOrders = JSON.parse(localStorage.getItem('hotdogViviane_Orders')) || [];
        const orderToCopy = savedOrders[orderIndex];

        if (orderToCopy && orderToCopy.items) {
            cart.length = 0;
            orderToCopy.items.forEach(item => {
                cart.push({ ...item });
            });

            updateCartUI();
            profileModal.classList.remove('active');
            openCart();
        }
    };

    // ==========================================
    // 7. FINALIZAR PEDIDO (WHATSAPP + SALVAR)
    // ==========================================
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', async () => {
            if (cart.length === 0) return;

            // Busca os dados do perfil atualizados
            const profile = JSON.parse(localStorage.getItem('hotdogViviane_Profile')) || {};
            const clientPhone = (profile.phone || '').replace(/\D/g, '');
            const nomeCliente = profile.name ? `\n👤 *Cliente:* ${profile.name}` : "";
            const enderecoCliente = profile.address ? `\n📍 *Endereço de Entrega:* ${profile.address}` : "\n⚠️ *Endereço não informado*";

            let subtotalPedido = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0);

            // Taxa de Entrega
            let deliveryFee = (deliveryType === 'entrega') ? globalDeliveryFee : 0;
            let totalPedido = subtotalPedido + deliveryFee;

            let discountInfo = "";
            let discountValue = 0;

            if (activeCoupon) {
                discountValue = (subtotalPedido * activeCoupon.discount_percentage) / 100;
                totalPedido = subtotalPedido - discountValue + deliveryFee;
                discountInfo = `\n🏷️ *Cupom Aplicado:* ${activeCoupon.code} (-${activeCoupon.discount_percentage}%)`;
            }

            // 1. SYNC SUPABASE (REI NEO DASHBOARD E KDS)
            let orderShortId = '0000';
            if (supabase) {
                try {
                    const { data: customer } = await supabase.from('customers').select('id').eq('phone', clientPhone).maybeSingle();

                    const payloadItems = cart.map(item => ({ ...item }));
                    if (activeCoupon) {
                        payloadItems.push({ name: `Desconto Cupom (${activeCoupon.code})`, price: -discountValue, quantity: 1 });
                    }
                    if (deliveryType === 'entrega' && deliveryFee > 0) {
                        payloadItems.push({ name: `Taxa de Entrega`, price: deliveryFee, quantity: 1 });
                    }

                    const orderPayload = {
                        customer_id: customer ? customer.id : null,
                        total_price: totalPedido,
                        items: JSON.stringify(payloadItems),
                        customer_details: JSON.stringify({ ...profile, phone: clientPhone }),
                        status: 'pendente',
                        delivery_type: deliveryType,
                        delivery_fee: deliveryFee
                    };

                    const { data: insertedOrder } = await supabase.from('orders').insert([orderPayload]).select('id').single();
                    if (insertedOrder) {
                        const numericHash = parseInt(insertedOrder.id.replace(/-/g, '').substring(0, 8), 16).toString();
                        orderShortId = numericHash.substring(numericHash.length - 4);

                        let actives = JSON.parse(localStorage.getItem('hotdogViviane_ActiveOrders')) || [];
                        if (!actives.includes(insertedOrder.id)) actives.push(insertedOrder.id);
                        localStorage.setItem('hotdogViviane_ActiveOrders', JSON.stringify(actives));

                        if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
                            Notification.requestPermission();
                        }
                        if (typeof window.initClientRealtime === 'function') window.initClientRealtime();
                    }
                } catch (e) {
                    console.warn("Falha ao registrar pedido no Dashboard.");
                }
            }

            // Formata o texto do pedido (WHATSAPP)
            let textoPedido = `*🌭 NOVO PEDIDO - Hotdog Viviane*\n*Nº ${orderShortId}*\n`;
            let tipoPedidoTxt = (deliveryType === 'entrega') ? "🛵 *ENTREGA*" : "🏪 *RETIRADA NO LOCAL*";
            textoPedido += `\n${tipoPedidoTxt}`;
            textoPedido += nomeCliente;

            if (deliveryType === 'entrega') {
                textoPedido += enderecoCliente;
            } else {
                textoPedido += "\n📍 *Cliente irá retirar na lanchonete.*";
            }

            textoPedido += "\n\n*Itens do Pedido:*";

            cart.forEach(item => {
                const subtotal = item.price * item.quantity;
                textoPedido += `\n▪ ${item.quantity}x ${item.name} - R$ ${subtotal.toFixed(2).replace('.', ',')}`;
            });

            if (discountInfo) {
                textoPedido += `\n\n*Subtotal:* R$ ${subtotalPedido.toFixed(2).replace('.', ',')}`;
                textoPedido += discountInfo;
            }

            if (deliveryType === 'entrega' && deliveryFee >= 0) {
                textoPedido += `\n🛵 *Taxa de Entrega:* R$ ${deliveryFee.toFixed(2).replace('.', ',')}`;
            }

            textoPedido += `\n\n*💰 TOTAL:* R$ ${totalPedido.toFixed(2).replace('.', ',')}`;
            textoPedido += "\n\n_Desejo finalizar meu pedido, por favor!_";

            // Salva o Histórico LOCAL
            const storedOrders = JSON.parse(localStorage.getItem('hotdogViviane_Orders')) || [];
            storedOrders.push({
                date: new Date().toISOString(),
                items: [...cart],
                total: totalPedido
            });
            if (storedOrders.length > 20) storedOrders.shift();
            localStorage.setItem('hotdogViviane_Orders', JSON.stringify(storedOrders));

            // Esvazia e salva o Carrinho para compras futuras
            cart = [];
            activeCoupon = null;
            updateCartUI();
            closeCart();

            // Mostra o Modal de Sucesso
            const successModal = document.getElementById('success-modal');
            const successOrderId = document.getElementById('success-order-id');
            const btnSuccessWa = document.getElementById('btn-success-whatsapp');
            const btnSuccessClose = document.getElementById('btn-success-close');

            if (successModal) {
                successOrderId.textContent = `#${orderShortId}`;
                successModal.classList.add('active');

                // Ação do botão do WhatsApp
                btnSuccessWa.onclick = () => {
                    const numeroWhatsApp = "5519981651230";
                    const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(textoPedido)}`;
                    window.open(urlWhatsApp, '_blank');
                    successModal.classList.remove('active');
                };

                btnSuccessClose.onclick = () => {
                    successModal.classList.remove('active');
                };
            } else {
                // Fallback se não existir modal
                const numeroWhatsApp = "5519981651230";
                const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(textoPedido)}`;
                window.open(urlWhatsApp, '_blank');
            }
        });
    }

    // 7. LÓGICA DE BUSCA Dinâmica
    const searchInput = document.getElementById('menu-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            const sections = document.querySelectorAll('.menu-section');

            sections.forEach(section => {
                const products = section.querySelectorAll('.product-card, .list-item');
                let hasVisibleProduct = false;

                products.forEach(prod => {
                    const titleEl = prod.querySelector('.product-title');
                    const descEl = prod.querySelector('.product-desc');
                    const name = titleEl ? titleEl.textContent.toLowerCase() : '';
                    const desc = descEl ? descEl.textContent.toLowerCase() : '';

                    if (name.includes(term) || desc.includes(term)) {
                        prod.style.display = '';
                        hasVisibleProduct = true;
                    } else {
                        prod.style.display = 'none';
                    }
                });

                if (hasVisibleProduct) {
                    section.style.display = '';
                } else {
                    section.style.display = 'none';
                }
            });
        });
    }

    // 8. BOTÃO VOLTAR AO TOPO
    const backToTopBtn = document.getElementById('btn-back-to-top');
    if (backToTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                backToTopBtn.classList.add('show');
            } else {
                backToTopBtn.classList.remove('show');
            }
        });

        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // 9. NOTIFICAÇÕES NATIVAS (PWA & REALTIME)
    window.initClientRealtime = function () {
        if (!supabase) return;
        const activeOrders = JSON.parse(localStorage.getItem('hotdogViviane_ActiveOrders')) || [];
        if (activeOrders.length === 0) return;

        supabase.channel('customer-orders')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
                const updated = payload.new;
                if (activeOrders.includes(updated.id)) {
                    sendClientNotification(updated);
                }
            }).subscribe();
    }

    function sendClientNotification(order) {
        let msg = "";
        if (order.status === 'preparando') msg = "👨‍🍳 Chapeiro na chapa! Seu pedido começou a ser preparado.";
        if (order.status === 'pronto' || order.status === 'enviado') msg = order.delivery_type === 'entrega' ? "🛵 Seu pedido saiu para entrega!" : "🍕 Seu pedido está pronto para retirada!";
        if (order.status === 'entregue') {
            msg = "🎉 Pedido finalizado. Bom apetite!";
            let actives = JSON.parse(localStorage.getItem('hotdogViviane_ActiveOrders')) || [];
            actives = actives.filter(id => id !== order.id);
            localStorage.setItem('hotdogViviane_ActiveOrders', JSON.stringify(actives));
        }

        // 1. Mostra o badge no ícone do perfil se o modal estiver fechado
        const profileModal = document.getElementById('profile-modal');
        const pBadge = document.getElementById('profile-badge');
        if (profileModal && !profileModal.classList.contains('active') && pBadge) {
            pBadge.style.display = 'block';
            pBadge.classList.add('pulse');
        }

        // 2. Se o modal de histórico estiver aberto, recarrega a lista na hora
        if (profileModal && profileModal.classList.contains('active')) {
            renderOrderHistory();
        }

        if (!msg) return;

        if ("Notification" in window && Notification.permission === 'granted') {
            try {
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification('Hotdog Viviane', {
                        body: msg,
                        icon: 'img/logo_hotdog_viviane.png',
                        badge: 'img/logo_hotdog_viviane.png',
                        vibrate: [200, 100, 200]
                    });
                }).catch(() => {
                    new Notification('Hotdog Viviane', { body: msg, icon: 'img/logo_hotdog_viviane.png' });
                });
            } catch (e) {
                new Notification('Hotdog Viviane', { body: msg, icon: 'img/logo_hotdog_viviane.png' });
            }
        }
    }

    window.initClientRealtime();

    setTimeout(() => {
        const p = JSON.parse(localStorage.getItem('hotdogViviane_Profile'));
        if (p && "Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission();
        }
    }, 5000);

    // 6. GUIA DE INSTALAÇÃO iOS
    const checkIOSInstall = () => {
        // Detecta se é iOS
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        // Detecta se NÃO está em modo standalone (ou seja, está no navegador)
        const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

        if (isIOS && !isStandalone) {
            const lastDismissed = localStorage.getItem('hotdogViviane_iOSGuideDismissed');
            const now = Date.now();

            // Só mostra se nunca fechou ou se fechou há mais de 7 dias
            if (!lastDismissed || (now - lastDismissed) > (7 * 24 * 60 * 60 * 1000)) {
                const iosModal = document.getElementById('ios-install-guide');
                const closeBtn = document.getElementById('close-ios-guide');

                if (iosModal) {
                    setTimeout(() => {
                        iosModal.style.display = 'block';
                    }, 3000); // 3 segundos após carregar

                    closeBtn?.addEventListener('click', () => {
                        iosModal.style.display = 'none';
                        localStorage.setItem('hotdogViviane_iOSGuideDismissed', Date.now());
                    });
                }
            }
        }
    };

    checkIOSInstall();

});

