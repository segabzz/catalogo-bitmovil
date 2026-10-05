# Catálogo Digital de Soluciones TI & Asesor Inteligente — BITMOVIL

Bienvenido al repositorio oficial del **Catálogo Web y Portafolio de Productos de [BITMOVIL](https://bitmovil.mx/)**. 

Esta solución fue desarrollada como una aplicación web interactiva ultra-ligera (estática, sin dependencias pesadas de backend) para mostrar la oferta completa de infraestructura de telecomunicaciones, cableado estructurado, videovigilancia, redes y energía a clientes corporativos y de alto perfil.

---

## 🌟 Características Principales

- **🔍 Buscador en Tiempo Real:** Filtrado instantáneo en más de 150 productos por número de parte, marca (Hikvision, Telox, Charofil, Panduit, etc.) o palabras clave en la descripción.
- **💬 Asesor Técnico en Cableado & TI (Widget de Chat):** 
  - Asistente virtual consultor especializado en normativas de cableado (TIA/EIA-568, regla de 90m, cobre 100% vs CCA, chaquetas UV/exterior, cálculo de PoE 802.3af/at/bt).
  - Diagnostica necesidades del cliente y sugiere productos específicos del portafolio.
  - **Doble Modo:** Funciona localmente mediante un motor de reglas inteligente o conectándose al endpoint del LLM del administrador mediante `web/llm_config.js`.
- **📄 Gestión Automática de Fichas Técnicas:** Detección de PDFs de especificaciones oficiales con botones interactivos de descarga por producto.
- **🤖 Automatización con Claude Code (`CLAUDE.md`):** Incluye un **Prompt Maestro** en la raíz para que Claude Code configure credenciales, ejecute sincronizaciones y guíe el despliegue con un solo comando.
- **🔄 Conector Plug & Play para MCP de Syscom (`sync_mcp_syscom.py`):** Script para descarga masiva de fotografías oficiales en alta resolución y fichas técnicas en PDF.
- **📱 100% Responsivo:** Optimizado para computadoras, tablets y teléfonos móviles.

---

## 📁 Estructura del Repositorio

```text
PORTAFOLIO_WEB/
├── CLAUDE.md                      # Prompt Maestro y guía ejecutiva para Claude Code
├── README.md                      # Documentación general del repositorio
├── .gitignore                     # Exclusión de logs y archivos temporales
├── config.env                     # Credenciales del MCP de Syscom y LLM
├── actualizar_web.py              # Genera datos.js y datos.json desde el Excel
├── sync_mcp_syscom.py             # Sincronizador de fotos y fichas con el MCP de Syscom
├── Portafolio_Articulos_por_Linea.xlsx # Base de datos maestra en Excel
│
└── web/                           # CARPETA DE DESPLIEGUE (Subdominio web)
    ├── index.html                 # Aplicación web principal con buscador y chatbot
    ├── datos.js                   # Base de datos inyectada (solución CORS para local)
    ├── datos.json                 # Respaldo en formato JSON estándar
    ├── llm_config.js              # Configuración del endpoint LLM para el chat
    ├── .htaccess                  # Compresión Gzip y headers de caché para Apache/cPanel
    ├── imagenes/                  # Fotografías de productos ({No_Parte}.[png|jpg|avif])
    └── fichas_tecnicas/           # Fichas técnicas oficiales en PDF ({No_Parte}.pdf)
```

---

## 🚀 Inicio Rápido (Uso Local)

### 1. Visualizar el Catálogo
Simplemente abre el archivo en tu navegador web (no requiere servidor local):
```text
PORTAFOLIO_WEB/web/index.html
```

### 2. Actualizar el Catálogo desde el Excel
Si agregas nuevos productos, marcas o líneas en `Portafolio_Articulos_por_Linea.xlsx`, ejecuta:
```bash
python actualizar_web.py
```
El script procesará los cambios, normalizará los nombres de archivo y actualizará `web/datos.js` automáticamente.

### 3. Sincronizar Recursos con el MCP de Syscom
Para descargar fotos y fichas técnicas pendientes desde el servicio de Syscom:
1. Configura tus credenciales en `config.env`:
   ```env
   SYSCOM_MCP_ENDPOINT=https://tu-mcp-syscom.bitmovil.mx/api/v1
   SYSCOM_MCP_API_KEY=tu_token_aqui
   ```
2. Ejecuta la sincronización:
   ```bash
   python sync_mcp_syscom.py
   ```
   *(Para probar sin descargar, usa `python sync_mcp_syscom.py --dry-run`).*

---

## 🌐 Despliegue en Subdominio (`catalogo.bitmovil.mx`)

Para publicar el catálogo en internet como subdominio oficial de BITMOVIL:
1. Sube **exclusivamente el contenido de la carpeta `web/`** al directorio raíz de tu subdominio (ej. en cPanel `public_html/catalogo` o en tu servidor Nginx).
2. El archivo `.htaccess` preconfigurado optimizará automáticamente los tiempos de respuesta habilitando compresión GZIP y caché de recursos por 30 días.
3. *Para más detalles de despliegue con Nginx o Vercel, consulta el archivo [CLAUDE.md](CLAUDE.md).*

---

## 🛠️ Tecnologías Utilizadas

- **Frontend:** HTML5 semántico, CSS3 Flexbox/Grid, Vanilla JavaScript ES6+.
- **Backend / Automatización:** Python 3.10+, Pandas, OpenPyXL, Pillow (soporte AVIF).
- **Asistente Virtual:** Motor híbrido (Reglas de ingeniería TIA/EIA-568 + conector API LLM).
- **Agentes de IA:** Soporte nativo para Claude Code vía `CLAUDE.md`.

---

© 2026 **[BITMOVIL](https://bitmovil.mx/)** — Todos los derechos reservados.
