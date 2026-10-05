/**
 * BITMOVIL — Cotizador Comercial B2B
 * cart.js (Módulo de carrito y envío de cotizaciones a WhatsApp / Email)
 */

window.BITMOVIL_CONFIG = window.BITMOVIL_CONFIG || {};
window.BITMOVIL_CONFIG.contact = {
    whatsapp: "528332272527", // Número corporativo oficial de bitmovil.mx
    email: "ventas@bitmovil.mx"
};

const CartState = {
    items: [], // Array de { no_parte, marca, descripcion, qty }
    isOpen: false,
    focusedBeforeOpen: null
};
window.CartState = CartState;

// -----------------------------------------------------------------------------
// 1. PERSISTENCIA SEGURA EN LOCALSTORAGE (PROTEGIDO CON TRY/CATCH)
// -----------------------------------------------------------------------------
const STORAGE_KEY = 'bitmovil_quote_cart_v1';

function loadCartFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            CartState.items = JSON.parse(raw) || [];
        }
    } catch (e) {
        console.warn('Almacenamiento local restringido o no disponible. Usando memoria de sesión.');
        CartState.items = [];
    }
}

function saveCartToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(CartState.items));
    } catch (e) {
        console.warn('No se pudo guardar el carrito en almacenamiento local.');
    }
}

// -----------------------------------------------------------------------------
// 2. SERVICIO DE GESTIÓN DEL CARRITO
// -----------------------------------------------------------------------------
const CartService = {
    addItem(noParte, qty = 1) {
        let foundProduct = null;
        if (typeof catalogoData !== 'undefined') {
            for (const cat of catalogoData) {
                for (const p of cat.productos) {
                    if (p.no_parte === noParte) {
                        foundProduct = p;
                        break;
                    }
                }
                if (foundProduct) break;
            }
        }

        const existing = CartState.items.find(i => i.no_parte === noParte);
        if (existing) {
            existing.qty += qty;
        } else {
            CartState.items.push({
                no_parte: noParte,
                marca: foundProduct?.marca_normalizada || foundProduct?.marca || 'BITMOVIL',
                descripcion: foundProduct?.descripcion || '',
                qty: Math.max(1, qty)
            });
        }

        saveCartToStorage();
        updateCartBadge();
        renderCartDrawer();

        // Telemetría para Google Tag Manager
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            event: 'add_to_cart',
            ecommerce: {
                items: [{
                    item_id: noParte,
                    item_name: foundProduct?.descripcion?.substring(0, 50) || noParte,
                    item_brand: foundProduct?.marca || 'BITMOVIL',
                    quantity: qty
                }]
            }
        });
    },

    removeItem(noParte) {
        CartState.items = CartState.items.filter(i => i.no_parte !== noParte);
        saveCartToStorage();
        updateCartBadge();
        renderCartDrawer();
    },

    updateQty(noParte, newQty) {
        const item = CartState.items.find(i => i.no_parte === noParte);
        if (item) {
            item.qty = Math.max(1, newQty);
            saveCartToStorage();
            updateCartBadge();
            renderCartDrawer();
        }
    },

    clearCart() {
        CartState.items = [];
        saveCartToStorage();
        updateCartBadge();
        renderCartDrawer();
    }
};
window.CartService = CartService;

function updateCartBadge() {
    const badge = document.getElementById('cart-badge');
    const totalCount = CartState.items.reduce((acc, cur) => acc + cur.qty, 0);
    if (badge) {
        badge.textContent = totalCount;
        badge.style.display = totalCount > 0 ? 'inline-block' : 'none';
    }
}

// -----------------------------------------------------------------------------
// 3. RENDERIZADO DEL DRAWER DE COTIZACIÓN
// -----------------------------------------------------------------------------
function renderCartDrawer() {
    const container = document.getElementById('cart-items-container');
    const totalCountEl = document.getElementById('drawer-items-count');
    if (!container) return;

    const totalCount = CartState.items.reduce((acc, cur) => acc + cur.qty, 0);
    if (totalCountEl) totalCountEl.textContent = `(${totalCount})`;

    if (CartState.items.length === 0) {
        container.innerHTML = `
            <div style="padding:3rem 1rem;text-align:center;color:#64748b;">
                <div style="font-size:2.5rem;margin-bottom:0.5rem;">📋</div>
                <div style="font-weight:600;">Tu cotización está vacía</div>
                <p style="font-size:0.85rem;margin-top:0.3rem;">Explora el catálogo y agrega productos para solicitar tu cotización formal.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    CartState.items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
            <div class="cart-item-info">
                <div class="cart-item-part">${item.no_parte}</div>
                <div class="cart-item-desc">${item.marca} — ${item.descripcion}</div>
            </div>
            <div class="cart-qty-controls">
                <button class="qty-btn" data-action="dec" data-id="${item.no_parte}" aria-label="Disminuir cantidad">-</button>
                <span class="qty-num">${item.qty}</span>
                <button class="qty-btn" data-action="inc" data-id="${item.no_parte}" aria-label="Aumentar cantidad">+</button>
                <button class="qty-btn" data-action="del" data-id="${item.no_parte}" style="color:#ef4444;margin-left:0.3rem;" aria-label="Eliminar producto">&times;</button>
            </div>
        `;
        container.appendChild(row);
    });

    // Escuchar controles de cantidad
    container.querySelectorAll('.qty-btn').forEach(btn => {
        btn.onclick = () => {
            const act = btn.dataset.action;
            const id = btn.dataset.id;
            const it = CartState.items.find(i => i.no_parte === id);
            if (!it) return;

            if (act === 'inc') CartService.updateQty(id, it.qty + 1);
            if (act === 'dec') it.qty > 1 ? CartService.updateQty(id, it.qty - 1) : CartService.removeItem(id);
            if (act === 'del') CartService.removeItem(id);
        };
    });
}

// -----------------------------------------------------------------------------
// 4. FOCUS TRAP ACCESIBLE Y APERTURA/CIERRE DEL DRAWER
// -----------------------------------------------------------------------------
function openCartDrawer() {
    const backdrop = document.getElementById('drawer-backdrop');
    const drawer = document.getElementById('cart-drawer');
    if (!backdrop || !drawer) return;

    CartState.focusedBeforeOpen = document.activeElement;
    CartState.isOpen = true;

    backdrop.classList.add('active');
    drawer.classList.add('active');

    // Foco en el botón de cerrar
    const closeBtn = document.getElementById('drawer-close-btn');
    if (closeBtn) closeBtn.focus();

    document.addEventListener('keydown', handleDrawerKeydown);
}

function closeCartDrawer() {
    const backdrop = document.getElementById('drawer-backdrop');
    const drawer = document.getElementById('cart-drawer');
    if (!backdrop || !drawer) return;

    CartState.isOpen = false;
    backdrop.classList.remove('active');
    drawer.classList.remove('active');

    document.removeEventListener('keydown', handleDrawerKeydown);

    if (CartState.focusedBeforeOpen && typeof CartState.focusedBeforeOpen.focus === 'function') {
        CartState.focusedBeforeOpen.focus();
    }
}

function handleDrawerKeydown(e) {
    if (e.key === 'Escape') {
        closeCartDrawer();
        return;
    }

    if (e.key === 'Tab') {
        const drawer = document.getElementById('cart-drawer');
        const focusable = drawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === first) {
                last.focus();
                e.preventDefault();
            }
        } else {
            if (document.activeElement === last) {
                first.focus();
                e.preventDefault();
            }
        }
    }
}

// -----------------------------------------------------------------------------
// 5. ENVÍO COMERCIAL (WHATSAPP, EMAIL, CSV Y PORTAPAPELES)
// -----------------------------------------------------------------------------
function buildQuoteText(cliente, empresa, maxLimit = 1800) {
    const header = `Hola BITMOVIL, solicito cotización para ${cliente || 'mi empresa'} (${empresa || 'Cliente'})`;
    let body = "\n\nProductos solicitados:\n";

    let truncated = false;
    let includedCount = 0;

    for (let i = 0; i < CartState.items.length; i++) {
        const it = CartState.items[i];
        const line = `• ${it.qty}x [${it.no_parte}] ${it.marca} - ${it.descripcion.substring(0, 40)}\n`;
        
        if ((header + body + line).length > maxLimit) {
            truncated = true;
            break;
        }
        body += line;
        includedCount++;
    }

    if (truncated) {
        body += `\n... (+ ${CartState.items.length - includedCount} artículos adicionales. Te envío la lista completa en cuanto me indiquen).\n`;
    }

    const footer = "\nQuedo atento a precios, existencias y tiempo de entrega en Tampico/Zona Golfo.";
    return {
        fullText: header + body + footer,
        isTruncated: truncated
    };
}

function sendToWhatsApp() {
    if (CartState.items.length === 0) {
        alert('Por favor agrega al menos un producto a la cotización.');
        return;
    }

    const nameInput = document.getElementById('client-name');
    const companyInput = document.getElementById('client-company');
    const cliente = nameInput ? nameInput.value.trim() : '';
    const empresa = companyInput ? companyInput.value.trim() : '';

    const { fullText, isTruncated } = buildQuoteText(cliente, empresa, 1800);
    const phone = window.BITMOVIL_CONFIG.contact.whatsapp;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(fullText)}`;

    if (isTruncated) {
        const notifyEl = document.getElementById('cart-limit-notice');
        if (notifyEl) notifyEl.style.display = 'block';
    }

    // Telemetría GTM
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
        event: 'whatsapp_click',
        quote_items_count: CartState.items.length
    });

    window.open(url, '_blank');
}

function copyCartToClipboard() {
    let text = "SOLICITUD DE COTIZACIÓN — BITMOVIL\n\n";
    CartState.items.forEach(it => {
        text += `${it.qty}\t${it.no_parte}\t${it.marca}\t${it.descripcion}\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
        alert('✓ Lista completa de cotización copiada al portapapeles.');
    }).catch(() => {
        alert('No se pudo copiar automáticamente. Por favor descarga el archivo CSV.');
    });
}

function downloadCartCSV() {
    let csv = "Cantidad,Numero_de_Parte,Marca,Descripcion\n";
    CartState.items.forEach(it => {
        const safeDesc = `"${it.descripcion.replace(/"/g, '""')}"`;
        csv += `${it.qty},"${it.no_parte}","${it.marca}",${safeDesc}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cotizacion_bitmovil_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Iniciar módulo de carrito
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        loadCartFromStorage();
        updateCartBadge();
        renderCartDrawer();

        document.getElementById('header-cart-btn')?.addEventListener('click', openCartDrawer);
        document.getElementById('drawer-close-btn')?.addEventListener('click', closeCartDrawer);
        document.getElementById('drawer-backdrop')?.addEventListener('click', closeCartDrawer);

        document.getElementById('btn-whatsapp-send')?.addEventListener('click', sendToWhatsApp);
        document.getElementById('btn-copy-quote')?.addEventListener('click', copyCartToClipboard);
        document.getElementById('btn-csv-quote')?.addEventListener('click', downloadCartCSV);
    });
}
