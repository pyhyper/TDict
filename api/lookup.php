<?php
// PHP 8+ with ext-sqlite3. This endpoint never creates or writes a database.
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respond(int $status, array $body): void {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET, OPTIONS');
    respond(405, ['error' => 'method_not_allowed']);
}
if (isset($_GET['check']) || isset($_GET['health'])) {
    $config = require dirname(__DIR__) . '/config.php';
    $path = getenv('DICTIONARY_DB_PATH') ?: ($config['dictionary_db_path'] ?? '');
    $sqliteExt = extension_loaded('sqlite3');
    $fileExists = is_file($path);
    $fileReadable = is_readable($path);
    $canConnect = false;
    $wordCount = 0;
    $err = null;
    if ($sqliteExt && $fileExists && $fileReadable) {
        try {
            $testDb = new SQLite3($path, SQLITE3_OPEN_READONLY);
            $wordCount = (int)$testDb->querySingle('SELECT count(*) FROM words');
            $canConnect = true;
            $testDb->close();
        } catch (Throwable $e) {
            $err = $e->getMessage();
        }
    }
    respond($canConnect ? 200 : 503, [
        'status' => $canConnect ? 'ok' : 'error',
        'php_version' => PHP_VERSION,
        'sqlite3_loaded' => $sqliteExt,
        'db_path' => $path,
        'file_exists' => $fileExists,
        'file_readable' => $fileReadable,
        'can_connect' => $canConnect,
        'word_count' => $wordCount,
        'error_detail' => $err,
    ]);
}
$q = $_GET['q'] ?? '';
if (!is_string($q) || !preg_match('//u', $q) || strlen($q) > 500 || trim($q) === '') {
    respond(400, ['error' => 'invalid_query']);
}
$q = preg_replace('/\s+/u', ' ', trim($q));
// Strip surrounding sentence punctuation; preserve apostrophes/hyphens inside words.
$q = preg_replace('/^[\s\p{P}]+|[\s\p{P}]+$/u', '', $q);
$q = strtr(strtolower($q), ['’' => "'", '‘' => "'"]);
if ($q === '') respond(400, ['error' => 'invalid_query']);
try {
    $config = require dirname(__DIR__) . '/config.php';
    $path = getenv('DICTIONARY_DB_PATH') ?: $config['dictionary_db_path'];
    if (!is_file($path) || !is_readable($path)) throw new RuntimeException('Dictionary unavailable');
    $db = new SQLite3($path, SQLITE3_OPEN_READONLY);
    $db->enableExceptions(true);
    $db->busyTimeout(1200);
    $statement = $db->prepare('SELECT id, word, phonetic_uk, phonetic_us, cefr_level, audio_url FROM words WHERE word = :word COLLATE NOCASE LIMIT 1');
    $statement->bindValue(':word', $q, SQLITE3_TEXT);
    $result = $statement->execute();
    $entry = $result->fetchArray(SQLITE3_ASSOC);
    $result->finalize();
    $statement->close();
    if (!$entry) { $db->close(); respond(200, ['found' => false, 'entry' => null]); }
    $statement = $db->prepare('SELECT part_of_speech, definition_en, definition_vi, example_en, example_vi, synonyms FROM definitions WHERE word_id = :id ORDER BY id');
    $statement->bindValue(':id', $entry['id'], SQLITE3_INTEGER);
    $result = $statement->execute();
    $entry['definitions'] = [];
    while ($definition = $result->fetchArray(SQLITE3_ASSOC)) {
        $synonyms = json_decode($definition['synonyms'] ?? '[]', true);
        $definition['synonyms'] = is_array($synonyms) ? array_values(array_filter($synonyms, 'is_string')) : [];
        $entry['definitions'][] = $definition;
    }
    $result->finalize();
    $statement->close();
    $db->close();
    respond(200, ['found' => true, 'entry' => $entry]);
} catch (Throwable $error) {
    error_log('Selection dictionary lookup unavailable: ' . $error->getMessage());
    respond(503, ['error' => 'dictionary_unavailable']);
}
