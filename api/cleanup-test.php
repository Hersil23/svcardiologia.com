<?php
require_once __DIR__ . '/config/db.php';

$db = getDB();

// Delete test users (not the superadmin)
$testEmails = ['twistvip241@gmail.com'];

foreach ($testEmails as $email) {
    $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if ($user) {
        $uid = (int)$user['id'];
        $db->prepare('DELETE FROM file_uploads WHERE user_id = ?')->execute([$uid]);
        $db->prepare('DELETE FROM payments WHERE user_id = ?')->execute([$uid]);
        $db->prepare('DELETE FROM auth_tokens WHERE user_id = ?')->execute([$uid]);
        $db->prepare('DELETE FROM members WHERE user_id = ?')->execute([$uid]);
        $db->prepare('DELETE FROM users WHERE id = ?')->execute([$uid]);
        $results[] = "Deleted: {$email} (id: {$uid})";
    } else {
        $results[] = "Not found: {$email}";
    }
}

// Also clear rate limits and login attempts
$db->prepare('DELETE FROM rate_limits')->execute();
$db->prepare('DELETE FROM login_attempts')->execute();

$results[] = 'Rate limits cleared';

echo json_encode(['success' => true, 'results' => $results]);
