<?php
/**
 * SVC App — Ticket Purchase API
 * Full flow: purchase request → admin review → ticket generation
 */

ini_set('display_errors', 0);
error_reporting(E_ALL);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../logs/ticket_purchase_error.log');

require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/mailer.php';

$action = $_GET['action'] ?? '';
$method = getMethod();

// Ensure table exists
$db = getDB();
$db->query("CREATE TABLE IF NOT EXISTS ticket_purchases (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    event_id INT UNSIGNED NOT NULL,
    ticket_type_id INT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    method VARCHAR(50) NOT NULL,
    reference_number VARCHAR(100) DEFAULT NULL,
    proof_url VARCHAR(500) DEFAULT NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    reviewed_by INT UNSIGNED DEFAULT NULL,
    reviewed_at DATETIME DEFAULT NULL,
    ticket_id INT UNSIGNED DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

switch ($action) {

    // ── USER: Submit purchase request ────────
    case 'submit':
        if ($method !== 'POST') respondError('Method not allowed', 405);
        $auth = requireAuth();
        $input = getInput();

        $eventId      = (int)($input['event_id'] ?? 0);
        $ticketTypeId = (int)($input['ticket_type_id'] ?? 0);
        $payMethod    = trim($input['method'] ?? '');
        $reference    = trim($input['reference_number'] ?? '');
        $proofUrl     = trim($input['proof_url'] ?? '');
        $amount       = (float)($input['amount'] ?? 0);
        $currency     = $input['currency'] ?? 'USD';

        if (!$eventId) respondError('Evento requerido', 400);
        if (!$ticketTypeId) respondError('Tipo de entrada requerido', 400);
        if (!$payMethod) respondError('Método de pago requerido', 400);
        if (!$reference) respondError('Número de referencia requerido', 400);
        if (!$proofUrl) respondError('Comprobante de pago requerido', 400);

        // Verify event exists and is published
        $stmt = $db->prepare('SELECT id, title, max_attendees FROM events WHERE id = ? AND is_published = 1');
        $stmt->execute([$eventId]);
        $event = $stmt->fetch();
        if (!$event) respondError('Evento no encontrado', 404);

        // Verify ticket type exists
        $stmt = $db->prepare('SELECT id, name, price, currency, quantity_available FROM event_ticket_types WHERE id = ? AND event_id = ?');
        $stmt->execute([$ticketTypeId, $eventId]);
        $ticketType = $stmt->fetch();
        if (!$ticketType) respondError('Tipo de entrada no encontrado', 404);

        // Check if user already has a pending or approved purchase for this event
        $stmt = $db->prepare('SELECT id FROM ticket_purchases WHERE user_id = ? AND event_id = ? AND status IN ("pending","approved")');
        $stmt->execute([(int)$auth['sub'], $eventId]);
        if ($stmt->fetch()) respondError('Ya tienes una solicitud de compra para este evento', 409);

        // Check availability
        if ($ticketType['quantity_available']) {
            $soldCount = (int)$db->prepare('SELECT COUNT(*) FROM tickets WHERE event_id = ? AND ticket_type_id = ? AND status = "active"')->execute([$eventId, $ticketTypeId]) ? $db->query('SELECT FOUND_ROWS()')->fetchColumn() : 0;
            $soldStmt = $db->prepare('SELECT COUNT(*) FROM tickets WHERE event_id = ? AND ticket_type_id = ? AND status = "active"');
            $soldStmt->execute([$eventId, $ticketTypeId]);
            $soldCount = (int)$soldStmt->fetchColumn();
            if ($soldCount >= (int)$ticketType['quantity_available']) {
                respondError('Entradas agotadas para este tipo', 400);
            }
        }

        $useAmount = $amount > 0 ? $amount : (float)$ticketType['price'];

        $stmt = $db->prepare('
            INSERT INTO ticket_purchases (user_id, event_id, ticket_type_id, amount, currency, method, reference_number, proof_url, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, "pending")
        ');
        $stmt->execute([
            (int)$auth['sub'], $eventId, $ticketTypeId,
            $useAmount, $currency, $payMethod, $reference, $proofUrl
        ]);

        $purchaseId = (int)$db->lastInsertId();

        // Send email to user
        try {
            $userStmt = $db->prepare('SELECT m.*, u.email FROM members m JOIN users u ON u.id = m.user_id WHERE u.id = ?');
            $userStmt->execute([(int)$auth['sub']]);
            $member = $userStmt->fetch();
            if ($member) {
                // Simple confirmation — reuse registration confirmation pattern
                SVCMailer::sendRegistrationConfirmation([
                    'first_name' => $member['first_name'],
                    'last_name' => $member['last_name'],
                    'email' => $member['email'],
                    'membership_type' => 'Compra de entrada: ' . $event['title'],
                ]);
            }
        } catch (Throwable $e) {
            error_log('Purchase email failed: ' . $e->getMessage());
        }

        // Notify admin
        try {
            SVCMailer::sendAdminNewRequest([
                'first_name' => $member['first_name'] ?? '',
                'last_name' => $member['last_name'] ?? '',
                'email' => $member['email'] ?? '',
                'phone' => $member['phone'] ?? '',
                'membership_type' => 'Compra ticket: ' . $event['title'] . ' - ' . $ticketType['name'],
            ]);
        } catch (Throwable $e) {
            error_log('Admin notification failed: ' . $e->getMessage());
        }

        respond(['purchase_id' => $purchaseId, 'status' => 'pending'], 201);
        break;

    // ── USER: My purchases ──────────────────
    case 'my':
        if ($method !== 'GET') respondError('Method not allowed', 405);
        $auth = requireAuth();

        $stmt = $db->prepare('
            SELECT tp.*, e.title as event_title, e.starts_at as event_date, e.location as event_location,
                   ett.name as ticket_type_name
            FROM ticket_purchases tp
            JOIN events e ON e.id = tp.event_id
            JOIN event_ticket_types ett ON ett.id = tp.ticket_type_id
            WHERE tp.user_id = ?
            ORDER BY tp.created_at DESC
        ');
        $stmt->execute([(int)$auth['sub']]);
        respond($stmt->fetchAll());
        break;

    // ── ADMIN: Pending purchases ────────────
    case 'pending':
        if ($method !== 'GET') respondError('Method not allowed', 405);
        $auth = requireAuth('admin', 'superadmin');

        $stmt = $db->query("
            SELECT tp.*, e.title as event_title, e.starts_at as event_date,
                   ett.name as ticket_type_name, ett.price as ticket_price,
                   m.first_name, m.last_name, m.phone, u.email
            FROM ticket_purchases tp
            JOIN events e ON e.id = tp.event_id
            JOIN event_ticket_types ett ON ett.id = tp.ticket_type_id
            JOIN users u ON u.id = tp.user_id
            LEFT JOIN members m ON m.user_id = tp.user_id
            WHERE tp.status = 'pending'
            ORDER BY tp.created_at ASC
        ");
        respond($stmt->fetchAll());
        break;

    // ── ADMIN: Approve purchase → generate ticket ──
    case 'approve':
        if ($method !== 'PUT') respondError('Method not allowed', 405);
        $auth = requireAuth('admin', 'superadmin');
        $input = getInput();
        $purchaseId = (int)($input['purchase_id'] ?? 0);
        if (!$purchaseId) respondError('purchase_id requerido', 400);

        $stmt = $db->prepare('SELECT * FROM ticket_purchases WHERE id = ? AND status = "pending"');
        $stmt->execute([$purchaseId]);
        $purchase = $stmt->fetch();
        if (!$purchase) respondError('Compra no encontrada o ya procesada', 404);

        try {
            $db->beginTransaction();

            // Generate unique ticket
            $ticketUid = 'SVC-EVT-' . $purchase['event_id'] . '-' . strtoupper(bin2hex(random_bytes(6)));
            $qrToken = bin2hex(random_bytes(32));

            $stmt = $db->prepare('
                INSERT INTO tickets (event_id, user_id, ticket_type_id, uid, qr_token, status)
                VALUES (?, ?, ?, ?, ?, "active")
            ');
            $stmt->execute([
                $purchase['event_id'], $purchase['user_id'], $purchase['ticket_type_id'],
                $ticketUid, $qrToken
            ]);
            $ticketId = (int)$db->lastInsertId();

            // Update purchase
            $db->prepare('UPDATE ticket_purchases SET status = "approved", reviewed_by = ?, reviewed_at = NOW(), ticket_id = ? WHERE id = ?')
               ->execute([(int)$auth['sub'], $ticketId, $purchaseId]);

            $db->commit();

            // Send confirmation email with ticket info
            try {
                $userStmt = $db->prepare('SELECT m.*, u.email FROM members m JOIN users u ON u.id = m.user_id WHERE u.id = ?');
                $userStmt->execute([$purchase['user_id']]);
                $member = $userStmt->fetch();

                $eventStmt = $db->prepare('SELECT * FROM events WHERE id = ?');
                $eventStmt->execute([$purchase['event_id']]);
                $event = $eventStmt->fetch();

                $ttStmt = $db->prepare('SELECT name FROM event_ticket_types WHERE id = ?');
                $ttStmt->execute([$purchase['ticket_type_id']]);
                $ttName = $ttStmt->fetchColumn();

                if ($member && $event) {
                    SVCMailer::sendTicketConfirmed($member, [
                        'ticket_uid' => $ticketUid,
                        'tipo_ticket' => $ttName ?: 'General',
                    ], [
                        'title' => $event['title'],
                        'start_date' => $event['starts_at'],
                        'location' => $event['location'] ?? '',
                    ]);
                }
            } catch (Throwable $e) {
                error_log('Ticket email failed: ' . $e->getMessage());
            }

            respond(['approved' => true, 'ticket_uid' => $ticketUid, 'ticket_id' => $ticketId]);

        } catch (PDOException $e) {
            $db->rollBack();
            error_log('Ticket generation failed: ' . $e->getMessage());
            respondError('Error al generar ticket', 500);
        }
        break;

    // ── ADMIN: Reject purchase ──────────────
    case 'reject':
        if ($method !== 'PUT') respondError('Method not allowed', 405);
        $auth = requireAuth('admin', 'superadmin');
        $input = getInput();
        $purchaseId = (int)($input['purchase_id'] ?? 0);
        $reason = trim($input['reason'] ?? '');
        if (!$purchaseId) respondError('purchase_id requerido', 400);

        $stmt = $db->prepare('SELECT * FROM ticket_purchases WHERE id = ? AND status = "pending"');
        $stmt->execute([$purchaseId]);
        $purchase = $stmt->fetch();
        if (!$purchase) respondError('Compra no encontrada o ya procesada', 404);

        $db->prepare('UPDATE ticket_purchases SET status = "rejected", reviewed_by = ?, reviewed_at = NOW(), notes = ? WHERE id = ?')
           ->execute([(int)$auth['sub'], $reason ?: 'Rechazado por el administrador', $purchaseId]);

        // Send rejection email
        try {
            $userStmt = $db->prepare('SELECT m.*, u.email FROM members m JOIN users u ON u.id = m.user_id WHERE u.id = ?');
            $userStmt->execute([$purchase['user_id']]);
            $member = $userStmt->fetch();
            if ($member) {
                SVCMailer::sendPaymentRejected($member, $reason ?: 'Comprobante no válido');
            }
        } catch (Throwable $e) {
            error_log('Rejection email failed: ' . $e->getMessage());
        }

        respond(['rejected' => true]);
        break;

    default:
        respondError('Acción no válida', 400);
}
