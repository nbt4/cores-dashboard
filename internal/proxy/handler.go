package proxy

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// Handler manages reverse-proxy routes to backend Cores services.
type Handler struct {
	rentalProxy    *httputil.ReverseProxy
	warehouseProxy *httputil.ReverseProxy
	plannerProxy   *httputil.ReverseProxy
}

// NewHandler creates reverse proxies for all backend services.
func NewHandler(rentalURL, warehouseURL, plannerURL string) *Handler {
	return &Handler{
		rentalProxy:    newReverseProxy(rentalURL, "/api/v1/rental"),
		warehouseProxy: newReverseProxy(warehouseURL, "/api/v1/warehouse"),
		plannerProxy:   newReverseProxy(plannerURL, "/api/v1/planner"),
	}
}

// newReverseProxy creates an httputil.ReverseProxy that strips the given prefix
// and forwards requests to the target backend, setting X-Forwarded-For and X-Real-IP.
func newReverseProxy(targetURL, stripPrefix string) *httputil.ReverseProxy {
	target, err := url.Parse(targetURL)
	if err != nil {
		log.Fatalf("proxy: invalid target URL %q: %v", targetURL, err)
	}

	proxy := httputil.NewSingleHostReverseProxy(target)

	// Store original director so we can wrap it
	origDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		origDirector(req)

		// Strip the service prefix from the path
		// e.g. /api/v1/rental/customers → /api/v1/customers
		req.URL.Path = strings.TrimPrefix(req.URL.Path, stripPrefix)
		if req.URL.Path == "" {
			req.URL.Path = "/"
		}

		// Set forwarded headers
		req.Header.Set("X-Forwarded-Host", req.Host)
		if clientIP := req.RemoteAddr; clientIP != "" {
			req.Header.Set("X-Real-IP", clientIP)
		}

		req.Host = target.Host
	}

	// Handle errors from the backend
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("proxy: backend error for %s: %v", r.URL.Path, err)
		http.Error(w, `{"error":"upstream unavailable"}`, http.StatusBadGateway)
	}

	// Modify responses to strip backend-specific headers if needed
	proxy.ModifyResponse = func(resp *http.Response) error {
		return nil
	}

	return proxy
}

// RentalProxy returns http.Handler for /api/v1/rental/* → rentalcore
func (h *Handler) RentalProxy() http.Handler {
	return h.rentalProxy
}

// WarehouseProxy returns http.Handler for /api/v1/warehouse/* → warehousecore
func (h *Handler) WarehouseProxy() http.Handler {
	return h.warehouseProxy
}

// PlannerProxy returns http.Handler for /api/v1/planner/* → plannercore
func (h *Handler) PlannerProxy() http.Handler {
	return h.plannerProxy
}
