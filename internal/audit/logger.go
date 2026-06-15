package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// AuditLogger writes audit events to the audit_log table.
type AuditLogger struct {
	db *sql.DB
}

// NewAuditLogger creates a new AuditLogger backed by the given *sql.DB.
func NewAuditLogger(db *sql.DB) *AuditLogger {
	return &AuditLogger{db: db}
}

// Log inserts an audit event into audit_log.
func (a *AuditLogger) Log(ctx context.Context, userID int, username, action, resource, resourceID string, details map[string]interface{}) {
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		detailsJSON = []byte("{}")
	}

	query := `INSERT INTO audit_log (user_id, username, action, resource, resource_id, details, ip_address, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`

	// Extract IP from context if available
	ip := ""
	if v := ctx.Value("ip_address"); v != nil {
		if s, ok := v.(string); ok {
			ip = s
		}
	}

	if ctx.Err() != nil {
		// Context already cancelled, use a fresh one with timeout
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
	}

	_, _ = a.db.ExecContext(ctx, query, userID, username, action, resource, resourceID, detailsJSON, ip, time.Now().UTC())
}
