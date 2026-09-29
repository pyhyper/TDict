<?php
// Sử dụng cơ sở dữ liệu SQLite nội bộ của project selection-translator.
$localDbPath = __DIR__ . '/data/dictionary_en_vi.sqlite';

return [
    'dictionary_db_path' => getenv('DICTIONARY_DB_PATH') ?: $localDbPath,
];
