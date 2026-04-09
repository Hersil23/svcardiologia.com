<?php
/**
 * SVC App — Application Firewall
 * Block malicious requests, bad user agents, attack patterns
 */

function runFirewall(): void {
    $ip = getClientIP();
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $uri = $_SERVER['REQUEST_URI'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    // 1. Block requests with no User-Agent
    if (empty($ua) && $method !== 'OPTIONS') {
        logSecurityEvent('firewall_no_ua', $ip, null, "URI: {$uri}");
        http_response_code(403);
        exit;
    }

    // 2. Block known vulnerability scanners
    $badAgents = [
        'nikto', 'sqlmap', 'nmap', 'masscan', 'dirbuster', 'gobuster',
        'wpscan', 'joomla', 'drupal', 'acunetix', 'nessus', 'openvas',
        'havij', 'pangolin', 'webinspect', 'arachni', 'w3af',
    ];
    $uaLower = strtolower($ua);
    foreach ($badAgents as $bad) {
        if (str_contains($uaLower, $bad)) {
            logSecurityEvent('firewall_bad_ua', $ip, null, "UA: " . substr($ua, 0, 200));
            http_response_code(403);
            exit;
        }
    }

    // 3. Block common attack patterns in URI
    $attackPatterns = [
        '/\.\.\//i',                          // path traversal
        '/\.(env|git|svn|htpasswd|htaccess|bak|old|swp|sql|log|ini|conf)/i', // sensitive files
        '/(wp-admin|wp-login|wp-content|xmlrpc)/i', // WordPress probes
        '/(phpmyadmin|adminer|phpinfo)/i',    // admin tool probes
        '/(etc\/passwd|proc\/self|boot\.ini)/i', // LFI
        '/(UNION\s+SELECT|SELECT\s+.*FROM|DROP\s+TABLE)/i', // SQL injection in URL
        '/(<script|javascript:|on\w+\s*=)/i', // XSS in URL
        '/(cmd|command|exec|system)\s*[=\(]/i', // command injection
    ];

    foreach ($attackPatterns as $pattern) {
        if (preg_match($pattern, urldecode($uri))) {
            logSecurityEvent('firewall_attack_pattern', $ip, null, "URI: " . substr($uri, 0, 500));
            http_response_code(403);
            exit;
        }
    }

    // 4. Block known bad IPs (configurable list)
    $blockedIPs = getBlockedIPs();
    if (in_array($ip, $blockedIPs, true)) {
        http_response_code(403);
        exit;
    }

    // 5. Honeypot: /api/admin_backup.php — log and ban
    if (str_contains($uri, 'admin_backup') || str_contains($uri, 'wp-login') || str_contains($uri, 'phpinfo')) {
        logSecurityEvent('honeypot_triggered', $ip, null, "URI: {$uri}");
        blockIP($ip, 'Honeypot trigger: ' . $uri);
        http_response_code(404);
        exit;
    }

    // 6. Global rate limit (60 req/min per IP)
    checkRateLimit($ip, 'global', 60, 60);
}

function getBlockedIPs(): array {
    try {
        $db = getDB();
        $stmt = $db->query("SELECT ip_address FROM blocked_ips WHERE (expires_at IS NULL OR expires_at > NOW())");
        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    } catch (PDOException $e) {
        return [];
    }
}

function blockIP(string $ip, string $reason = '', int $durationHours = 24): void {
    try {
        $db = getDB();
        $expiresAt = date('Y-m-d H:i:s', time() + ($durationHours * 3600));
        $db->prepare('INSERT INTO blocked_ips (ip_address, reason, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason), expires_at = VALUES(expires_at)')
           ->execute([$ip, substr($reason, 0, 500), $expiresAt]);
    } catch (PDOException $e) {
        error_log("Failed to block IP {$ip}: " . $e->getMessage());
    }
}
