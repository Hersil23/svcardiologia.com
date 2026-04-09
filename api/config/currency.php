<?php
/**
 * SVC App — DolarAPI.com Integration
 * Real-time USD/Bs exchange rates
 */

define('DOLAR_API_URL', 'https://ve.dolarapi.com/v1/dolares');

function getExchangeRates(): array {
    static $cache = null;
    static $cacheTime = 0;

    // Cache for 30 minutes
    if ($cache && (time() - $cacheTime) < 1800) {
        return $cache;
    }

    $ctx = stream_context_create([
        'http' => [
            'timeout' => 5,
            'header' => "User-Agent: SVC-App/1.0\r\n"
        ]
    ]);

    $response = @file_get_contents(DOLAR_API_URL, false, $ctx);

    if (!$response) {
        return [
            'bcv'      => ['nombre' => 'BCV', 'promedio' => 36.50, 'fechaActualizacion' => date('Y-m-d')],
            'paralelo' => ['nombre' => 'Paralelo', 'promedio' => 38.00, 'fechaActualizacion' => date('Y-m-d')],
        ];
    }

    $data = json_decode($response, true);
    $rates = [];

    if (is_array($data)) {
        foreach ($data as $item) {
            $key = strtolower($item['fuente'] ?? $item['nombre'] ?? '');
            if (str_contains($key, 'bcv') || str_contains($key, 'oficial')) {
                $rates['bcv'] = $item;
            } elseif (str_contains($key, 'paralelo') || str_contains($key, 'promedio')) {
                $rates['paralelo'] = $item;
            }
        }
    }

    if (empty($rates)) {
        return [
            'bcv'      => ['nombre' => 'BCV', 'promedio' => 36.50, 'fechaActualizacion' => date('Y-m-d')],
            'paralelo' => ['nombre' => 'Paralelo', 'promedio' => 38.00, 'fechaActualizacion' => date('Y-m-d')],
        ];
    }

    $cache = $rates;
    $cacheTime = time();
    return $rates;
}

function convertUSDtoBS(float $usd, string $type = 'bcv'): array {
    $rates = getExchangeRates();
    $rate = $rates[$type]['promedio'] ?? 36.50;
    return [
        'usd'   => $usd,
        'bs'    => round($usd * $rate, 2),
        'rate'  => $rate,
        'type'  => $type,
        'fecha' => $rates[$type]['fechaActualizacion'] ?? date('Y-m-d'),
    ];
}
