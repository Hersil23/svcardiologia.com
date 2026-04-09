<?php
/**
 * SVC App — Bunny.net CDN Storage Integration
 */

define('BUNNY_STORAGE_ZONE', 'appscv');
define('BUNNY_STORAGE_HOST', 'ny.storage.bunnycdn.com');
define('BUNNY_STORAGE_PASS', 'a3630f7e-4d52-4278-9a9f37949368-4d72-4e5b');
define('BUNNY_API_KEY',      '62a64a19-589f-4d56-8a7e-ebbed006a6944b102de8-74e2-40bb-b67c-42f2ae485cc6');
define('BUNNY_CDN_URL',      'https://appsvc.b-cdn.net');

// Folder structure:
// appscv/members/{nro_svc}/foto_carne.jpg
// appscv/members/{nro_svc}/cedula.pdf
// appscv/members/{nro_svc}/titulo_medico.pdf
// appscv/members/{nro_svc}/titulo_especialidad.pdf
// appscv/members/{nro_svc}/cv.pdf
// appscv/payments/{payment_id}/comprobante.jpg
// appscv/events/{event_id}/imagen.jpg

function bunnyUpload(string $localPath, string $remotePath): array {
    $url = 'https://' . BUNNY_STORAGE_HOST . '/' . BUNNY_STORAGE_ZONE . '/' . ltrim($remotePath, '/');

    $file = fopen($localPath, 'rb');
    if (!$file) {
        return ['success' => false, 'error' => 'Cannot read local file'];
    }
    $size = filesize($localPath);

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_CUSTOMREQUEST  => 'PUT',
        CURLOPT_HTTPHEADER     => [
            'AccessKey: ' . BUNNY_STORAGE_PASS,
            'Content-Type: application/octet-stream',
            'Content-Length: ' . $size,
        ],
        CURLOPT_INFILE         => $file,
        CURLOPT_INFILESIZE     => $size,
        CURLOPT_UPLOAD         => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_TIMEOUT        => 30,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);
    curl_close($ch);
    fclose($file);

    if ($httpCode === 201) {
        return [
            'success' => true,
            'cdn_url' => BUNNY_CDN_URL . '/' . ltrim($remotePath, '/'),
            'path'    => $remotePath,
        ];
    }

    return ['success' => false, 'error' => "Upload failed: HTTP {$httpCode}" . ($error ? " - {$error}" : ''), 'response' => $response];
}

function bunnyDelete(string $remotePath): bool {
    $url = 'https://' . BUNNY_STORAGE_HOST . '/' . BUNNY_STORAGE_ZONE . '/' . ltrim($remotePath, '/');

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_CUSTOMREQUEST  => 'DELETE',
        CURLOPT_HTTPHEADER     => ['AccessKey: ' . BUNNY_STORAGE_PASS],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
    ]);
    curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return $httpCode === 200;
}

function bunnyGetUrl(string $remotePath): string {
    return BUNNY_CDN_URL . '/' . ltrim($remotePath, '/');
}

/**
 * Resize image using GD, save to $outPath.
 */
function resizeImage(string $srcPath, string $outPath, int $maxWidth, int $quality = 85): bool {
    $info = @getimagesize($srcPath);
    if (!$info) return false;

    [$origW, $origH, $type] = $info;
    if ($origW <= $maxWidth) {
        return copy($srcPath, $outPath);
    }

    $ratio = $maxWidth / $origW;
    $newW  = $maxWidth;
    $newH  = (int) round($origH * $ratio);

    $src = match ($type) {
        IMAGETYPE_JPEG => imagecreatefromjpeg($srcPath),
        IMAGETYPE_PNG  => imagecreatefrompng($srcPath),
        IMAGETYPE_GIF  => imagecreatefromgif($srcPath),
        IMAGETYPE_WEBP => function_exists('imagecreatefromwebp') ? imagecreatefromwebp($srcPath) : false,
        default        => false,
    };
    if (!$src) return false;

    $dst = imagecreatetruecolor($newW, $newH);

    if ($type === IMAGETYPE_PNG || $type === IMAGETYPE_GIF) {
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
    }

    imagecopyresampled($dst, $src, 0, 0, 0, 0, $newW, $newH, $origW, $origH);

    $ok = match ($type) {
        IMAGETYPE_JPEG => imagejpeg($dst, $outPath, $quality),
        IMAGETYPE_PNG  => imagepng($dst, $outPath, (int) round(9 - ($quality / 100 * 9))),
        IMAGETYPE_GIF  => imagegif($dst, $outPath),
        IMAGETYPE_WEBP => imagewebp($dst, $outPath, $quality),
        default        => false,
    };

    imagedestroy($src);
    imagedestroy($dst);
    return $ok;
}
