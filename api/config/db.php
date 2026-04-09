<?php
/**
 * SVC App - Core Configuration & Utilities
 * Database connection, JWT, auth middleware, response helpers
 */

// ============================================================
// ENVIRONMENT CONFIG
// ============================================================
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', getenv('DB_NAME') ?: 'svc_app');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_CHARSET', 'utf8mb4');

define('JWT_SECRET', getenv('JWT_SECRET') ?: 'CHANGE_THIS_TO_A_RANDOM_64_CHAR_STRING');
define('JWT_ISSUER', 'svcardiologia.com');
define('JWT_EXPIRY', 3600);       // 1 hour
define('JWT_REFRESH_EXPIRY', 604800); // 7 days

define('APP_ENV', getenv('APP_ENV') ?: 'production');
define('APP_DEBUG', APP_ENV === 'development');

// ============================================================
// CORS HEADERS
// ============================================================
function setCorsHeaders(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = ['https://svcardiologia.com', 'https://www.svcardiologia.com'];

    if (APP_DEBUG) {
        $allowed[] = 'http://localhost';
        $allowed[] = 'http://localhost:3000';
        $allowed[] = 'http://127.0.0.1';
    }

    if (in_array($origin, $allowed, true)) {
        header("Access-Control-Allow-Origin: $origin");
    }

    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Max-Age: 86400');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// ============================================================
// DATABASE CONNECTION
// ============================================================
function getDB(): PDO {
    static $pdo = null;

    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
        ];

        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            if (APP_DEBUG) {
                respondError('Database connection failed: ' . $e->getMessage(), 500);
            }
            respondError('Service temporarily unavailable', 503);
        }
    }

    return $pdo;
}

// ============================================================
// JWT ENCODE / DECODE
// ============================================================
function base64UrlEncode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64UrlDecode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/'));
}

function jwtEncode(array $payload): string {
    $header = base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));

    $payload['iss'] = JWT_ISSUER;
    $payload['iat'] = time();
    if (!isset($payload['exp'])) {
        $payload['exp'] = time() + JWT_EXPIRY;
    }

    $payloadEncoded = base64UrlEncode(json_encode($payload));
    $signature = base64UrlEncode(
        hash_hmac('sha256', "$header.$payloadEncoded", JWT_SECRET, true)
    );

    return "$header.$payloadEncoded.$signature";
}

function jwtDecode(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;

    [$header, $payload, $signature] = $parts;

    // Verify signature
    $validSig = base64UrlEncode(
        hash_hmac('sha256', "$header.$payload", JWT_SECRET, true)
    );

    if (!hash_equals($validSig, $signature)) return null;

    $data = json_decode(base64UrlDecode($payload), true);
    if (!$data) return null;

    // Check expiration
    if (isset($data['exp']) && $data['exp'] < time()) return null;

    // Check issuer
    if (($data['iss'] ?? '') !== JWT_ISSUER) return null;

    return $data;
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
function requireAuth(string ...$roles): array {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
        respondError('Authentication required', 401);
    }

    $payload = jwtDecode($matches[1]);
    if (!$payload) {
        respondError('Invalid or expired token', 401);
    }

    // Check if token has been revoked
    $db = getDB();
    $stmt = $db->prepare(
        'SELECT id FROM auth_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()'
    );
    $stmt->execute([hash('sha256', $matches[1])]);

    if (!$stmt->fetch()) {
        respondError('Token has been revoked', 401);
    }

    // Check role if specified
    if (!empty($roles) && !in_array($payload['role'] ?? '', $roles, true)) {
        respondError('Insufficient permissions', 403);
    }

    return $payload;
}

// ============================================================
// RESPONSE HELPERS
// ============================================================
function respond(mixed $data, int $code = 200): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => true,
        'data'    => $data
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function respondError(string $message, int $code = 400, ?array $errors = null): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    $response = [
        'success' => false,
        'message' => $message
    ];
    if ($errors !== null) {
        $response['errors'] = $errors;
    }
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}

function respondPaginated(array $data, int $total, int $page, int $perPage): never {
    respond([
        'items'    => $data,
        'total'    => $total,
        'page'     => $page,
        'per_page' => $perPage,
        'pages'    => (int) ceil($total / $perPage)
    ]);
}

// ============================================================
// INPUT HELPERS
// ============================================================
function getInput(): array {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

    if (stripos($contentType, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    return array_merge($_GET, $_POST);
}

function getMethod(): string {
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function getPathSegments(): array {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    $path = trim($path, '/');
    // Remove 'api/' prefix if present
    $path = preg_replace('#^api/#', '', $path);
    return array_values(array_filter(explode('/', $path)));
}

// ============================================================
// TOKEN & ID GENERATORS
// ============================================================
function generateQrToken(): string {
    return bin2hex(random_bytes(32));
}

function generateTicketUid(): string {
    $prefix = 'SVC';
    $time = dechex(time());
    $rand = bin2hex(random_bytes(4));
    return strtoupper("$prefix-$time-$rand");
}

function generateRefreshToken(): string {
    return bin2hex(random_bytes(48));
}

// ============================================================
// INIT
// ============================================================

// Disable PHP version exposure
header_remove('X-Powered-By');
ini_set('expose_php', '0');

// Load security modules
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/firewall.php';
require_once __DIR__ . '/upload.php';

// Set CORS headers
setCorsHeaders();

// Enforce request size limit (2MB)
enforceRequestSizeLimit();

// Validate Content-Type on write requests
validateContentType();

// Run application firewall
runFirewall();

// Scan inputs for attack patterns
$rawInput = getInput();
scanInputsForAttacks($rawInput);
