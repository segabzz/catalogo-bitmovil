/**
 * BITMOVIL — Catálogo Digital & Motor de Búsqueda TI
 * app.js (Módulo principal del catálogo)
 */

// -----------------------------------------------------------------------------
// 1. DICCIONARIO DE SINÓNIMOS Y NORMALIZACIÓN DE TEXTO
// -----------------------------------------------------------------------------
const SYNONYMS = {
    'camara': ['camara', 'bala', 'turret', 'cctv', 'ptz', 'domo', 'ip', 'video'],
    'camaras': ['camara', 'bala', 'turret', 'cctv', 'ptz', 'domo', 'ip', 'video'],
    'cctv': ['cctv', 'camara', 'bala', 'turret', 'video'],
    'ups': ['ups', 'no break', 'bateria', 'respaldo', 'inversor'],
    'cable': ['cable', 'bobina', 'utp', 'patch', 'cat6', 'cat6a', 'cobre'],
    'cables': ['cable', 'bobina', 'utp', 'patch', 'cat6', 'cat6a', 'cobre'],
    'switch': ['switch', 'poe', 'conmutador', 'gigabit', 'puertos'],
    'switches': ['switch', 'poe', 'conmutador', 'gigabit', 'puertos']
};

function normalizeText(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

// -----------------------------------------------------------------------------
// 2. MOTOR DE BÚSQUEDA Y SCORING CON PREFIJOS
// -----------------------------------------------------------------------------
function scoreProduct(product, rawQuery) {
    const qNorm = normalizeText(rawQuery);
    if (!qNorm) return 0;

    const rawTokens = qNorm.split(/\s+/).filter(t => t.length > 0);
    if (rawTokens.length === 0) return 0;

    const partNorm = normalizeText(product.no_parte);
    const brandNorm = normalizeText(product.marca_normalizada || product.marca);
    const descNorm = normalizeText(product.descripcion);
    const catNorm = normalizeText(product.linea || '');

    // Coincidencia exacta directa de número de parte
    if (partNorm === qNorm) return 200;
    if (partNorm.includes(qNorm)) return 120;

    let totalScore = 0;

    for (const token of rawTokens) {
        let tokenMatched = false;
        let tokenScore = 0;

        // Lista de variantes incluyendo sinónimos y prefijo (> 3 caracteres)
        const variants = [token];
        if (SYNONYMS[token]) {
            variants.push(...SYNONYMS[token]);
        }

        for (const v of variants) {
            if (partNorm.includes(v)) {
                tokenScore = Math.max(tokenScore, v === token ? 80 : 50);
                tokenMatched = true;
            }
            if (brandNorm.includes(v)) {
                tokenScore = Math.max(tokenScore, 35);
                tokenMatched = true;
            }
            if (descNorm.includes(v)) {
                tokenScore = Math.max(tokenScore, 15);
                tokenMatched = true;
            }
            if (catNorm.includes(v)) {
                tokenScore = Math.max(tokenScore, 10);
                tokenMatched = true;
            }
        }

        // Si algún token de la consulta no coincide con nada, descartar el producto
        if (!tokenMatched) {
            return 0;
        }

        totalScore += tokenScore;
    }

    return totalScore;
}

function searchCatalog(catalogData, query) {
    if (!query || !query.trim()) return [];
    const results = [];

    catalogData.forEach(cat => {
        cat.productos.forEach(prod => {
            const prodWithCat = { ...prod, linea: cat.linea };
            const score = scoreProduct(prodWithCat, query);
            if (score > 0) {
                results.push({ product: prodWithCat, score });
            }
        });
    });

    results.sort((a, b) => b.score - a.score);
    return results;
}

// Exportación universal para pruebas unitarias con Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeText, scoreProduct, searchCatalog, SYNONYMS };
}

// -----------------------------------------------------------------------------
// 3. CONTROLADOR DE INTERFAZ DEL CATÁLOGO
// -----------------------------------------------------------------------------
const AppState = {
    currentCategory: '',
    selectedBrand: 'ALL',
    currentFilter: 'all',
    searchQuery: '',
    searchDebounceTimer: null
};

function initApp() {
    if (typeof catalogoData === 'undefined' || !catalogoData.length) {
        const grid = document.getElementById('product-grid');
        if (grid) {
            grid.innerHTML = `<div style="grid-column:1/-1;padding:3rem;text-align:center;color:#64748b;">
                Error cargando catálogo. Asegúrate de ejecutar <code>python actualizar_web.py</code>.
            </div>`;
        }
        return;
    }

    renderSidebarCategories();
    populateBrandFilter();
    setupEventListeners();
    handleHashRouting();

    // Categoría por defecto si no hay hash
    if (!window.location.hash && catalogoData.length > 0) {
        selectCategory(catalogoData[0].linea);
    }
}

function renderSidebarCategories() {
    const list = document.getElementById('category-list');
    if (!list) return;
    list.innerHTML = '';

    catalogoData.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-btn';
        btn.dataset.category = cat.linea;
        btn.setAttribute('aria-label', `Categoría ${cat.linea}`);
        btn.innerHTML = `
            <span>${cat.linea}</span>
            <span class="category-badge">${cat.productos.length}</span>
        `;
        btn.onclick = () => {
            AppState.searchQuery = '';
            const searchInput = document.getElementById('global-search');
            if (searchInput) searchInput.value = '';
            window.location.hash = `#/categoria/${encodeURIComponent(cat.linea)}`;
            selectCategory(cat.linea);
            document.getElementById('sidebar')?.classList.remove('open');
        };
        list.appendChild(btn);
    });
}

function populateBrandFilter() {
    const brandSelect = document.getElementById('brand-filter');
    if (!brandSelect) return;

    const brandSet = new Set();
    catalogoData.forEach(cat => {
        cat.productos.forEach(p => {
            const b = p.marca_normalizada || p.marca;
            if (b) brandSet.add(b);
        });
    });

    const sortedBrands = Array.from(brandSet).sort();
    brandSelect.innerHTML = '<option value="ALL">Todas las Marcas</option>';
    sortedBrands.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = b;
        brandSelect.appendChild(opt);
    });

    brandSelect.onchange = (e) => {
        AppState.selectedBrand = e.target.value;
        renderProductGrid();
    };
}

function selectCategory(lineaName) {
    AppState.currentCategory = lineaName;
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === lineaName);
    });
    renderProductGrid();
}

function renderProductGrid() {
    const grid = document.getElementById('product-grid');
    const titleEl = document.getElementById('current-category');
    const countEl = document.getElementById('category-count');
    if (!grid) return;

    grid.innerHTML = '';
    let items = [];

    if (AppState.searchQuery.trim() !== '') {
        if (titleEl) titleEl.textContent = `Resultados: "${AppState.searchQuery}"`;
        const searchResults = searchCatalog(catalogoData, AppState.searchQuery);
        items = searchResults.map(r => r.product);
    } else {
        const cat = catalogoData.find(c => c.linea === AppState.currentCategory);
        if (!cat) return;
        if (titleEl) titleEl.textContent = cat.linea;
        items = [...cat.productos];
    }

    // Filtro por marca
    if (AppState.selectedBrand !== 'ALL') {
        items = items.filter(p => (p.marca_normalizada || p.marca) === AppState.selectedBrand);
    }

    // Filtro por ficha / foto
    if (AppState.currentFilter === 'ficha') {
        items = items.filter(p => p.tiene_ficha);
    } else if (AppState.currentFilter === 'foto') {
        items = items.filter(p => p.tiene_imagen);
    }

    if (countEl) countEl.textContent = `${items.length} artículo(s) encontrado(s)`;

    if (items.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;padding:3rem;text-align:center;color:#64748b;">
                <h3>No se encontraron productos con estos criterios</h3>
                <p style="margin-top:0.5rem;font-size:0.9rem;">Prueba buscando otra palabra clave o selecciona otra categoría.</p>
            </div>`;
        return;
    }

    items.forEach(prod => {
        const card = document.createElement('div');
        card.className = 'card';

        const safeImg = prod.tiene_imagen
            ? `<img src="${prod.imagen_url}" alt="${prod.no_parte}" loading="lazy" onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'80\\' height=\\'80\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2394a3b8\\' stroke-width=\\'1.5\\'><rect width=\\'18\\' height=\\'18\\' x=\\'3\\' y=\\'3\\' rx=\\'2\\'/><circle cx=\\'9\\' cy=\\'9\\' r=\\'2\\'/><path d=\\'m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\\'/></svg>';">`
            : `<div class="no-img"><span>📷</span><span>Imagen en proceso</span></div>`;

        const btnFicha = prod.tiene_ficha
            ? `<a href="${prod.ficha_url}" class="btn-ficha" target="_blank" download aria-label="Descargar ficha técnica de ${prod.no_parte}">📄 Ficha Técnica</a>`
            : `<span class="btn-ficha btn-disabled">Sin Ficha</span>`;

        const inCart = window.CartState && window.CartState.items.some(i => i.no_parte === prod.no_parte);
        const addBtnText = inCart ? '✓ Agregado' : '+ Cotizar';
        const addBtnClass = inCart ? 'btn-add-quote added' : 'btn-add-quote';

        card.innerHTML = `
            <div class="card-img-container" data-action="view-detail" data-no-parte="${prod.no_parte}">
                ${safeImg}
            </div>
            <div class="card-body">
                <span class="brand-badge">${prod.marca_normalizada || prod.marca || 'BITMOVIL'}</span>
                <div class="part-number" data-action="view-detail" data-no-parte="${prod.no_parte}">${prod.no_parte}</div>
                <div class="desc">${prod.descripcion}</div>
                <div class="card-actions">
                    <button class="${addBtnClass}" data-action="add-cart" data-no-parte="${prod.no_parte}" aria-label="Agregar ${prod.no_parte} a cotización">
                        ${addBtnText}
                    </button>
                    <div class="btn-secondary-group">
                        ${btnFicha}
                        <button class="btn-ask-chat" data-action="ask-chat" data-no-parte="${prod.no_parte}" data-marca="${prod.marca}">
                            💬 Asesor
                        </button>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
// 4. DELEGACIÓN CENTRALIZADA DE EVENTOS Y HASH ROUTING
// -----------------------------------------------------------------------------
function setupEventListeners() {
    // Buscador con debounce de 250ms
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(AppState.searchDebounceTimer);
            AppState.searchDebounceTimer = setTimeout(() => {
                AppState.searchQuery = e.target.value.trim();
                renderProductGrid();
            }, 250);
        });
    }

    // Filtros de píldoras
    document.querySelectorAll('.pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            AppState.currentFilter = btn.dataset.filter;
            renderProductGrid();
        });
    });

    // Menú móvil
    document.getElementById('menu-btn')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('open');
    });

    // Delegación central de eventos en el grid
    const grid = document.getElementById('product-grid');
    if (grid) {
        grid.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            const noParte = target.dataset.noParte;

            if (action === 'add-cart') {
                if (window.CartService) {
                    window.CartService.addItem(noParte);
                    target.textContent = '✓ Agregado';
                    target.classList.add('added');
                }
            } else if (action === 'view-detail') {
                window.location.hash = `#/producto/${encodeURIComponent(noParte)}`;
            } else if (action === 'ask-chat') {
                if (window.ChatService) {
                    window.ChatService.askProduct(noParte, target.dataset.marca);
                }
            }
        });
    }

    // Modal de detalle
    window.addEventListener('hashchange', handleHashRouting);
}

function handleHashRouting() {
    const hash = window.location.hash;
    if (hash.startsWith('#/producto/')) {
        const model = decodeURIComponent(hash.replace('#/producto/', ''));
        showProductModal(model);
    } else if (hash.startsWith('#/categoria/')) {
        const catName = decodeURIComponent(hash.replace('#/categoria/', ''));
        selectCategory(catName);
    }
}

function showProductModal(modelName) {
    let found = null;
    catalogoData.forEach(cat => {
        cat.productos.forEach(p => {
            if (p.no_parte === modelName) found = { ...p, linea: cat.linea };
        });
    });

    const backdrop = document.getElementById('modal-backdrop');
    const content = document.getElementById('modal-content');
    if (!backdrop || !content) return;

    if (!found) {
        backdrop.classList.remove('active');
        return;
    }

    const safeImg = found.tiene_imagen
        ? `<img src="${found.imagen_url}" alt="${found.no_parte}" style="max-height:220px;object-fit:contain;margin:0 auto;display:block;">`
        : `<div class="no-img" style="height:120px;"><span>📷</span><span>Fotografía en proceso de actualización</span></div>`;

    content.innerHTML = `
        <button class="modal-close-btn" id="modal-close-x" aria-label="Cerrar ventana">&times;</button>
        <span class="brand-badge">${found.marca_normalizada || found.marca}</span>
        <h2 style="color:var(--primary);">${found.no_parte}</h2>
        <div style="font-size:0.85rem;color:var(--text-light);">${found.linea}</div>
        <div style="padding:1rem 0;">${safeImg}</div>
        <p style="font-size:0.95rem;line-height:1.5;">${found.descripcion}</p>
        <div style="display:flex;gap:0.75rem;margin-top:1rem;flex-wrap:wrap;">
            <button class="btn-add-quote" data-action="add-cart" data-no-parte="${found.no_parte}" style="flex:1;">
                + Agregar a Cotización
            </button>
            ${found.tiene_ficha ? `<a href="${found.ficha_url}" class="btn-ficha" target="_blank" download style="flex:1;">📄 Descargar Ficha Técnica</a>` : ''}
            <button class="btn-cart-secondary" onclick="navigator.clipboard.writeText(window.location.href);alert('Enlace directo copiado al portapapeles');" style="flex:1;">
                🔗 Copiar Enlace Directo
            </button>
        </div>
    `;

    backdrop.classList.add('active');
    document.getElementById('modal-close-x')?.addEventListener('click', closeProductModal);
    backdrop.onclick = (e) => {
        if (e.target === backdrop) closeProductModal();
    };
}

function closeProductModal() {
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.classList.remove('active');
    // Limpiar hash sin recargar
    history.pushState('', document.title, window.location.pathname + window.location.search);
}

// Iniciar en navegador
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', initApp);
}
