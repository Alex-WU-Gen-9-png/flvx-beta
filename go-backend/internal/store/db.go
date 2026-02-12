// Package store provides a thin dialect-aware wrapper around database/sql,
// enabling transparent use of both SQLite and PostgreSQL.
package store

import (
	"database/sql"
	"fmt"
	"strings"
)

// Dialect identifies the underlying database engine.
type Dialect int

const (
	DialectSQLite Dialect = iota
	DialectPostgres
)

// String returns a human-readable dialect name.
func (d Dialect) String() string {
	switch d {
	case DialectSQLite:
		return "sqlite"
	case DialectPostgres:
		return "postgres"
	default:
		return "unknown"
	}
}

// DB wraps *sql.DB with dialect awareness.
type DB struct {
	raw     *sql.DB
	dialect Dialect
}

// Wrap creates a new dialect-aware DB from an existing *sql.DB.
func Wrap(raw *sql.DB, dialect Dialect) *DB {
	return &DB{raw: raw, dialect: dialect}
}

// Dialect returns the database dialect.
func (db *DB) Dialect() Dialect {
	if db == nil {
		return DialectSQLite
	}
	return db.dialect
}

// RawDB returns the underlying *sql.DB.
func (db *DB) RawDB() *sql.DB {
	if db == nil {
		return nil
	}
	return db.raw
}

// Close closes the underlying connection.
func (db *DB) Close() error {
	if db == nil || db.raw == nil {
		return nil
	}
	return db.raw.Close()
}

// Ping verifies the connection is alive.
func (db *DB) Ping() error {
	return db.raw.Ping()
}

// Exec executes a query with transparent placeholder and syntax rewriting.
func (db *DB) Exec(query string, args ...any) (sql.Result, error) {
	return db.raw.Exec(db.rewrite(query), args...)
}

// Query executes a query that returns rows, with transparent rewriting.
func (db *DB) Query(query string, args ...any) (*sql.Rows, error) {
	return db.raw.Query(db.rewrite(query), args...)
}

// QueryRow executes a query that returns at most one row, with transparent rewriting.
func (db *DB) QueryRow(query string, args ...any) *sql.Row {
	return db.raw.QueryRow(db.rewrite(query), args...)
}

// Begin starts a transaction, returning a dialect-aware Tx.
func (db *DB) Begin() (*Tx, error) {
	tx, err := db.raw.Begin()
	if err != nil {
		return nil, err
	}
	return &Tx{raw: tx, dialect: db.dialect}, nil
}

// ExecReturningID executes an INSERT and returns the auto-generated id.
//   - SQLite: uses LastInsertId()
//   - PostgreSQL: appends RETURNING id and uses QueryRow().Scan()
func (db *DB) ExecReturningID(query string, args ...any) (int64, error) {
	q := db.rewrite(query)
	if db.dialect == DialectPostgres {
		q = strings.TrimRight(q, "; \t\n") + " RETURNING id"
		var id int64
		if err := db.raw.QueryRow(q, args...).Scan(&id); err != nil {
			return 0, err
		}
		return id, nil
	}
	res, err := db.raw.Exec(q, args...)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// Tx wraps *sql.Tx with dialect awareness.
type Tx struct {
	raw     *sql.Tx
	dialect Dialect
}

// Exec executes a query inside the transaction with transparent rewriting.
func (tx *Tx) Exec(query string, args ...any) (sql.Result, error) {
	return tx.raw.Exec(rewriteQuery(tx.dialect, query), args...)
}

// Query executes a query that returns rows inside the transaction.
func (tx *Tx) Query(query string, args ...any) (*sql.Rows, error) {
	return tx.raw.Query(rewriteQuery(tx.dialect, query), args...)
}

// QueryRow executes a query that returns at most one row inside the transaction.
func (tx *Tx) QueryRow(query string, args ...any) *sql.Row {
	return tx.raw.QueryRow(rewriteQuery(tx.dialect, query), args...)
}

// Commit commits the transaction.
func (tx *Tx) Commit() error { return tx.raw.Commit() }

// Rollback aborts the transaction.
func (tx *Tx) Rollback() error { return tx.raw.Rollback() }

// ExecReturningID executes an INSERT inside the transaction and returns the id.
func (tx *Tx) ExecReturningID(query string, args ...any) (int64, error) {
	q := rewriteQuery(tx.dialect, query)
	if tx.dialect == DialectPostgres {
		q = strings.TrimRight(q, "; \t\n") + " RETURNING id"
		var id int64
		if err := tx.raw.QueryRow(q, args...).Scan(&id); err != nil {
			return 0, err
		}
		return id, nil
	}
	res, err := tx.raw.Exec(q, args...)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (db *DB) rewrite(query string) string {
	return rewriteQuery(db.dialect, query)
}

func rewriteQuery(dialect Dialect, query string) string {
	if dialect != DialectPostgres {
		return query
	}
	query = rewriteUserIdentifier(query)
	query = rewriteInsertOrIgnore(query)
	query = rewritePlaceholders(query)
	return query
}

func rewriteUserIdentifier(query string) string {
	var buf strings.Builder
	buf.Grow(len(query) + 16)
	inSingle := false
	inDouble := false
	i := 0
	for i < len(query) {
		ch := query[i]
		if ch == '\'' && !inDouble {
			if inSingle && i+1 < len(query) && query[i+1] == '\'' {
				buf.WriteByte(ch)
				buf.WriteByte(query[i+1])
				i += 2
				continue
			}
			inSingle = !inSingle
			buf.WriteByte(ch)
			i++
			continue
		}
		if ch == '"' && !inSingle {
			inDouble = !inDouble
			buf.WriteByte(ch)
			i++
			continue
		}
		if inSingle || inDouble {
			buf.WriteByte(ch)
			i++
			continue
		}

		if isIdentifierChar(ch) {
			j := i + 1
			for j < len(query) && isIdentifierChar(query[j]) {
				j++
			}
			tok := query[i:j]
			if strings.EqualFold(tok, "user") {
				buf.WriteString(`"user"`)
			} else {
				buf.WriteString(tok)
			}
			i = j
			continue
		}

		buf.WriteByte(ch)
		i++
	}
	return buf.String()
}

func isIdentifierChar(ch byte) bool {
	if ch >= 'a' && ch <= 'z' {
		return true
	}
	if ch >= 'A' && ch <= 'Z' {
		return true
	}
	if ch >= '0' && ch <= '9' {
		return true
	}
	return ch == '_'
}

func rewriteInsertOrIgnore(query string) string {
	upper := strings.ToUpper(query)
	idx := strings.Index(upper, "INSERT OR IGNORE INTO")
	if idx < 0 {
		return query
	}
	prefix := query[:idx]
	suffix := query[idx+len("INSERT OR IGNORE INTO"):]
	result := prefix + "INSERT INTO" + suffix

	trimmed := strings.TrimRight(result, "; \t\n")
	return trimmed + " ON CONFLICT DO NOTHING"
}

func rewritePlaceholders(query string) string {
	var buf strings.Builder
	buf.Grow(len(query) + 16)
	n := 1
	inString := false
	for i := 0; i < len(query); i++ {
		ch := query[i]
		if ch == '\'' {
			if inString && i+1 < len(query) && query[i+1] == '\'' {
				buf.WriteByte(ch)
				buf.WriteByte(query[i+1])
				i++
				continue
			}
			inString = !inString
			buf.WriteByte(ch)
			continue
		}
		if ch == '?' && !inString {
			buf.WriteString(fmt.Sprintf("$%d", n))
			n++
			continue
		}
		buf.WriteByte(ch)
	}
	return buf.String()
}
