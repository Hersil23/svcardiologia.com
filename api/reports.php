<?php
require_once __DIR__ . '/config/db.php';

$method = getMethod();
$action = $_GET['action'] ?? '';

if ($method !== 'GET') respondError('Method not allowed', 405);
$auth = requireAuth('admin', 'superadmin');
$db = getDB();

switch ($action) {

    // GET /reports?action=dashboard
    case 'dashboard':
        $stats = [];

        // Members
        $stats['members_total'] = (int) $db->query('SELECT COUNT(*) FROM members')->fetchColumn();
        $stats['members_active'] = (int) $db->query("SELECT COUNT(*) FROM members WHERE membership_status = 'active'")->fetchColumn();
        $stats['members_pending'] = (int) $db->query("SELECT COUNT(*) FROM members WHERE membership_status = 'pending'")->fetchColumn();

        // Payments
        $stats['payments_pending'] = (int) $db->query("SELECT COUNT(*) FROM payments WHERE status = 'pending'")->fetchColumn();
        $stats['payments_total_year'] = (float) $db->query("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'approved' AND YEAR(created_at) = YEAR(NOW())")->fetchColumn();

        // Events
        $stats['events_active'] = (int) $db->query("SELECT COUNT(*) FROM events WHERE is_published = 1 AND ends_at >= NOW()")->fetchColumn();
        $stats['events_total'] = (int) $db->query("SELECT COUNT(*) FROM events")->fetchColumn();

        // Tickets
        $stats['tickets_sold'] = (int) $db->query("SELECT COUNT(*) FROM tickets WHERE status IN ('active','used')")->fetchColumn();
        $stats['tickets_checked_in'] = (int) $db->query("SELECT COUNT(*) FROM tickets WHERE status = 'used'")->fetchColumn();

        // Monthly revenue (last 6 months)
        $mStmt = $db->query("
            SELECT DATE_FORMAT(created_at, '%Y-%m') as month,
                   SUM(amount) as total
            FROM payments
            WHERE status = 'approved' AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY month
            ORDER BY month ASC
        ");
        $stats['monthly_revenue'] = $mStmt->fetchAll();

        // Monthly new members (last 6 months)
        $nStmt = $db->query("
            SELECT DATE_FORMAT(created_at, '%Y-%m') as month,
                   COUNT(*) as total
            FROM members
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY month
            ORDER BY month ASC
        ");
        $stats['monthly_members'] = $nStmt->fetchAll();

        respond($stats);
        break;

    // GET /reports?action=members_csv
    case 'members_csv':
        $stmt = $db->query("
            SELECT m.membership_number, m.first_name, m.last_name, u.email,
                   m.cedula, m.phone, m.specialty, m.institution, m.city, m.state,
                   m.membership_status, m.membership_expires_at, m.created_at
            FROM members m
            JOIN users u ON u.id = m.user_id
            ORDER BY m.last_name ASC
        ");
        $rows = $stmt->fetchAll();

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename=miembros_svc_' . date('Y-m-d') . '.csv');
        echo "\xEF\xBB\xBF"; // BOM
        $out = fopen('php://output', 'w');
        if (!empty($rows)) {
            fputcsv($out, array_keys($rows[0]));
            foreach ($rows as $row) fputcsv($out, $row);
        }
        fclose($out);
        exit;

    // GET /reports?action=payments_csv
    case 'payments_csv':
        $stmt = $db->query("
            SELECT p.id, m.first_name, m.last_name, m.membership_number,
                   pt.name as tipo_pago, p.amount, p.currency, p.method,
                   p.reference_number, p.status, p.created_at, p.reviewed_at
            FROM payments p
            JOIN payment_types pt ON pt.id = p.payment_type_id
            LEFT JOIN members m ON m.user_id = p.user_id
            ORDER BY p.created_at DESC
        ");
        $rows = $stmt->fetchAll();

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename=pagos_svc_' . date('Y-m-d') . '.csv');
        echo "\xEF\xBB\xBF";
        $out = fopen('php://output', 'w');
        if (!empty($rows)) {
            fputcsv($out, array_keys($rows[0]));
            foreach ($rows as $row) fputcsv($out, $row);
        }
        fclose($out);
        exit;

    // GET /reports?action=attendance&event_id=X
    case 'attendance':
        $eventId = (int)($_GET['event_id'] ?? 0);
        if (!$eventId) respondError('event_id requerido', 400);

        $stmt = $db->prepare("
            SELECT t.uid, t.status, t.checked_in_at,
                   m.first_name, m.last_name, m.cedula, m.membership_number,
                   ett.name as ticket_type
            FROM tickets t
            LEFT JOIN members m ON m.user_id = t.user_id
            JOIN event_ticket_types ett ON ett.id = t.ticket_type_id
            WHERE t.event_id = ?
            ORDER BY m.last_name ASC
        ");
        $stmt->execute([$eventId]);
        respond($stmt->fetchAll());
        break;

    default:
        respondError('Accion no valida', 400);
}
