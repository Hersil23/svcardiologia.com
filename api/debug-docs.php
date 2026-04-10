<?php
require_once __DIR__ . '/config/db.php';
$db = getDB();

// Check if file_uploads table exists
try {
    $count = $db->query("SELECT COUNT(*) FROM file_uploads")->fetchColumn();
    $rows = $db->query("SELECT * FROM file_uploads ORDER BY id DESC LIMIT 20")->fetchAll();
} catch (Throwable $e) {
    echo json_encode(['error' => 'file_uploads table: ' . $e->getMessage()]);
    exit;
}

// Check members with pending status
$members = $db->query("SELECT m.id, m.first_name, m.last_name, m.membership_status, m.foto_url, m.cedula_url, u.email FROM members m JOIN users u ON u.id = m.user_id ORDER BY m.id DESC LIMIT 10")->fetchAll();

echo json_encode([
    'file_uploads_count' => $count,
    'file_uploads_rows' => $rows,
    'members' => $members
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
