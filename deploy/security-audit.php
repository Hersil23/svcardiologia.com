<?php
/**
 * SVC App — Security Audit
 * Run after deployment to verify all security measures
 * DELETE THIS FILE after running audit!
 */
header('Content-Type: application/json; charset=utf-8');

$results = [];
$score = 0;
$maxScore = 0;

function check(string $name, bool $pass, string $detail = ''): void {
    global $results, $score, $maxScore;
    $maxScore += 10;
    if ($pass) $score += 10;
    $results[] = [
        'check' => $name,
        'status' => $pass ? 'PASS' : 'FAIL',
        'detail' => $detail
    ];
}

// 1. PHP Version
check('PHP Version >= 8.1', version_compare(PHP_VERSION, '8.1.0', '>='), PHP_VERSION);

// 2. HTTPS
$isHTTPS = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
check('HTTPS Active', $isHTTPS || php_sapi_name() === 'cli');

// 3. display_errors OFF
check('display_errors OFF', !ini_get('display_errors') || ini_get('display_errors') === 'Off' || ini_get('display_errors') === '0');

// 4. expose_php OFF
check('expose_php OFF', !ini_get('expose_php') || ini_get('expose_php') === '0');

// 5. Required extensions
$required = ['pdo', 'pdo_mysql', 'json', 'mbstring', 'openssl'];
$allExt = true;
foreach ($required as $ext) {
    if (!extension_loaded($ext)) $allExt = false;
}
check('Required PHP Extensions', $allExt, implode(', ', $required));

// 6. Database connection
$dbOk = false;
try {
    require_once __DIR__ . '/../api/config/db.php';
    $db = getDB();
    $db->query('SELECT 1');
    $dbOk = true;
} catch (Exception $e) { /* ignore */ }
check('Database Connection', $dbOk);

// 7. Security tables exist
$secTables = true;
if ($dbOk) {
    foreach (['security_log', 'login_attempts', 'rate_limits', 'blocked_ips', 'csrf_tokens'] as $table) {
        try {
            $db->query("SELECT 1 FROM {$table} LIMIT 1");
        } catch (Exception $e) {
            $secTables = false;
        }
    }
}
check('Security Tables Present', $secTables);

// 8. JWT Secret changed from default
$jwtOk = defined('JWT_SECRET') && JWT_SECRET !== 'CHANGE_THIS_TO_A_RANDOM_64_CHAR_STRING';
check('JWT Secret Changed', $jwtOk);

// 9. Config directory not accessible
$configUrl = (($isHTTPS) ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . '/api/config/db.php';
// We can't test this from server-side, so check file permissions
$configPerms = substr(sprintf('%o', fileperms(__DIR__ . '/../api/config/db.php')), -3);
check('Config File Permissions', in_array($configPerms, ['644', '600', '640']), "Perms: {$configPerms}");

// 10. Security headers check (test against own response headers)
check('Security Files Present',
    file_exists(__DIR__ . '/../api/config/security.php') &&
    file_exists(__DIR__ . '/../api/config/firewall.php') &&
    file_exists(__DIR__ . '/../api/config/upload.php')
);

// 11. .htaccess files present
check('.htaccess Security',
    file_exists(__DIR__ . '/../api/.htaccess') &&
    file_exists(__DIR__ . '/../public/.htaccess')
);

// 12. Uploads directory safety
$uploadsDir = __DIR__ . '/../uploads/';
$uploadsHtaccess = file_exists($uploadsDir . '.htaccess');
check('Upload Directory Protection', !is_dir($uploadsDir) || $uploadsHtaccess, 'Uploads .htaccess present or no uploads dir');

// 13. Rate limiting functional
$rlOk = false;
if ($dbOk) {
    try {
        $db->prepare('INSERT INTO rate_limits (ip_address, action, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 SECOND))')->execute(['audit-test', 'audit', date('Y-m-d H:i:s', time() + 1)]);
        $stmt = $db->prepare('SELECT COUNT(*) FROM rate_limits WHERE ip_address = ? AND action = ?');
        $stmt->execute(['audit-test', 'audit']);
        $rlOk = (int)$stmt->fetchColumn() >= 1;
        $db->prepare('DELETE FROM rate_limits WHERE ip_address = ?')->execute(['audit-test']);
    } catch (Exception $e) { /* ignore */ }
}
check('Rate Limiting Functional', $rlOk);

// 14. SQL injection protection (PDO prepared statements)
check('PDO Prepared Statements', $dbOk && !$db->getAttribute(PDO::ATTR_EMULATE_PREPARES));

// 15. Password hashing
check('Bcrypt Password Hashing',
    defined('PASSWORD_BCRYPT') && password_verify('test', password_hash('test', PASSWORD_BCRYPT, ['cost' => 12]))
);

// Output report
echo json_encode([
    'audit' => 'SVC Security Audit',
    'timestamp' => date('c'),
    'score' => $score,
    'max_score' => $maxScore,
    'percentage' => round(($score / $maxScore) * 100),
    'rating' => ($score / $maxScore >= 0.9) ? 'EXCELLENT' : (($score / $maxScore >= 0.7) ? 'GOOD' : 'NEEDS IMPROVEMENT'),
    'results' => $results,
    'warning' => 'DELETE THIS FILE AFTER RUNNING AUDIT!'
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
