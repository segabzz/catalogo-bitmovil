// ==============================================================================
// CONFIGURACIÓN DEL ASISTENTE EXPERTO EN CABLEADO Y TI (BITMOVIL)
// ==============================================================================
// Para el Administrador:
// - Si 'enabled' es false, el widget opera en 'Modo Local Inteligente', respondiendo
//   consultas comunes de infraestructura y recomendando productos del catálogo sin costo.
// - Si 'enabled' es true, el widget enviará las preguntas a tu endpoint de LLM.
// ==============================================================================

window.BITMOVIL_LLM_CONFIG = {
    // Activa la conexión con tu LLM externo
    enabled: false,

    // URL de tu endpoint de completado de chat (compatible con OpenAI/Anthropic/Proxy)
    // Ejemplo: "https://api.tu-servidor.com/v1/chat/completions"
    endpoint: "https://api.tu-servidor.com/v1/chat/completions",

    // Token o API Key de autorización
    apiKey: "Bearer TU_TOKEN_AQUI",

    // Identificador del modelo
    model: "claude-3-5-sonnet-20241022",

    // Rol o prompt del sistema configurado para el asistente
    systemPrompt: `Eres el "Asesor Técnico Especialista de BITMOVIL", un ingeniero consultor experto en Cableado Estructurado, Infraestructura de Redes y Telecomunicaciones, y Sistemas de Seguridad Electrónica.
Tu misión es diagnosticar requerimientos de clientes en lenguaje natural (distancias de cableado, normas TIA/EIA-568, PoE, canalizaciones, cámaras IP, switches) y sugerir soluciones y productos relevantes del catálogo de BITMOVIL. Responde de forma consultiva, profesional, concisa y empática.`
};
