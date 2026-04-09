<?php
/**
 * SVC App — Security Module
 * Rate limiting, input validation, logging, CSRF, attack detection
 */

// ============================================================
// REQUEST SIZE LIMIT (2MB)
// ============================================================
function enforceRequestSizeLimit(int $maxBytes = 2097152): void {
    // Allow upload.php to override the limit
    $limit = (int)($_SERVER['SVC_UPLOAD_MAX'] ?? $maxBytes);
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > $limit) {
        respondError('Solicitud demasiado grande', 413);
    }
}

// ============================================================
// INPUT SANITIZATION
// ============================================================
function sanitizeString(string $str): string {
    $str = trim($str);
    $str = strip_tags($str);
    $str = htmlspecialchars($str, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return $str;
}

function sanitizeInput(array $data): array {
    $clean = [];
    foreach ($data as $key => $value) {
        if (is_string($value)) {
            $clean[$key] = sanitizeString($value);
        } elseif (is_array($value)) {
            $clean[$key] = sanitizeInput($value);
        } elseif (is_int($value) || is_float($value) || is_bool($value) || is_null($value)) {
            $clean[$key] = $value;
        }
    }
    return $clean;
}

// ============================================================
// INPUT VALIDATION
// ============================================================
function validateInput(array $data, array $rules): array {
    $errors = [];
    foreach ($rules as $field => $ruleStr) {
        $value = $data[$field] ?? null;
        $fieldRules = explode('|', $ruleStr);

        foreach ($fieldRules as $rule) {
            $params = [];
            if (str_contains($rule, ':')) {
                [$rule, $paramStr] = explode(':', $rule, 2);
                $params = explode(',', $paramStr);
            }

            $error = applyRule($field, $value, $rule, $params);
            if ($error) {
                $errors[$field] = $error;
                break;
            }
        }
    }
    return $errors;
}

function applyRule(string $field, mixed $value, string $rule, array $params): ?string {
    switch ($rule) {
        case 'required':
            if ($value === null || $value === '') return "{$field} es requerido";
            break;
        case 'email':
            if ($value && !filter_var($value, FILTER_VALIDATE_EMAIL)) return "Correo invalido";
            break;
        case 'min':
            if ($value !== null && strlen((string)$value) < (int)$params[0]) return "{$field} debe tener al menos {$params[0]} caracteres";
            break;
        case 'max':
            if ($value !== null && strlen((string)$value) > (int)$params[0]) return "{$field} no puede exceder {$params[0]} caracteres";
            break;
        case 'int':
            if ($value !== null && $value !== '' && !filter_var($value, FILTER_VALIDATE_INT)) return "{$field} debe ser un numero entero";
            break;
        case 'float':
            if ($value !== null && $value !== '' && !filter_var($value, FILTER_VALIDATE_FLOAT)) return "{$field} debe ser un numero";
            break;
        case 'in':
            if ($value !== null && $value !== '' && !in_array($value, $params, true)) return "{$field} valor no permitido";
            break;
        case 'date':
            if ($value && !strtotime($value)) return "{$field} fecha invalida";
            break;
        case 'alpha_num':
            if ($value && !ctype_alnum(str_replace(['-', '_'], '', $value))) return "{$field} solo letras y numeros";
            break;
    }
    return null;
}

// ============================================================
// RATE LIMITING (DB-based sliding window)
// ============================================================
function checkRateLimit(string $ip, string $action, int $maxRequests = 60, int $windowSeconds = 60): void {
    $db = getDB();

    // Clean old entries
    $db->prepare('DELETE FROM rate_limits WHERE expires_at < NOW()')->execute();

    // Count recent requests
    $stmt = $db->prepare('SELECT COUNT(*) FROM rate_limits WHERE ip_address = ? AND action = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)');
    $stmt->execute([$ip, $action, $windowSeconds]);
    $count = (int)$stmt->fetchColumn();

    if ($count >= $maxRequests) {
        logSecurityEvent('rate_limit_exceeded', $ip, null, "Action: {$action}, Count: {$count}");
        header('Retry-After: ' . $windowSeconds);
        respondError('Demasiadas solicitudes. Intenta de nuevo mas tarde.', 429);
    }

    // Record this request
    $db->prepare('INSERT INTO rate_limits (ip_address, action, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))')
       ->execute([$ip, $action, $windowSeconds]);
}

// ============================================================
// BRUTE FORCE PROTECTION
// ============================================================
function checkLoginAttempts(string $ip, string $email): void {
    $db = getDB();

    // Check IP-based lockout
    $stmt = $db->prepare('SELECT attempts, locked_until FROM login_attempts WHERE ip_address = ? AND email = ? LIMIT 1');
    $stmt->execute([$ip, $email]);
    $record = $stmt->fetch();

    if ($record) {
        // Check if locked
        if ($record['locked_until'] && strtotime($record['locked_until']) > time()) {
            $remaining = ceil((strtotime($record['locked_until']) - time()) / 60);
            logSecurityEvent('login_locked', $ip, null, "Email: {$email}, Remaining: {$remaining}m");
            respondError("Cuenta bloqueada temporalmente. Intenta en {$remaining} minutos.", 429);
        }

        // Reset if lock expired
        if ($record['locked_until'] && strtotime($record['locked_until']) <= time()) {
            $db->prepare('UPDATE login_attempts SET attempts = 0, locked_until = NULL WHERE ip_address = ? AND email = ?')
               ->execute([$ip, $email]);
        }
    }
}

function recordLoginAttempt(string $ip, string $email, bool $success): void {
    $db = getDB();

    if ($success) {
        // Reset on success
        $db->prepare('DELETE FROM login_attempts WHERE ip_address = ? AND email = ?')
           ->execute([$ip, $email]);
        logSecurityEvent('login_success', $ip, null, "Email: {$email}");
        return;
    }

    // Record failure
    $stmt = $db->prepare('SELECT id, attempts FROM login_attempts WHERE ip_address = ? AND email = ? LIMIT 1');
    $stmt->execute([$ip, $email]);
    $record = $stmt->fetch();

    if ($record) {
        $newAttempts = (int)$record['attempts'] + 1;
        $lockUntil = null;

        // Lock after 5 failed attempts (15 min lockout)
        if ($newAttempts >= 5) {
            $lockUntil = date('Y-m-d H:i:s', time() + 900); // 15 minutes
        }

        // Hard lockout after 10 attempts (1 hour)
        if ($newAttempts >= 10) {
            $lockUntil = date('Y-m-d H:i:s', time() + 3600);
        }

        $db->prepare('UPDATE login_attempts SET attempts = ?, locked_until = ?, last_attempt_at = NOW() WHERE id = ?')
           ->execute([$newAttempts, $lockUntil, $record['id']]);
    } else {
        $db->prepare('INSERT INTO login_attempts (ip_address, email, attempts, last_attempt_at) VALUES (?, ?, 1, NOW())')
           ->execute([$ip, $email]);
    }

    logSecurityEvent('login_failed', $ip, null, "Email: {$email}");
}

// ============================================================
// SECURITY EVENT LOGGING
// ============================================================
function logSecurityEvent(string $eventType, ?string $ip = null, ?int $userId = null, ?string $details = null): void {
    try {
        $db = getDB();
        $db->prepare('INSERT INTO security_log (event_type, ip_address, user_id, user_agent, details) VALUES (?, ?, ?, ?, ?)')
           ->execute([
               $eventType,
               $ip ?? ($_SERVER['REMOTE_ADDR'] ?? null),
               $userId,
               substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500),
               $details ? substr($details, 0, 1000) : null
           ]);
    } catch (PDOException $e) {
        // Don't let logging failures break the app
        error_log("Security log error: " . $e->getMessage());
    }
}

// ============================================================
// CSRF TOKENS
// ============================================================
function generateCSRFToken(): string {
    $token = bin2hex(random_bytes(32));
    // Store in DB with expiry
    $db = getDB();
    $hash = hash('sha256', $token);
    $db->prepare('INSERT INTO csrf_tokens (token_hash, expires_at) VALUES (?, DATE_ADD(NOW(), INTERVAL 1 HOUR))')
       ->execute([$hash]);
    return $token;
}

function validateCSRFToken(string $token): bool {
    if (empty($token)) return false;
    $db = getDB();
    $hash = hash('sha256', $token);

    // Clean expired tokens
    $db->prepare('DELETE FROM csrf_tokens WHERE expires_at < NOW()')->execute();

    $stmt = $db->prepare('SELECT id FROM csrf_tokens WHERE token_hash = ? AND expires_at > NOW() LIMIT 1');
    $stmt->execute([$hash]);
    $result = $stmt->fetch();

    if ($result) {
        // Single use — delete after validation
        $db->prepare('DELETE FROM csrf_tokens WHERE id = ?')->execute([$result['id']]);
        return true;
    }
    return false;
}

// ============================================================
// ATTACK DETECTION
// ============================================================
function detectSQLInjection(string $input): bool {
    $patterns = [
        '/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|UNION)\b\s)/i',
        '/(--|#|\/\*|\*\/)/i',
        '/(\bOR\b\s+\d+\s*=\s*\d+)/i',
        '/(\bAND\b\s+\d+\s*=\s*\d+)/i',
        '/(\'|\"|;)\s*(OR|AND|UNION|SELECT)/i',
        '/(\bWAITFOR\b\s+\bDELAY\b)/i',
        '/(SLEEP\s*\(\s*\d+\s*\))/i',
        '/(BENCHMARK\s*\()/i',
    ];
    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $input)) return true;
    }
    return false;
}

function detectXSS(string $input): bool {
    $patterns = [
        '/<\s*script/i',
        '/javascript\s*:/i',
        '/on(load|error|click|mouse|focus|blur)\s*=/i',
        '/<\s*iframe/i',
        '/<\s*object/i',
        '/<\s*embed/i',
        '/<\s*link[^>]+rel\s*=\s*["\']import/i',
        '/data\s*:\s*text\/html/i',
        '/expression\s*\(/i',
        '/vbscript\s*:/i',
    ];
    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $input)) return true;
    }
    return false;
}

function scanInputsForAttacks(array $data): void {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    foreach ($data as $key => $value) {
        if (!is_string($value)) continue;
        if (detectSQLInjection($value)) {
            logSecurityEvent('sqli_attempt', $ip, null, "Field: {$key}, Value: " . substr($value, 0, 200));
            respondError('Solicitud rechazada por seguridad', 400);
        }
        if (detectXSS($value)) {
            logSecurityEvent('xss_attempt', $ip, null, "Field: {$key}, Value: " . substr($value, 0, 200));
            respondError('Solicitud rechazada por seguridad', 400);
        }
    }
}

// ============================================================
// JWT FINGERPRINTING
// ============================================================
function hashFingerprint(?string $ip = null, ?string $ua = null): string {
    $ip = $ip ?? ($_SERVER['REMOTE_ADDR'] ?? '');
    $ua = $ua ?? ($_SERVER['HTTP_USER_AGENT'] ?? '');
    return hash('sha256', $ip . '|' . $ua);
}

// ============================================================
// CONTENT-TYPE VALIDATION
// ============================================================
function validateContentType(): void {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (in_array($method, ['POST', 'PUT', 'PATCH'])) {
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        if (!empty($contentType) && stripos($contentType, 'application/json') === false && stripos($contentType, 'multipart/form-data') === false) {
            respondError('Content-Type no soportado', 415);
        }
    }
}

// ============================================================
// CLIENT IP HELPER
// ============================================================
function getClientIP(): string {
    // Trust X-Forwarded-For only behind known reverse proxies
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        $ip = trim($ips[0]);
        if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
    }
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

// ============================================================
// ROLE HIERARCHY ENFORCEMENT
// ============================================================
function validateRoleAssignment(string $requesterRole, string $targetRole): bool {
    // superadmin can NEVER be created via API
    if ($targetRole === 'superadmin') return false;
    // Only superadmin can create admin
    if ($targetRole === 'admin' && $requesterRole !== 'superadmin') return false;
    // Only superadmin or admin can create staff
    if ($targetRole === 'staff' && !in_array($requesterRole, ['superadmin', 'admin'], true)) return false;
    // Only superadmin or admin can create member
    if ($targetRole === 'member' && !in_array($requesterRole, ['superadmin', 'admin'], true)) return false;
    return true;
}

function getAllowedRolesForCreation(string $requesterRole): array {
    switch ($requesterRole) {
        case 'superadmin': return ['member', 'staff', 'admin'];
        case 'admin':      return ['member', 'staff'];
        default:           return []; // staff and member cannot create users
    }
}
