/**
 * BITMOVIL — Asistente Técnico en Cableado & Infraestructura TI
 * chat.js (Módulo de Chatbot Híbrido, Sanitización XSS y Fallback Seguro)
 */

const ChatState = {
    isOpen: false,
    history: [], // [{ role: 'user' | 'assistant', content: string }]
    isSending: false
};

// -----------------------------------------------------------------------------
// 1. SANITIZACIÓN ESTRICTA ANTI-XSS
// -----------------------------------------------------------------------------
function escapeHTML(str) {
    return String(str || '').replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

function formatBotReply(text) {
    // 1. Escapar estrictamente todo el contenido generado
    const safeText = escapeHTML(text);
    // 2. Convertir únicamente negritas controladas y saltos de línea
    return safeText
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

// -----------------------------------------------------------------------------
// 2. SERVICIO DEL CHAT Y DELEGACIÓN
// -----------------------------------------------------------------------------
const ChatService = {
    open() {
        const win = document.getElementById('chat-window');
        if (win) {
            win.style.display = 'flex';
            ChatState.isOpen = true;
            document.getElementById('chat-input')?.focus();
        }
    },

    close() {
        const win = document.getElementById('chat-window');
        if (win) {
            win.style.display = 'none';
            ChatState.isOpen = false;
        }
    },

    toggle() {
        if (ChatState.isOpen) this.close();
        else this.open();
    },

    askProduct(noParte, marca) {
        this.open();
        sendMessage(`¿Qué accesorios o especificaciones técnicas me recomiendan para el modelo ${marca} ${noParte}?`);
    }
};
window.ChatService = ChatService;

function appendMessage(text, sender = 'bot', isHTML = false) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const msg = document.createElement('div');
    msg.className = `message ${sender}-message`;

    if (sender === 'user') {
        msg.textContent = text; // Texto plano puro: Cero riesgo XSS
    } else {
        msg.innerHTML = isHTML ? text : formatBotReply(text);
    }

    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}

// -----------------------------------------------------------------------------
// 3. ENVÍO HÍBRIDO (PROXY REMOTO CON FALLBACK LOCAL SILENCIOSO)
// -----------------------------------------------------------------------------
async function sendMessage(userText) {
    const text = userText.trim();
    if (!text || ChatState.isSending) return;

    appendMessage(text, 'user');
    ChatState.isSending = true;

    // Obtener los 5 IDs más relevantes del catálogo mediante búsqueda local
    let topProductIds = [];
    if (typeof searchCatalog === 'function' && typeof catalogoData !== 'undefined') {
        const hits = searchCatalog(catalogoData, text);
        topProductIds = hits.slice(0, 5).map(h => h.product.no_parte);
    }

    // Si corre bajo file:/// (prueba local) usar motor local directamente
    const isLocalFile = window.location.protocol === 'file:';

    if (!isLocalFile) {
        const tempBotMsg = document.createElement('div');
        tempBotMsg.className = 'message bot-message temp-loading';
        tempBotMsg.innerHTML = '<em>Consultando a ingeniería Bitmovil...</em>';
        document.getElementById('chat-messages')?.appendChild(tempBotMsg);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);

            const res = await fetch('api/chat.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    message: text,
                    history: ChatState.history.slice(-6),
                    product_ids: topProductIds
                })
            });

            clearTimeout(timeoutId);
            tempBotMsg.remove();

            if (res.ok) {
                const data = await res.json();
                if (data.reply) {
                    appendMessage(data.reply, 'bot');
                    ChatState.history.push({ role: 'user', content: text });
                    ChatState.history.push({ role: 'assistant', content: data.reply });
                    ChatState.isSending = false;
                    return;
                }
            } else if (res.status === 429) {
                console.warn('Límite de consultas alcanzado. Conmutando a motor local.');
            }
        } catch (err) {
            tempBotMsg.remove();
            console.warn('Proxy PHP no disponible o tiempo agotado. Conmutando a motor local:', err);
        }
    }

    // -------------------------------------------------------------------------
    // MOTOR LOCAL INTELIGENTE (REGLAS DE INGENIERÍA Y PRODUCTOS REALES)
    // -------------------------------------------------------------------------
    setTimeout(() => {
        const localReply = generarRespuestaLocal(text, topProductIds);
        appendMessage(localReply, 'bot', true);
        ChatState.history.push({ role: 'user', content: text });
        ChatState.history.push({ role: 'assistant', content: localReply.replace(/<[^>]+>/g, '') });
        ChatState.isSending = false;
    }, 350);
}

// -----------------------------------------------------------------------------
// 4. MOTOR LOCAL CON LÍMITES DE PALABRA (\b)
// -----------------------------------------------------------------------------
function generarRespuestaLocal(query, topProductIds) {
    const q = query.toLowerCase();

    // Límites de palabra para evitar falsos positivos con 'solución' o 'categoría'
    const isOutdoor = /\b(sol|exterior|intemperie|subterraneo|uv)\b/i.test(q);
    const isCat6 = /\b(cat6|cat6a|categoria\s*6)\b/i.test(q);
    const isDistance = /\b(distancia|metros?|largo|longitud|alcance)\b/i.test(q);
    const isPoE = /\b(switch|poe|conmutador|watts|potencia)\b/i.test(q);

    let respuesta = "";

    if (isDistance) {
        respuesta = `<strong>Norma TIA/EIA-568 para Enlaces Horizontales:</strong><br>
        El estándar estipula un límite máximo de <strong>90 metros</strong> para el cableado sólido horizontal más <strong>10 metros</strong> totales de patch cords (100 m de canal).<br>
        💡 <em>Para distancias mayores a 100 metros:</em> Se recomienda instalar un enlace de <strong>Fibra Óptica</strong> o un extensor de red con alimentación PoE.`;
    } else if (isOutdoor) {
        respuesta = `<strong>Criterio Técnico para Cableado Exterior:</strong><br>
        En exteriores o tuberías expuestas al sol y condensación, es indispensable usar cable con chaqueta <strong>UV-Proof / CMX</strong> y compuesto anti-humedad (Gel/Tape). Nunca uses cable interior (CMR/CMP) en intemperie para evitar degradación y daños a los puertos PoE.`;
    } else if (isCat6) {
        respuesta = `<strong>Criterio Cat6 vs Cat6A:</strong><br>
        • <strong>Cat6:</strong> Óptimo para 1 Gbps hasta 90 m, y 10 Gbps hasta 37-55 m.<br>
        • <strong>Cat6A:</strong> Garantiza 10 Gbps a los 100 m completos con mayor blindaje contra diafonía foránea, recomendado para access points Wi-Fi 6/7 y switches multi-gigabit.`;
    } else if (isPoE) {
        respuesta = `<strong>Presupuesto de Potencia PoE:</strong><br>
        Verifica el estándar requerido por tus dispositivos:<br>
        • <strong>802.3af (PoE):</strong> Hasta 15.4W (cámaras fijas básicas, teléfonos IP).<br>
        • <strong>802.3at (PoE+):</strong> Hasta 30W (cámaras con luz blanca, lectores biométricos).<br>
        • <strong>802.3bt (Hi-PoE):</strong> Hasta 60-90W (cámaras PTZ con calentador, pantallas).`;
    } else {
        respuesta = `<strong>Ingeniería y Soporte BITMOVIL:</strong><br>
        En BITMOVIL diseñamos infraestructuras certificadas cumpliendo las normas TIA/EIA: cable 100% Cobre certificado, canalizaciones con charola tipo malla y cálculo de potencia respaldado.`;
    }

    // Agregar hasta 2 productos relevantes si existen
    if (topProductIds && topProductIds.length > 0 && typeof catalogoData !== 'undefined') {
        let sugeridos = [];
        catalogoData.forEach(c => {
            c.productos.forEach(p => {
                if (topProductIds.includes(p.no_parte) && sugeridos.length < 2) {
                    sugeridos.push(p);
                }
            });
        });

        if (sugeridos.length > 0) {
            respuesta += `<br><br><strong>Productos sugeridos en nuestro catálogo:</strong>`;
            sugeridos.forEach(s => {
                respuesta += `
                    <div class="chat-rec-card">
                        <div class="chat-rec-title">${escapeHTML(s.marca)} — ${escapeHTML(s.no_parte)}</div>
                        <div>${escapeHTML(s.descripcion.substring(0, 85))}...</div>
                    </div>
                `;
            });
        }
    }

    respuesta += `<br><small style="color:#64748b;">¿Requieres levantamiento o cotización formal? Escríbenos directamente o consulta nuestro <a href="https://bitmovil.mx/aviso-de-privacidad" target="_blank" style="color:var(--accent);">Aviso de Privacidad</a>.</small>`;

    return respuesta;
}

// Inicializar eventos de chat
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        document.getElementById('chat-toggle-btn')?.addEventListener('click', () => ChatService.toggle());
        document.getElementById('chat-close-btn')?.addEventListener('click', () => ChatService.close());

        document.getElementById('chat-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('chat-input');
            const val = input ? input.value : '';
            if (val.trim()) {
                input.value = '';
                sendMessage(val);
            }
        });

        // Píldoras rápidas
        document.querySelectorAll('.chat-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const text = pill.dataset.prompt || pill.textContent;
                sendMessage(text);
            });
        });
    });
}
