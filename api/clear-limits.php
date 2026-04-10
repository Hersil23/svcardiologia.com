<?php
require_once __DIR__ . '/config/db.php';
$db = getDB();
$db->prepare('DELETE FROM rate_limits')->execute();
$db->prepare('DELETE FROM login_attempts')->execute();
echo json_encode(['success' => true, 'message' => 'All rate limits cleared']);
