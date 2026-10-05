# CLAUDE.md — Prompt Maestro y Guía de Arquitectura para Claude Code

> **Para Claude Code:** Al abrir este repositorio, tu misión es asistir al administrador de BITMOVIL a dejar el **Catálogo Web Interactivo** 100% operativo, sincronizado con su **MCP de Syscom** y desplegado en el subdominio de `bitmovil.mx`.
> Sigue las directrices, scripts y configuraciones descritas en este documento.

---

## 1. Visión General del Proyecto
Este proyecto es el **Catálogo y Portafolio de Productos Digital de BITMOVIL**, diseñado para clientes finales y corporativos:
- **Tecnología:** Aplicación web estática ultra-ligera (HTML5, CSS3 moderno, Vanilla JS). No requiere frameworks pesados ni dependencias de backend obligatorias; puede alojarse en cualquier servidor web o CDN en 1 minuto.
- **Base de Datos:** El archivo maestro es `Portafolio_Articulos_por_Linea.xlsx`. El script `actualizar_web.py` procesa el Excel y genera `web/datos.js` y `web/datos.json`.
- **Evasión de CORS:** Los datos se inyectan mediante `datos.js` como variable global `catalogoData` para que el catálogo funcione tanto abriéndolo directamente en local (`file:///`) como en un servidor web (`https://catalogo.bitmovil.mx`).
- **Recursos Locales:** 
  - Fotografías: `web/imagenes/{No_de_Parte_Normalizado}.[png|jpg|avif|webp]`
  - Fichas Técnicas PDF: `web/fichas_tecnicas/{No_de_Parte_Normalizado}.pdf`
  - *Regla de nombres:* Los números de parte que contengan diagonales `/` se normalizan sustituyendo `/` por guión medio `-` (ej. `DS-MCW409/SE` -> `DS-MCW409-SE`).

---

## 2. Tareas Clave para Claude Code (Guía de Ejecución Rápida)

Cuando el usuario te pida sincronizar o configurar el proyecto, ejecuta estos pasos:

### Tarea A: Conectar el MCP de Syscom del Administrador
1. Verifica el archivo `config.env` en la raíz de `PORTAFOLIO_WEB/`.
2. Solicita al administrador el **Endpoint** y **API Key/Token** de su servidor MCP / servicio de Syscom y actualiza `config.env`:
   ```env
   SYSCOM_MCP_ENDPOINT=https://tu-mcp-syscom.bitmovil.mx/api/v1
   SYSCOM_MCP_API_KEY=tu_token_aqui
   DOWNLOAD_IMAGES=true
   DOWNLOAD_DATASHEETS=true
   ```
3. Ejecuta la sincronización masiva con:
   ```bash
   python sync_mcp_syscom.py
   ```
   *Nota: Puedes hacer una prueba previa con `python sync_mcp_syscom.py --dry-run`.*
4. El script descargará automáticamente las fotos oficiales y fichas técnicas PDF en `web/imagenes/` y `web/fichas_tecnicas/`, e inmediatamente correrá `actualizar_web.py` para refrescar `datos.js`.

---

### Tarea B: Conectar el LLM para el Asistente Experto en Cableado
En `web/llm_config.js` reside la configuración del widget de chat. 
Si el administrador cuenta con una API de LLM (OpenAI, Anthropic, Ollama o microservicio propio), configúrala en:
```javascript
window.BITMOVIL_LLM_CONFIG = {
    enabled: true, // Cambiar a true cuando se conecte el LLM
    endpoint: "https://api.tu-servidor.com/v1/chat/completions",
    apiKey: "Bearer TU_TOKEN",
    model: "claude-3-5-sonnet-20241022", // o el modelo configurado
};
```
*(Si `enabled: false`, el chat funciona en **Modo Local Inteligente**, diagnosticando problemas comunes de cableado y filtrando productos del catálogo sin costo de API).*

---

## 3. Prompt de Entrenamiento del Asistente Experto en Cableado Estructurado
Este es el **System Prompt oficial** que debe utilizarse cuando se conecte el LLM al widget de chat o en cualquier backend de IA de BITMOVIL:

```text
Eres el "Asesor Técnico Especialista de BITMOVIL", un ingeniero consultor experto en:
1. Cableado Estructurado (Cobre Cat5e, Cat6, Cat6A, Cat7 y Fibra Óptica Monomodo/Multimodo).
2. Infraestructura de Redes y Telecomunicaciones (Racks, Patch Panels, PDU, Switches PoE, Routers Fortinet/Cisco).
3. Sistemas de Seguridad Electrónica (CCTV IP, Control de Acceso, Radiocomunicación).

Tu misión:
- Recibir la problemática o requerimiento planteado por el cliente en lenguaje natural (ej. "Tengo una bodega de 120 metros y las cámaras se desconectan", "Requiero certificar 40 nodos de voz y datos").
- Diagnosticar técnicamente la necesidad aplicando estándares y buenas prácticas internacionales (TIA/EIA-568, ISO/IEC 11801):
  * Regla de los 90 metros en cobre horizontal + 10m de patch cords.
  * Uso de cable 100% Cobre vs Aleación (CCA) — BITMOVIL solo promueve 100% cobre para certificación y PoE.
  * Chaqueta adecuada: CMR (Riser interior), CMP (Plenum), CMX o con protección UV y gel antihumedad para exteriores/tubería subterránea.
  * Presupuesto de potencia PoE (802.3af 15.4W, 802.3at PoE+ 30W, 802.3bt Hi-PoE 60-90W).
  * Canalización (charola tipo malla charofil, tubería conduit pared gruesa o delgada).
- Proponer una arquitectura de solución clara en 3 pasos:
  1. Diagnóstico / Criterio Técnico.
  2. Lista sugerida de componentes (Cable, conectores, patch panels, organizadores, switch, cámaras).
  3. Invitación a contactar a los ingenieros de BITMOVIL para levantamiento en sitio o cotización formal.
- Tono: Altamente profesional, empático, consultivo, conciso y orientado a solucionar sin tecnicismos innecesarios que confundan al cliente.
```

---

## 4. Guía de Despliegue en Subdominio (`catalogo.bitmovil.mx`)

El contenido a publicar es **únicamente el contenido de la carpeta `web/`**:
```text
web/
├── index.html          <-- Página principal con buscador y chat
├── datos.js            <-- Base de datos de productos
├── llm_config.js       <-- Configuración del chat LLM
├── imagenes/           <-- Fotos de productos
└── fichas_tecnicas/    <-- PDFs de fichas técnicas
```

### Opciones de Despliegue:

#### Opción 1: cPanel / Apache (Hosting tradicional de Bitmovil)
1. En cPanel, ir a **Subdominios** y crear `catalogo.bitmovil.mx`.
2. Definir la raíz de documentos (ej. `public_html/catalogo`).
3. Subir el contenido de la carpeta `web/` a esa ruta.
4. El archivo `.htaccess` incluido se encargará de habilitar compresión Gzip y caché.

#### Opción 2: Nginx (VPS o Servidor Propio)
```nginx
server {
    listen 80;
    server_name catalogo.bitmovil.mx;
    root /var/www/catalogo_bitmovil/web;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache para imágenes y PDFs
    location ~* \.(jpg|jpeg|png|avif|webp|pdf)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
```

#### Opción 3: Vercel / Cloudflare Pages / Netlify (Gratuito y Ultra Rápido)
1. Conectar el repositorio de Git o subir la carpeta `web/`.
2. Root directory: `web/` (o la raíz si se publica directo).
3. Añadir el dominio personalizado `catalogo.bitmovil.mx` en el panel de Cloudflare o Vercel.

---

## 5. Estructura de Comandos Útiles

```bash
# Regenerar la base de datos web a partir del Excel:
python actualizar_web.py

# Sincronizar imágenes y fichas técnicas con el MCP de Syscom:
python sync_mcp_syscom.py

# Modo simulador (dry-run) sin descargar archivos:
python sync_mcp_syscom.py --dry-run
```
