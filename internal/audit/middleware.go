package audit

import (
	"net/http"
	"regexp"
	"strings"

	"coresdashboard/internal/middleware"
)

// resourceIDPattern extracts numeric IDs from URL paths like /api/v1/admin/customers/123
var resourceIDPattern = regexp.MustCompile(`/(\d+)(?:[/?].*)?$`)

// AuditMiddleware wraps an http.Handler and logs every request as an audit event.
// resource is a human-readable name like "customer", "job", "invoice", etc.
func AuditMiddleware(logger *AuditLogger, resource string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Wrap response writer to capture status code
			arw := &auditResponseWriter{ResponseWriter: w, statusCode: http.StatusOK}
			next.ServeHTTP(arw, r)

			// Extract user info from JWT claims
			claims, ok := middleware.GetClaims(r)
			if !ok {
				return
			}

			// Determine action from HTTP method
			action := methodToAction(r.Method)

			// Extract resource_id from URL path
			resourceID := extractResourceID(r.URL.Path)

			details := map[string]interface{}{
				"method":      r.Method,
				"path":        r.URL.Path,
				"status_code": arw.statusCode,
			}
			if r.URL.RawQuery != "" {
				details["query"] = r.URL.RawQuery
			}

			// Log asynchronously to avoid blocking the response
			go logger.Log(r.Context(), int(claims.UserID), claims.Username, action, resource, resourceID, details)
		})
	}
}

// methodToAction maps HTTP methods to audit action strings.
func methodToAction(method string) string {
	switch method {
	case http.MethodPost:
		return "CREATE"
	case http.MethodPut, http.MethodPatch:
		return "UPDATE"
	case http.MethodDelete:
		return "DELETE"
	case http.MethodGet:
		return "READ"
	default:
		return method
	}
}

// extractResourceID pulls a numeric ID from the end of the URL path.
// e.g. /api/v1/admin/customers/123 → "123"
//       /api/v1/admin/branding → ""
func extractResourceID(path string) string {
	// Remove trailing slash
	path = strings.TrimSuffix(path, "/")
	match := resourceIDPattern.FindStringSubmatch(path)
	if len(match) >= 2 {
		return match[1]
	}
	return ""
}

// auditResponseWriter wraps http.ResponseWriter to capture the status code.
type auditResponseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (arw *auditResponseWriter) WriteHeader(code int) {
	arw.statusCode = code
	arw.ResponseWriter.WriteHeader(code)
}
