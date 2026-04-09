<?php
/**
 * SVC App — Mailer Class (Resend.com REST API)
 * 8 transactional email templates for the full membership lifecycle
 */

require_once __DIR__ . '/mail.php';

class SVCMailer {

    private static function send(string $to, string $subject, string $html): bool {
        if (!MAIL_ENABLED) {
            $log = date('Y-m-d H:i:s') . " TO:{$to} SUBJECT:{$subject}\n";
            @file_put_contents(__DIR__ . '/../../logs/mail.log', $log, FILE_APPEND);
            return true;
        }

        $payload = json_encode([
            'from'    => MAIL_FROM_NAME . ' <' . MAIL_FROM_EMAIL . '>',
            'to'      => [$to],
            'subject' => $subject,
            'html'    => $html,
        ]);

        $ch = curl_init('https://api.resend.com/emails');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . RESEND_API_KEY,
                'Content-Type: application/json',
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 && $httpCode !== 201) {
            error_log("Resend error: HTTP {$httpCode} - {$response}");
            return false;
        }
        return true;
    }

    private static function esc(string $s): string {
        return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    }

    private static function template(string $content): string {
        $appLink = APP_LINK;
        return <<<HTML
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:Arial,sans-serif;background:#f4f4f4;color:#333;}
.wrap{max-width:600px;margin:0 auto;background:#fff;}
.header{background:linear-gradient(135deg,#8B0F1A,#D11039);padding:32px 24px;text-align:center;}
.logo{color:#fff;font-size:36px;font-weight:900;letter-spacing:3px;}
.logo-sub{color:rgba(255,255,255,0.8);font-size:12px;margin-top:4px;letter-spacing:1px;}
.body{padding:40px 32px;}
.greeting{font-size:20px;font-weight:bold;color:#1a1a1a;margin-bottom:16px;}
.text{font-size:15px;color:#555;line-height:1.7;margin-bottom:16px;}
.btn{display:inline-block;background:#D11039;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;margin:20px 0;}
.info-box{background:#f9f9f9;border-left:4px solid #D11039;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;}
.info-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;font-size:14px;}
.info-row:last-child{border-bottom:none;}
.label{color:#888;}
.value{color:#1a1a1a;font-weight:bold;}
.nro-svc{font-size:32px;font-weight:900;color:#D11039;text-align:center;letter-spacing:4px;padding:20px;background:#fff5f5;border-radius:12px;margin:24px 0;}
.divider{border:none;border-top:1px solid #eee;margin:24px 0;}
.footer{background:#1a1a1a;padding:28px;text-align:center;}
.footer p{color:#888;font-size:12px;line-height:1.8;}
.footer a{color:#D11039;text-decoration:none;}
.badge{display:inline-block;padding:6px 16px;border-radius:999px;font-size:13px;font-weight:bold;}
.badge-green{background:#dcfce7;color:#166534;}
.badge-red{background:#fee2e2;color:#991b1b;}
.badge-blue{background:#dbeafe;color:#1e40af;}
@media(max-width:600px){.body{padding:24px 16px;}}
</style>
</head>
<body>
<div class="wrap">
<div class="header">
  <div class="logo">&#10084; SVC</div>
  <div class="logo-sub">SOCIEDAD VENEZOLANA DE CARDIOLOGIA</div>
</div>
<div class="body">{$content}</div>
<div class="footer">
  <p>
    <strong style="color:#fff">Sociedad Venezolana de Cardiologia</strong><br>
    Tel: 0212-263.30.60 / 263.57.87<br>
    <a href="mailto:contacto@svcardiologia.com">contacto@svcardiologia.com</a><br>
    <a href="https://www.svcardiologia.com">www.svcardiologia.com</a><br><br>
    Desarrollado por <a href="https://instagram.com/herasi.dev">@herasi.dev</a> &amp; Zivi Dynamics C.A
  </p>
</div>
</div>
</body>
</html>
HTML;
    }

    public static function sendRegistrationConfirmation(array $data): bool {
        $nombre = self::esc(($data['first_name'] ?? '') . ' ' . ($data['last_name'] ?? ''));
        $tipo   = self::esc(ucfirst($data['membership_type'] ?? 'Asociado'));
        $email  = self::esc($data['email'] ?? '');
        $fecha  = date('d/m/Y');
        $link   = APP_LINK;

        $content = <<<BODY
<div class="greeting">Estimado(a) Dr(a). {$nombre},</div>
<p class="text">Hemos recibido tu solicitud de membresia como <strong>{$tipo}</strong> de la Sociedad Venezolana de Cardiologia.</p>
<div class="info-box">
    <div class="info-row"><span class="label">Tipo</span><span class="value">{$tipo}</span></div>
    <div class="info-row"><span class="label">Correo</span><span class="value">{$email}</span></div>
    <div class="info-row"><span class="label">Fecha</span><span class="value">{$fecha}</span></div>
    <div class="info-row"><span class="label">Estado</span><span class="value"><span class="badge badge-blue">En revision</span></span></div>
</div>
<p class="text">La <strong>Comision de Credenciales</strong> revisara tu expediente. Te notificaremos cuando haya una actualizacion.</p>
<div class="info-box">
    <p style="font-size:14px;color:#555;margin:0;">Tiempo estimado: <strong>5 a 10 dias habiles</strong></p>
</div>
BODY;
        return self::send($data['email'], 'Tu solicitud de membresia SVC fue recibida', self::template($content));
    }

    public static function sendAdminNewRequest(array $data): bool {
        $nombre = self::esc(($data['first_name'] ?? '') . ' ' . ($data['last_name'] ?? ''));
        $tipo   = self::esc(ucfirst($data['membership_type'] ?? 'Asociado'));
        $email  = self::esc($data['email'] ?? '');
        $phone  = self::esc($data['phone'] ?? '');
        $fecha  = date('d/m/Y H:i');
        $link   = APP_LINK;

        $content = <<<BODY
<div class="greeting">Nueva solicitud de membresia</div>
<div class="info-box">
    <div class="info-row"><span class="label">Nombre</span><span class="value">{$nombre}</span></div>
    <div class="info-row"><span class="label">Tipo</span><span class="value">{$tipo}</span></div>
    <div class="info-row"><span class="label">Email</span><span class="value">{$email}</span></div>
    <div class="info-row"><span class="label">Telefono</span><span class="value">{$phone}</span></div>
    <div class="info-row"><span class="label">Fecha</span><span class="value">{$fecha}</span></div>
</div>
<div style="text-align:center;">
    <a href="{$link}/#/admin" class="btn">Revisar en el Panel Admin</a>
</div>
BODY;
        return self::send(MAIL_ADMIN, "Nueva solicitud - {$nombre} ({$tipo})", self::template($content));
    }

    public static function sendApprovalEmail(array $member): bool {
        $nombre = self::esc(($member['first_name'] ?? '') . ' ' . ($member['last_name'] ?? ''));
        $nroSvc = self::esc($member['membership_number'] ?? 'SVC-XXXX');
        $email  = self::esc($member['email'] ?? '');
        $link   = APP_LINK;

        $content = <<<BODY
<div style="text-align:center;font-size:48px;margin-bottom:16px;">&#127881;</div>
<div class="greeting" style="text-align:center;">Bienvenido(a) a la SVC!</div>
<p class="text" style="text-align:center;">Dr(a). <strong>{$nombre}</strong>, tu solicitud ha sido <strong style="color:#166534;">aprobada</strong>.</p>
<div class="nro-svc">{$nroSvc}</div>
<p style="text-align:center;font-size:12px;color:#888;margin-bottom:24px;">Tu numero de membresia SVC</p>
<div class="info-box">
    <div class="info-row"><span class="label">Email</span><span class="value">{$email}</span></div>
    <div class="info-row"><span class="label">Ingreso</span><span class="value">{$fecha}</span></div>
</div>
<div style="text-align:center;">
    <a href="{$link}" class="btn">Acceder a la App SVC</a>
</div>
BODY;
        $fecha = date('d/m/Y');
        $content = str_replace('{$fecha}', $fecha, $content);
        return self::send($member['email'], 'Bienvenido(a) a la SVC! Tu membresia fue aprobada', self::template($content));
    }

    public static function sendRejectionEmail(array $member, string $reason): bool {
        $nombre = self::esc(($member['first_name'] ?? '') . ' ' . ($member['last_name'] ?? ''));
        $safeReason = self::esc($reason);

        $content = <<<BODY
<div class="greeting">Estimado(a) Dr(a). {$nombre},</div>
<p class="text">Hemos revisado tu solicitud. Lamentablemente, no ha sido posible aprobarla.</p>
<div class="info-box">
    <p style="font-size:14px;font-weight:bold;color:#333;margin-bottom:8px;">Motivo:</p>
    <p style="font-size:14px;color:#555;margin:0;">{$safeReason}</p>
</div>
<p class="text">Puedes corregir la situacion y enviar una nueva solicitud.</p>
<div style="text-align:center;">
    <a href="mailto:contacto@svcardiologia.com" class="btn">Contactar a la SVC</a>
</div>
BODY;
        return self::send($member['email'], 'Actualizacion sobre tu solicitud SVC', self::template($content));
    }

    public static function sendPaymentVerified(array $member, array $payment): bool {
        $nombre  = self::esc(($member['first_name'] ?? '') . ' ' . ($member['last_name'] ?? ''));
        $amount  = self::esc($payment['amount'] ?? '50');
        $currency= self::esc($payment['currency'] ?? 'USD');
        $method  = self::esc(ucfirst(str_replace('_', ' ', $payment['method'] ?? '')));
        $ref     = self::esc($payment['reference_number'] ?? '-');
        $year    = date('Y');
        $link    = APP_LINK;

        $content = <<<BODY
<div style="text-align:center;font-size:48px;margin-bottom:16px;">&#9989;</div>
<div class="greeting" style="text-align:center;">Pago verificado</div>
<p class="text" style="text-align:center;">Dr(a). <strong>{$nombre}</strong>, tu pago ha sido verificado.</p>
<div class="info-box">
    <div class="info-row"><span class="label">Monto</span><span class="value">\${$amount} {$currency}</span></div>
    <div class="info-row"><span class="label">Metodo</span><span class="value">{$method}</span></div>
    <div class="info-row"><span class="label">Referencia</span><span class="value">{$ref}</span></div>
    <div class="info-row"><span class="label">Estado</span><span class="value"><span class="badge badge-green">SOLVENTE {$year}</span></span></div>
</div>
<div style="text-align:center;">
    <a href="{$link}" class="btn">Ver mi membresia</a>
</div>
BODY;
        return self::send($member['email'], "Pago verificado - Solvente {$year}", self::template($content));
    }

    public static function sendPaymentRejected(array $member, string $reason): bool {
        $nombre = self::esc(($member['first_name'] ?? '') . ' ' . ($member['last_name'] ?? ''));
        $safeReason = self::esc($reason);
        $link = APP_LINK;

        $content = <<<BODY
<div style="text-align:center;font-size:48px;margin-bottom:16px;">&#9888;&#65039;</div>
<div class="greeting">Estimado(a) Dr(a). {$nombre},</div>
<p class="text">El comprobante de pago no pudo ser verificado.</p>
<div class="info-box">
    <p style="font-size:14px;font-weight:bold;color:#333;margin-bottom:8px;">Motivo:</p>
    <p style="font-size:14px;color:#555;margin:0;">{$safeReason}</p>
</div>
<div style="text-align:center;">
    <a href="{$link}/#/membership" class="btn">Registrar nuevo pago</a>
</div>
BODY;
        return self::send($member['email'], 'Problema con tu comprobante de pago SVC', self::template($content));
    }

    public static function sendTicketConfirmed(array $member, array $ticket, array $event): bool {
        $nombre   = self::esc(($member['first_name'] ?? '') . ' ' . ($member['last_name'] ?? ''));
        $title    = self::esc($event['title'] ?? '');
        $date     = date('d/m/Y', strtotime($event['start_date'] ?? 'now'));
        $location = self::esc($event['location'] ?? '');
        $uid      = self::esc(strtoupper(substr($ticket['ticket_uid'] ?? '', 0, 12)));
        $link     = APP_LINK;

        $content = <<<BODY
<div style="text-align:center;font-size:48px;margin-bottom:16px;">&#127903;</div>
<div class="greeting" style="text-align:center;">Tu entrada esta confirmada!</div>
<p class="text" style="text-align:center;">Dr(a). <strong>{$nombre}</strong>:</p>
<div class="info-box">
    <div class="info-row"><span class="label">Evento</span><span class="value">{$title}</span></div>
    <div class="info-row"><span class="label">Fecha</span><span class="value">{$date}</span></div>
    <div class="info-row"><span class="label">Lugar</span><span class="value">{$location}</span></div>
    <div class="info-row"><span class="label">ID Ticket</span><span class="value">{$uid}</span></div>
    <div class="info-row"><span class="label">Estado</span><span class="value"><span class="badge badge-green">Confirmado</span></span></div>
</div>
<p class="text">Presenta tu codigo QR en la entrada del evento.</p>
<div style="text-align:center;">
    <a href="{$link}/#/tickets" class="btn">Ver mi entrada</a>
</div>
BODY;
        return self::send($member['email'], "Tu entrada para {$title} esta confirmada", self::template($content));
    }

    public static function sendDuesReminder(array $member, int $year): bool {
        $nombre = self::esc(($member['first_name'] ?? '') . ' ' . ($member['last_name'] ?? ''));
        $link = APP_LINK;

        $content = <<<BODY
<div style="text-align:center;font-size:48px;margin-bottom:16px;">&#9200;</div>
<div class="greeting">Estimado(a) Dr(a). {$nombre},</div>
<p class="text">Tu membresia SVC vence el <strong>31 de diciembre de {$year}</strong>.</p>
<div class="info-box">
    <div class="info-row"><span class="label">Cuota anual</span><span class="value">\$50.00 USD</span></div>
    <div class="info-row"><span class="label">Vencimiento</span><span class="value">31/12/{$year}</span></div>
    <div class="info-row"><span class="label">Metodos</span><span class="value">Zelle - Transferencia - Pago Movil</span></div>
</div>
<div style="text-align:center;">
    <a href="{$link}/#/membership" class="btn">Renovar ahora</a>
</div>
BODY;
        return self::send($member['email'], "Tu membresia SVC vence el 31/12/{$year}", self::template($content));
    }
}
