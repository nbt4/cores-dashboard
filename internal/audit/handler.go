package audit

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"coresdashboard/internal/middleware"
)

// AuditHandler serves the GET /api/v1/admin/audit endpoint.
type AuditHandler struct {
	db *sql.DB
}

// NewAuditHandler creates a new AuditHandler.
func NewAuditHandler(db *sql.DB) *AuditHandler {
	return &AuditHandler{db: db}
}

// AuditEntry represents one row from the audit_log table.
type AuditEntry struct {
	ID         int64                  `json:"id"`
	UserID     int                    `json:"user_id"`
	Username   string                 `json:"username"`
	Action     string                 `json:"action"`
	Resource   string                 `json:"resource"`
	ResourceID *string                `json:"resource_id"`
	Details    map[string]interface{} `json:"details"`
	IPAddress  *string                `json:"ip_address"`
	CreatedAt  time.Time              `json:"created_at"`
}

// AuditResponse is the JSON response for the audit list endpoint.
type AuditResponse struct {
	Entries []AuditEntry `json:"entries"`
	Total   int          `json:"total"`
	Limit   int          `json:"limit"`
	Offset  int          `json:"offset"`
}

// ServeHTTP handles GET /api/v1/admin/audit.
// Query params: user_id, action, resource, limit (default 50), offset (default 0), format=csv
func (h *AuditHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := middleware.GetClaims(r)
	if !ok || !claims.IsAdmin {
		http.Error(w, `{"error":"Forbidden"}`, http.StatusForbidden)
		return
	}

	q := r.URL.Query()

	// Parse pagination
	limit := 50
	if l, err := strconv.Atoi(q.Get("limit")); err == nil && l > 0 && l <= 200 {
		limit = l
	}
	offset := 0
	if o, err := strconv.Atoi(q.Get("offset")); err == nil && o >= 0 {
		offset = o
	}

	// Build WHERE clause
	var conditions []string
	var args []interface{}
	argIdx := 1

	if uid := q.Get("user_id"); uid != "" {
		if id, err := strconv.Atoi(uid); err == nil {
			conditions = append(conditions, fmt.Sprintf("user_id = $%d", argIdx))
			args = append(args, id)
			argIdx++
		}
	}
	if action := q.Get("action"); action != "" {
		conditions = append(conditions, fmt.Sprintf("action = $%d", argIdx))
		args = append(args, strings.ToUpper(action))
		argIdx++
	}
	if resource := q.Get("resource"); resource != "" {
		conditions = append(conditions, fmt.Sprintf("resource = $%d", argIdx))
		args = append(args, resource)
		argIdx++
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Count total
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM audit_log %s", whereClause)
	var total int
	if err := h.db.QueryRowContext(r.Context(), countQuery, args...).Scan(&total); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "query failed"})
		return
	}

	// Check if CSV export requested
	if q.Get("format") == "csv" {
		h.exportCSV(w, r, whereClause, args, limit, offset)
		return
	}

	// Query entries
	dataQuery := fmt.Sprintf(
		"SELECT id, user_id, username, action, resource, resource_id, details, ip_address, created_at FROM audit_log %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d",
		whereClause, argIdx, argIdx+1,
	)
	queryArgs := append(args, limit, offset)

	rows, err := h.db.QueryContext(r.Context(), dataQuery, queryArgs...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "query failed"})
		return
	}
	defer rows.Close()

	var entries []AuditEntry
	for rows.Next() {
		var e AuditEntry
		var detailsJSON []byte
		if err := rows.Scan(&e.ID, &e.UserID, &e.Username, &e.Action, &e.Resource, &e.ResourceID, &detailsJSON, &e.IPAddress, &e.CreatedAt); err != nil {
			continue
		}
		if detailsJSON != nil {
			json.Unmarshal(detailsJSON, &e.Details)
		} else {
			e.Details = map[string]interface{}{}
		}
		entries = append(entries, e)
	}

	if entries == nil {
		entries = []AuditEntry{}
	}

	resp := AuditResponse{
		Entries: entries,
		Total:   total,
		Limit:   limit,
		Offset:  offset,
	}

	writeJSON(w, http.StatusOK, resp)
}

// exportCSV writes audit log entries as CSV.
func (h *AuditHandler) exportCSV(w http.ResponseWriter, r *http.Request, whereClause string, args []interface{}, limit, offset int) {
	dataQuery := fmt.Sprintf(
		"SELECT id, user_id, username, action, resource, resource_id, details, ip_address, created_at FROM audit_log %s ORDER BY created_at DESC",
		whereClause,
	)

	rows, err := h.db.QueryContext(r.Context(), dataQuery, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "query failed"})
		return
	}
	defer rows.Close()

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=audit_log.csv")

	cw := csv.NewWriter(w)
	defer cw.Flush()

	// Header
	cw.Write([]string{"ID", "User ID", "Username", "Action", "Resource", "Resource ID", "Details", "IP Address", "Created At"})

	for rows.Next() {
		var e AuditEntry
		var detailsJSON []byte
		if err := rows.Scan(&e.ID, &e.UserID, &e.Username, &e.Action, &e.Resource, &e.ResourceID, &detailsJSON, &e.IPAddress, &e.CreatedAt); err != nil {
			continue
		}

		detailsStr := "{}"
		if detailsJSON != nil {
			detailsStr = string(detailsJSON)
		}

		rid := ""
		if e.ResourceID != nil {
			rid = *e.ResourceID
		}

		ip := ""
		if e.IPAddress != nil {
			ip = *e.IPAddress
		}

		cw.Write([]string{
			strconv.FormatInt(e.ID, 10),
			strconv.Itoa(e.UserID),
			e.Username,
			e.Action,
			e.Resource,
			rid,
			detailsStr,
			ip,
			e.CreatedAt.Format(time.RFC3339),
		})
	}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
