CREATE TABLE mapping_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value TEXT NOT NULL,
    createdAt INTEGER NOT NULL DEFAULT(strftime ('%s', 'now'))
);