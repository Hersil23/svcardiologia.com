<?php
/**
 * SVC App — Dues Reminder Cron Job
 * Run via cPanel cron: 0 9 1 12 * php /home/drbrione/public_html/appsvc.drbriones.com/api/cron/dues-reminder.php
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/mailer.php';

$year = (int)date('Y');
$db   = getDB();

// Find active members without an approved payment for this year
$stmt = $db->prepare("
    SELECT m.*, u.email
    FROM members m
    JOIN users u ON u.id = m.user_id
    WHERE u.status = 'active'
    AND m.membership_status = 'active'
    AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.user_id = m.user_id
        AND p.status = 'approved'
        AND YEAR(p.created_at) = ?
    )
");
$stmt->execute([$year]);
$members = $stmt->fetchAll();

$sent = 0;
foreach ($members as $member) {
    if (SVCMailer::sendDuesReminder($member, $year)) {
        $sent++;
    }
    usleep(500000); // 0.5s between emails to respect rate limits
}

echo json_encode(['sent' => $sent, 'total' => count($members), 'year' => $year]);
