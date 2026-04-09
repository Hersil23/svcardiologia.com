<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/currency.php';
require_once __DIR__ . '/config/mailer.php';

$method = getMethod();
$action = $_GET['action'] ?? '';

// Enrich payment records with Bs equivalents
function enrichWithRates(array $payments): array {
    $rates = getExchangeRates();
    $bcvRate = $rates['bcv']['promedio'] ?? 36.50;
    $usdtRate = $rates['paralelo']['promedio'] ?? 38.00;
    $rateDate = $rates['bcv']['fechaActualizacion'] ?? date('Y-m-d');

    return array_map(function($p) use ($bcvRate, $usdtRate, $rateDate) {
        $amt = (float)($p['amount'] ?? 0);
        $p['monto_usd'] = $amt;
        $p['monto_bs_bcv'] = round($amt * $bcvRate, 2);
        $p['monto_bs_usdt'] = round($amt * $usdtRate, 2);
        $p['tasa_bcv'] = $bcvRate;
        $p['tasa_usdt'] = $usdtRate;
        $p['tasa_fecha'] = $rateDate;
        return $p;
    }, $payments);
}

switch (true) {

    // GET /payments?action=my — member's own payments
    case $method === 'GET' && ($action === '' || $action === 'my'):
        $auth = requireAuth();
        $db = getDB();

        $stmt = $db->prepare('
            SELECT p.*, pt.name as type_name, pt.description as type_desc
            FROM payments p
            JOIN payment_types pt ON pt.id = p.payment_type_id
            WHERE p.user_id = ?
            ORDER BY p.created_at DESC
        ');
        $stmt->execute([(int)$auth['sub']]);
        respond(enrichWithRates($stmt->fetchAll()));
        break;

    // GET /payments?action=pending — admin: all pending
    case $method === 'GET' && $action === 'pending':
        $auth = requireAuth('admin', 'superadmin');
        $db = getDB();

        $stmt = $db->query("
            SELECT p.*, pt.name as type_name,
                   m.first_name, m.last_name, m.membership_number, m.phone, u.email
            FROM payments p
            JOIN payment_types pt ON pt.id = p.payment_type_id
            JOIN users u ON u.id = p.user_id
            LEFT JOIN members m ON m.user_id = p.user_id
            WHERE p.status = 'pending'
            ORDER BY p.created_at ASC
        ");
        respond(enrichWithRates($stmt->fetchAll()));
        break;

    // GET /payments?action=all — admin: all with filter
    case $method === 'GET' && $action === 'all':
        $auth = requireAuth('admin', 'superadmin');
        $db = getDB();
        $input = getInput();

        $page    = max(1, (int)($input['page'] ?? 1));
        $perPage = min(50, max(5, (int)($input['per_page'] ?? 20)));
        $offset  = ($page - 1) * $perPage;
        $status  = $input['status'] ?? '';

        $where = ['1=1'];
        $params = [];

        if ($status && in_array($status, ['pending','approved','rejected','cancelled'])) {
            $where[] = 'p.status = ?';
            $params[] = $status;
        }

        $whereSQL = implode(' AND ', $where);
        $total = (int) $db->prepare("SELECT COUNT(*) FROM payments p WHERE {$whereSQL}")->execute($params) ? $db->query("SELECT FOUND_ROWS()")->fetchColumn() : 0;

        // Recount properly
        $cStmt = $db->prepare("SELECT COUNT(*) FROM payments p WHERE {$whereSQL}");
        $cStmt->execute($params);
        $total = (int) $cStmt->fetchColumn();

        $stmt = $db->prepare("
            SELECT p.*, pt.name as type_name,
                   m.first_name, m.last_name, m.membership_number
            FROM payments p
            JOIN payment_types pt ON pt.id = p.payment_type_id
            LEFT JOIN members m ON m.user_id = p.user_id
            WHERE {$whereSQL}
            ORDER BY p.created_at DESC
            LIMIT {$perPage} OFFSET {$offset}
        ");
        $stmt->execute($params);
        respondPaginated($stmt->fetchAll(), $total, $page, $perPage);
        break;

    // GET /payments?action=types — payment types
    case $method === 'GET' && $action === 'types':
        $auth = requireAuth();
        $db = getDB();
        $stmt = $db->query("SELECT * FROM payment_types WHERE is_active = 1 ORDER BY name");
        respond($stmt->fetchAll());
        break;

    // GET /payments?action=stats
    case $method === 'GET' && $action === 'stats':
        $auth = requireAuth('admin', 'superadmin');
        $db = getDB();

        $stats = [];
        $stats['total_approved'] = (float)$db->query("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'approved'")->fetchColumn();
        $stats['pending_count'] = (int)$db->query("SELECT COUNT(*) FROM payments WHERE status = 'pending'")->fetchColumn();
        $stats['approved_count'] = (int)$db->query("SELECT COUNT(*) FROM payments WHERE status = 'approved'")->fetchColumn();
        $stats['this_year'] = (float)$db->query("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'approved' AND YEAR(created_at) = YEAR(NOW())")->fetchColumn();

        // By method
        $mStmt = $db->query("SELECT method, COUNT(*) as cnt, SUM(amount) as total FROM payments WHERE status = 'approved' GROUP BY method");
        $stats['by_method'] = $mStmt->fetchAll();

        respond($stats);
        break;

    // POST /payments — create payment
    case $method === 'POST' && ($action === '' || $action === 'create'):
        $auth = requireAuth();
        $input = getInput();
        $db = getDB();

        $typeId = (int)($input['payment_type_id'] ?? 0);
        $amount = (float)($input['amount'] ?? 0);
        $method_ = $input['method'] ?? '';
        $reference = trim($input['reference_number'] ?? '');

        if (!$typeId) respondError('Tipo de pago requerido', 400);
        if ($amount <= 0) respondError('Monto invalido', 400);
        if (!in_array($method_, ['transfer','mobile_payment','zelle','cash','other'])) {
            respondError('Metodo de pago invalido', 400);
        }

        // Verify payment type exists
        $tStmt = $db->prepare('SELECT id, amount FROM payment_types WHERE id = ? AND is_active = 1');
        $tStmt->execute([$typeId]);
        if (!$tStmt->fetch()) respondError('Tipo de pago no encontrado', 404);

        $stmt = $db->prepare('
            INSERT INTO payments (user_id, payment_type_id, amount, currency, method, reference_number, notes, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, "pending")
        ');
        $stmt->execute([
            (int)$auth['sub'], $typeId, $amount,
            $input['currency'] ?? 'USD', $method_,
            $reference ?: null, trim($input['notes'] ?? '') ?: null
        ]);

        respond(['id' => (int)$db->lastInsertId()], 201);
        break;

    // PUT /payments?action=approve&id=X
    case $method === 'PUT' && $action === 'approve':
        $auth = requireAuth('admin', 'superadmin');
        $input = getInput();
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        if (!$id) respondError('ID requerido', 400);

        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM payments WHERE id = ? AND status = "pending"');
        $stmt->execute([$id]);
        $payment = $stmt->fetch();
        if (!$payment) respondError('Pago no encontrado o ya procesado', 404);

        try {
            $db->beginTransaction();

            $db->prepare('UPDATE payments SET status = "approved", reviewed_by = ?, reviewed_at = NOW() WHERE id = ?')
               ->execute([(int)$auth['sub'], $id]);

            // If membership payment, activate membership
            $tStmt = $db->prepare('SELECT name FROM payment_types WHERE id = ?');
            $tStmt->execute([$payment['payment_type_id']]);
            $typeName = $tStmt->fetchColumn();

            if (stripos($typeName, 'inscripcion anual') !== false || stripos($typeName, 'renovacion') !== false) {
                $db->prepare("
                    UPDATE members SET membership_status = 'active',
                           membership_expires_at = DATE_ADD(NOW(), INTERVAL 1 YEAR)
                    WHERE user_id = ?
                ")->execute([$payment['user_id']]);
            }

            $db->commit();

            // Send payment verified email
            $mStmt = $db->prepare('SELECT m.*, u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.user_id = ?');
            $mStmt->execute([$payment['user_id']]);
            $payMember = $mStmt->fetch();
            if ($payMember) SVCMailer::sendPaymentVerified($payMember, $payment);

            respond(['approved' => true]);
        } catch (PDOException $e) {
            $db->rollBack();
            respondError(APP_DEBUG ? $e->getMessage() : 'Error al aprobar pago', 500);
        }
        break;

    // PUT /payments?action=reject&id=X
    case $method === 'PUT' && $action === 'reject':
        $auth = requireAuth('admin', 'superadmin');
        $input = getInput();
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        if (!$id) respondError('ID requerido', 400);

        $db = getDB();
        $stmt = $db->prepare('SELECT id FROM payments WHERE id = ? AND status = "pending"');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) respondError('Pago no encontrado o ya procesado', 404);

        // Get payment details before rejecting
        $pStmt = $db->prepare('SELECT * FROM payments WHERE id = ?');
        $pStmt->execute([$id]);
        $rejPayment = $pStmt->fetch();

        $db->prepare('UPDATE payments SET status = "rejected", reviewed_by = ?, reviewed_at = NOW(), notes = CONCAT(COALESCE(notes, ""), ?) WHERE id = ?')
           ->execute([(int)$auth['sub'], $input['reason'] ? "\nRechazado: " . $input['reason'] : '', $id]);

        // Send rejection email
        if ($rejPayment) {
            $mStmt = $db->prepare('SELECT m.*, u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.user_id = ?');
            $mStmt->execute([$rejPayment['user_id']]);
            $rejMember = $mStmt->fetch();
            if ($rejMember) SVCMailer::sendPaymentRejected($rejMember, $input['reason'] ?? 'Sin motivo especificado');
        }

        respond(['rejected' => true]);
        break;

    default:
        respondError('Accion no valida', 400);
}
