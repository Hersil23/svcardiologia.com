<?php
/**
 * SVC App — Exchange Rates API (public endpoint)
 */

require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/currency.php';

$rates = getExchangeRates();

$amounts = [50, 100, 150, 200];
$conversions = [];

foreach ($amounts as $usd) {
    $conversions[$usd] = [
        'usd'      => $usd,
        'bcv'      => convertUSDtoBS($usd, 'bcv'),
        'usdt'     => convertUSDtoBS($usd, 'paralelo'),
    ];
}

respond([
    'rates'       => $rates,
    'conversions' => $conversions,
    'updated_at'  => date('Y-m-d H:i:s'),
]);
