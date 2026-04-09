<?php
/**
 * SVC App — Health Check (Enhanced with Security)
 */
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$checks = [];
$allOk = true;
$score = 0;
$total = 0;

function addCheck(string $name, bool $pass, string $detail = ''): void {
    global $checks, $allOk, $score, $total;
    $total++;
    if ($pass) $score++;
    else $allOk = false;
    $checks[$name] = ['status' => $pass ? 'ok' : 'error', 'detail' => $detail];
}

function addWarning(string $name, bool $pass, string $detail = ''): void {
    global $checks, $total, $score;
    $total++;
    if ($pass) $score++;
    $checks[$name] = ['status' => $pass ? 'ok' : 'warning', 'detail' => $detail];
}

// PHP version
addCheck('php_version', version_compare(PHP_VERSION, '8.1.0', '>='), PHP_VERSION);

// Required extensions
foreach (['pdo', 'pdo_mysql', 'json', 'mbstring', 'openssl'] as $ext) {
    addCheck("ext_{$ext}", extension_loaded($ext));
}

// Database connection
$dbOk = false;
try {
    require_once __DIR__ . '/../api/config/db.php';
    $db = getDB();
    $db->query('SELECT 1');
    $dbOk = true;
} catch (Exception $e) {
    $checks['database'] = ['status' => 'error', 'detail' => $e->getMessage()];
}
addCheck('database', $dbOk);

// Security tables
if ($dbOk) {
    $secTables = ['security_log', 'login_attempts', 'rate_limits', 'blocked_ips', 'csrf_tokens'];
    $allTables = true;
    foreach ($secTables as $t) {
        try { $db->query("SELECT 1 FROM {$t} LIMIT 0"); } catch (Exception $e) { $allTables = false; }
    }
    addCheck('security_tables', $allTables, implode(', ', $secTables));
}

// HTTPS check
$isHTTPS = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
addWarning('https', $isHTTPS || ($_SERVER['HTTP_HOST'] ?? '') === 'localhost');

// display_errors OFF
addWarning('display_errors_off', !ini_get('display_errors') || ini_get('display_errors') === '0' || ini_get('display_errors') === 'Off');

// JWT secret changed
addWarning('jwt_secret_changed', defined('JWT_SECRET') && JWT_SECRET !== 'CHANGE_THIS_TO_A_RANDOM_64_CHAR_STRING');

// Config not web-accessible
addCheck('config_protected', file_exists(__DIR__ . '/../api/.htaccess'));

// Security modules present
addCheck('security_modules',
    file_exists(__DIR__ . '/../api/config/security.php') &&
    file_exists(__DIR__ . '/../api/config/firewall.php') &&
    file_exists(__DIR__ . '/../api/config/upload.php')
);

// .htaccess files
addCheck('htaccess_present',
    file_exists(__DIR__ . '/../api/.htaccess') &&
    file_exists(__DIR__ . '/../public/.htaccess')
);

// Security score
$pct = $total > 0 ? round(($score / $total) * 100) : 0;

echo json_encode([
    'status' => $allOk ? 'healthy' : 'unhealthy',
    'security_score' => "{$score}/{$total} ({$pct}%)",
    'timestamp' => date('c'),
    'checks' => $checks
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
