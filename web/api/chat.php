<?php
/**
 * BITMOVIL — Proxy Seguro para Asistente Técnico LLM (Anthropic)
 *
 * Características de seguridad:
 * - Oculta la API Key en el servidor (fuera del alcance del navegador).
 * - Rate limit por IP con hash HMAC (evita Rainbow tables de IPv4) y flock() concurrente.
 * - Tope global de peticiones diarias para blindar costos.
 * - RAG Seguro: El cliente solo envía IDs de producto; el servidor los valida contra datos.json.
 * - Validación estricta de turnos (alternancia user/assistant) y longitud de mensajes.
 * - Guardrails estrictos: prohibición de inventar precios, stock o garantías.
 */

declare(strict_types=1);

// Encabezados base
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');

// -----------------------------------------------------------------------------
// 1. CONTROL DE CORS Y ORIGIN
// -----------------------------------------------------------------------------
$origin = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
$allowed_domains = [
    'bitmovil.mx',
    'catalogo.bitmovil.mx',
    'localhost',
    '127.0.0.1'
];

$origin_allowed = false;
$parsed_host = parse_url($origin, PHP_URL_HOST) ?? '';

foreach ($allowed_domains as $domain) {
    if ($parsed_host === $domain || str_ends_with($parsed_host, '.' . $domain)) {
        $origin_allowed = true;
        break;
    }
}

// En desarrollo local (file:/// o sin host), permitir para pruebas
if (empty($parsed_host)) {
    $origin_allowed = true;
}

if ($origin_allowed && !empty($origin)) {
    header('Access-Control-Allow-Origin: ' . htmlspecialchars($origin, ENT_QUOTES, 'UTF-8'));
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido. Solo se acepta POST.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// -----------------------------------------------------------------------------
// 2. CARGA DE CONFIGURACIÓN Y SECRETOS
// -----------------------------------------------------------------------------
function cargar_configuracion(): array {
    $config = [
        'ANTHROPIC_API_KEY' => getenv('ANTHROPIC_API_KEY') ?: '',
        'ANTHROPIC_MODEL'   => getenv('ANTHROPIC_MODEL') ?: 'claude-haiku-4-5-20251001',
        'DAILY_REQUEST_CAP' => (int)(getenv('DAILY_REQUEST_CAP') ?: 500),
        'RATE_LIMIT_PER_IP' => (int)(getenv('RATE_LIMIT_PER_IP') ?: 10),
        'RATE_LIMIT_WINDOW' => (int)(getenv('RATE_LIMIT_WINDOW') ?: 300),
        'SERVER_SECRET_KEY' => getenv('SERVER_SECRET_KEY') ?: 'bitmovil_salt_key_default_2026'
    ];

    // Rutas candidatas de archivos .env (de más segura a menos)
    $rutas = [
        ($_SERVER['HOME'] ?? '') . '/secrets/bitmovil.env',
        dirname(__DIR__, 2) . '/secrets.env',
        dirname(__DIR__, 2) . '/config.env',
        __DIR__ . '/secrets.env'
    ];

    foreach ($rutas as $ruta) {
        if (!empty($ruta) && file_exists($ruta) && is_readable($ruta)) {
            $lineas = file($ruta, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lineas as $linea) {
                $linea = trim($linea);
                if (empty($linea) || str_starts_with($linea, '#') || !str_contains($linea, '=')) {
                    continue;
                }
                [$k, $v] = explode('=', $linea, 2);
                $k = trim($k);
                $v = trim($v, " \t\n\r\0\x0B\"'");
                if (isset($config[$k]) && empty($config[$k])) {
                    $config[$k] = $v;
                }
            }
            break;
        }
    }

    return $config;
}

$config = cargar_configuracion();

if (empty($config['ANTHROPIC_API_KEY']) || str_contains($config['ANTHROPIC_API_KEY'], 'tu_anthropic_api_key')) {
    http_response_code(503);
    echo json_encode([
        'status'  => 'fallback',
        'message' => 'Servicio LLM temporalmente no configurado. Utilizando motor local.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// -----------------------------------------------------------------------------
// 3. IDENTIFICACIÓN Y RATE LIMITING CON HMAC Y FLOCK
// -----------------------------------------------------------------------------
$raw_ip = $_SERVER['HTTP_CF_CONNECTING_IP'] 
    ?? explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '')[0] 
    ?? $_SERVER['REMOTE_ADDR'] 
    ?? '127.0.0.1';
$raw_ip = trim($raw_ip);

$ip_hash = hash_hmac('sha256', $raw_ip, $config['SERVER_SECRET_KEY']);
$cache_dir = __DIR__ . '/cache';
if (!is_dir($cache_dir)) {
    @mkdir($cache_dir, 0750, true);
}

$rate_file = $cache_dir . '/rate_limits.json';
$now = time();
$today = date('Y-m-d');

$fp = @fopen($rate_file, 'c+');
if ($fp) {
    if (flock($fp, LOCK_EX)) {
        $filesize = filesize($rate_file);
        $rate_data = $filesize > 0 ? json_decode(fread($fp, $filesize), true) : [];
        if (!is_array($rate_data)) {
            $rate_data = [];
        }

        // Inicializar estructura si es nuevo día
        if (($rate_data['date'] ?? '') !== $today) {
            $rate_data = [
                'date'        => $today,
                'daily_count' => 0,
                'ips'         => []
            ];
        }

        // 1. Comprobar tope diario global
        if ($rate_data['daily_count'] >= $config['DAILY_REQUEST_CAP']) {
            flock($fp, LOCK_UN);
            fclose($fp);
            http_response_code(429);
            echo json_encode(['error' => 'Límite global diario de consultas alcanzado. Por favor contacta a un asesor directo.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // 2. Limpiar timestamps vencidos para la IP actual
        $timestamps = $rate_data['ips'][$ip_hash] ?? [];
        $window_start = $now - $config['RATE_LIMIT_WINDOW'];
        $timestamps = array_filter($timestamps, fn($ts) => $ts > $window_start);

        if (count($timestamps) >= $config['RATE_LIMIT_PER_IP']) {
            flock($fp, LOCK_UN);
            fclose($fp);
            http_response_code(429);
            echo json_encode(['error' => 'Demasiadas consultas en poco tiempo. Por favor espera unos minutos.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Registrar nueva petición
        $timestamps[] = $now;
        $rate_data['ips'][$ip_hash] = $timestamps;
        $rate_data['daily_count']++;

        // Guardar cambios atómicamente
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($rate_data, JSON_UNESCAPED_SLASHES));
        flock($fp, LOCK_UN);
    }
    fclose($fp);
}

// -----------------------------------------------------------------------------
// 4. VALIDACIÓN ESTRICTA DEL BODY JSON
// -----------------------------------------------------------------------------
$raw_body = file_get_contents('php://input');
if (strlen($raw_body) > 10240) { // Máximo 10 KB de payload
    http_response_code(413);
    echo json_encode(['error' => 'El cuerpo de la petición excede el tamaño permitido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$input = json_decode($raw_body, true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'Cuerpo JSON inválido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$message = trim((string)($input['message'] ?? ''));
if ($message === '' || mb_strlen($message, 'UTF-8') > 400) {
    http_response_code(400);
    echo json_encode(['error' => 'El mensaje es requerido y no debe exceder 400 caracteres.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Validar historial: máximo 6 turnos, alternados estrictamente user/assistant
$history = $input['history'] ?? [];
$validated_messages = [];

if (is_array($history)) {
    $history = array_slice($history, -6); // Conservar solo los últimos 6 turnos
    $expected_role = 'user';

    foreach ($history as $item) {
        if (!is_array($item)) continue;
        $role = $item['role'] ?? '';
        $content = trim((string)($item['content'] ?? ''));

        if ($role !== 'user' && $role !== 'assistant') continue;
        if ($content === '' || mb_strlen($content, 'UTF-8') > 600) continue;

        // Validar alternancia estricta
        if ($role !== $expected_role) {
            http_response_code(400);
            echo json_encode(['error' => 'El historial conversacional debe alternar estrictamente turnos de usuario y asistente.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $validated_messages[] = [
            'role'    => $role,
            'content' => htmlspecialchars($content, ENT_QUOTES, 'UTF-8')
        ];

        $expected_role = ($role === 'user') ? 'assistant' : 'user';
    }
}

// Añadir el mensaje actual del usuario
$validated_messages[] = [
    'role'    => 'user',
    'content' => htmlspecialchars($message, ENT_QUOTES, 'UTF-8')
];

// -----------------------------------------------------------------------------
// 5. RAG SEGURO: VALIDACIÓN DE PRODUCTOS EN SERVIDOR
// -----------------------------------------------------------------------------
$client_product_ids = array_slice((array)($input['product_ids'] ?? []), 0, 5);
$contexto_productos = [];

$datos_json_file = dirname(__DIR__) . '/datos.json';
if (file_exists($datos_json_file) && !empty($client_product_ids)) {
    $catalogo_raw = @json_decode(file_get_contents($datos_json_file), true);
    if (is_array($catalogo_raw)) {
        // Indexar productos válidos
        $productos_por_id = [];
        foreach ($catalogo_raw as $categoria) {
            foreach (($categoria['productos'] ?? []) as $prod) {
                $id = (string)($prod['no_parte'] ?? '');
                if ($id !== '') {
                    $productos_por_id[$id] = [
                        'no_parte'    => $id,
                        'marca'       => (string)($prod['marca'] ?? ''),
                        'descripcion' => (string)($prod['descripcion'] ?? '')
                    ];
                }
            }
        }

        foreach ($client_product_ids as $pid) {
            $pid_str = (string)$pid;
            if (isset($productos_por_id[$pid_str])) {
                $contexto_productos[] = $productos_por_id[$pid_str];
            }
        }
    }
}

// -----------------------------------------------------------------------------
// 6. CONSTRUCCIÓN DEL SYSTEM PROMPT INMUTABLE EN SERVIDOR
// -----------------------------------------------------------------------------
$system_prompt = "Eres el 'Asesor Técnico Especialista de BITMOVIL', una empresa integradora de infraestructura TI en México (Tampico, Monterrey, Saltillo y Zona Golfo).\n";
$system_prompt .= "Tu especialidad: Cableado Estructurado (TIA/EIA-568, Cat6/6A, cobre 100%, chaquetas UV/exterior), Redes (Switches PoE 802.3af/at/bt) y Seguridad Electrónica.\n\n";
$system_prompt .= "GUARDRAILS Y REGLAS DE NEGOCIO ESTRICTAS:\n";
$system_prompt .= "1. NUNCA des precios, costos, existencias de inventario ni fechas de entrega.\n";
$system_prompt .= "2. NUNCA des garantías legales o técnicas vinculantes de compatibilidad; siempre aclara que se requiere validación por ingeniería.\n";
$system_prompt .= "3. Limítate estrictamente a resolver dudas técnicas de arquitectura y recomendar los productos autorizados.\n";
$system_prompt .= "4. Sé conciso, profesional y directo (máximo 180 palabras).\n\n";

if (!empty($contexto_productos)) {
    $system_prompt .= "PRODUCTOS VERIFICADOS DISPONIBLES EN EL CATÁLOGO PARA ESTA CONSULTA:\n";
    foreach ($contexto_productos as $p) {
        $system_prompt .= "- Modelo: {$p['no_parte']} | Marca: {$p['marca']} | Detalle: {$p['descripcion']}\n";
    }
    $system_prompt .= "\nSi son pertinentes para la duda del usuario, sugiere estos modelos exactos.\n";
}

// -----------------------------------------------------------------------------
// 7. LLAMADA DIRECTA AL PROTOCOLO OFICIAL DE ANTHROPIC (/v1/messages)
// -----------------------------------------------------------------------------
$payload = [
    'model'       => $config['ANTHROPIC_MODEL'],
    'max_tokens'  => 400,
    'temperature' => 0.2,
    'system'      => $system_prompt,
    'messages'    => $validated_messages
];

$ch = curl_init('https://api.anthropic.com/v1/messages');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_SLASHES),
    CURLOPT_HTTPHEADER     => [
        'x-api-key: ' . $config['ANTHROPIC_API_KEY'],
        'anthropic-version: 2023-06-01',
        'content-type: application/json'
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_CONNECTTIMEOUT => 5
]);

$response_raw = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curl_err = curl_error($ch);
curl_close($ch);

if ($response_raw === false || $http_code !== 200) {
    http_response_code(503);
    echo json_encode([
        'status'  => 'fallback',
        'message' => 'No fue posible conectar con el asistente en la nube. Conmutando a motor local.',
        'debug'   => ($http_code === 401 ? 'Verifica la API key configurada en el servidor.' : null)
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$response_data = json_decode($response_raw, true);
$reply_text = $response_data['content'][0]['text'] ?? 'Gracias por tu consulta. Un asesor de BITMOVIL puede atender tu requerimiento técnico.';

// -----------------------------------------------------------------------------
// 8. LOG DE CONSULTAS SIN RESOLVER (ANONIMIZADO Y SANITIZADO)
// -----------------------------------------------------------------------------
if (empty($contexto_productos)) {
    // Redactar posibles teléfonos o correos antes de registrar
    $redacted_query = preg_replace('/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/', '[EMAIL]', $message);
    $redacted_query = preg_replace('/\b\d{7,14}\b/', '[TEL]', $redacted_query);
    $redacted_query = mb_substr($redacted_query, 0, 150, 'UTF-8');

    $log_line = sprintf(
        "[%s] IP:%s | Q:\"%s\"\n",
        date('Y-m-d H:i:s'),
        substr($ip_hash, 0, 12),
        addcslashes($redacted_query, "\n\r\t\"")
    );
    @file_put_contents($cache_dir . '/unanswered.log', $log_line, FILE_APPEND | LOCK_EX);
}

// Respuesta exitosa al cliente
echo json_encode([
    'status' => 'ok',
    'reply'  => $reply_text
], JSON_UNESCAPED_UNICODE);
