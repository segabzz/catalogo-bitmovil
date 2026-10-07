# CLAUDE.md — Prompt Maestro y Guía de Arquitectura para Claude Code

> **Para Claude Code / AI Agents:** Al abrir este repositorio, tu misión es asistir al equipo de BITMOVIL a mantener, expandir o desplegar el **Catálogo Web Interactivo B2B (V4)**.
> Sigue las directrices, scripts y configuraciones de arquitectura segura descritas en este documento.

---

## 1. Arquitectura V4 (Producción B2B)

El catálogo ha evolucionado a una aplicación B2B segura, optimizada para SEO y con un Asistente Experto (RAG Seguro):

- **Frontend:** Vanilla JS (`app.js`, `cart.js`, `chat.js`), modularizado. Búsqueda multi-token con sinónimos y sistema de scoring. Cotizador exportable a CSV y WhatsApp. El enrutamiento se maneja vía Hash (SPA).
- **Backend (Proxy Seguro):** Las llamadas al LLM (Anthropic) pasan por un proxy PHP en `web/api/chat.php`. Esto oculta la API Key, previene el abuso de tokens, aplica rate-limiting (HMAC-SHA256 por IP) y mantiene el Prompt Maestro en el servidor.
- **RAG Seguro:** El cliente no envía el catálogo al LLM. El cliente realiza una búsqueda local y envía al PHP los mejores 5 `product_ids`. El PHP valida estos IDs contra `datos.json`, obtiene las descripciones y construye el contexto, impidiendo inyecciones de contexto arbitrario.
- **Generación Estática y SEO:** `actualizar_web.py` lee el Excel maestro y genera archivos estáticos `/p/{modelo}.html`. Aplica reglas Anti-Thin Content: si el producto no tiene foto ni ficha, se le asigna `noindex` y se excluye del `sitemap.xml`. También inyecta *cache-busting* idempotente (`?v=hash`) en todos los assets de `index.html`.
- **Integración Syscom (OAuth2):** `sync_mcp_syscom.py` utiliza el flujo `client_credentials` oficial de la API de Syscom para descargas masivas de imágenes y fichas técnicas detectando el MIME type real.

---

## 2. Guía de Configuración y Secretos

### A. Archivos de Entorno (.env)
El sistema utiliza dos archivos separados para mayor seguridad:

1. `config.env` (Raíz del proyecto): Usado por los scripts de Python.
   ```env
   SYSCOM_CLIENT_ID=tu_client_id_oauth
   SYSCOM_CLIENT_SECRET=tu_client_secret_oauth
   ```

2. `secrets.env` (Producción PHP): Contiene la API Key de Anthropic. **CRÍTICO:** En producción, este archivo debe alojarse fuera de `public_html` (ej. `~/secrets/bitmovil.env`) o estar estrictamente protegido por `.htaccess`.
   ```env
   ANTHROPIC_API_KEY=sk-ant-api03-...
   LLM_MODEL=claude-haiku-4-5-20251001
   MAX_TOKENS=800
   ```
   *Nota: Se recomienda configurar la ruta real de `secrets.env` modificando `web/api/chat.php`.*

### B. Pruebas y Validación (Node.js)
El algoritmo de búsqueda y scoring está cubierto por pruebas unitarias al 100%.
Para ejecutarlas:
```bash
node tests/test_search.js
```

---

## 3. Comandos Útiles

```bash
# 1. Sincronizar catálogo con API Syscom (Descarga fotos y fichas)
python sync_mcp_syscom.py

# 2. Generar base de datos web, páginas SEO estáticas y aplicar cache-busting
python actualizar_web.py

# 3. Correr pruebas unitarias del buscador JS
node tests/test_search.js
```

---

## 4. Guía de Despliegue en Servidor (cPanel / Apache)

1. En cPanel, configura un subdominio (ej. `catalogo.bitmovil.mx`) apuntando a una carpeta (ej. `public_html/catalogo`).
2. Sube **únicamente** el contenido de la carpeta `web/` a esa ruta.
3. El archivo `web/.htaccess` incluido redirigirá tráfico, habilitará caché para recursos estáticos y denegará el acceso web a las carpetas `api/cache` y el archivo `api/secrets.env` (si decides dejar este último dentro de la carpeta `web/api/`).
4. **Mejor Práctica de Seguridad:** Ubica `secrets.env` en `~/secrets/bitmovil.env` (un nivel arriba de `public_html`), edita `web/api/chat.php` para apuntar a esa ruta absoluta y ubica la carpeta `cache/` también fuera del acceso web.
5. Ejecuta `actualizar_web.py` localmente antes de subir los cambios para asegurar que el `sitemap.xml`, `datos.js`, `datos.json` y los HTML estáticos estén actualizados y con su *hash* correspondiente.

---

## 5. El Asistente Experto en Cableado (Prompt en PHP)

El **System Prompt oficial** ya no reside en JavaScript; está integrado en `web/api/chat.php`. 
Este sistema garantiza que el modelo `claude-haiku-4-5-20251001` asuma el rol de **"Asesor Técnico Especialista de BITMOVIL"**. Sus principales directrices, forzadas desde el backend, incluyen:
- Recomendar **solo cobre 100%** (no CCA) y respetar la regla de 90m + 10m.
- Evaluar uso exterior, chaquetas UV, presupuestos PoE y canalizaciones adecuadas.
- Recomendar **estrictamente** los productos reales disponibles en el catálogo de Bitmovil basándose en los `product_ids` enviados por la búsqueda local del cliente.
