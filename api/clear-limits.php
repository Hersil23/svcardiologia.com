<?php
require_once __DIR__ . '/config/db.php';
$db = getDB();
$db->exec("DELETE FROM rate_limits WHERE action LIKE 'upload%'");
$db->exec("DELETE FROM rate_limits WHERE action = 'login'");
$db->exec("DELETE FROM login_attempts");
echo json_encode(['success' => true, 'message' => 'Rate limits cleared']);
