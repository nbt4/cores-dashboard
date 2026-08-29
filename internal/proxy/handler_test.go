package proxy

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAppProxiesStripMountAndForwardPrefix(t *testing.T) {
	for _, mount := range []string{"/rentalcore", "/warehousecore", "/plannercore", "/procurementcore"} {
		t.Run(mount, func(t *testing.T) {
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/api/v1/auth/me" {
					t.Fatalf("upstream path = %q, want %q", r.URL.Path, "/api/v1/auth/me")
				}
				if prefix := r.Header.Get("X-Forwarded-Prefix"); prefix != mount {
					t.Fatalf("X-Forwarded-Prefix = %q, want %q", prefix, mount)
				}
				w.WriteHeader(http.StatusNoContent)
			}))
			defer upstream.Close()

			handlerSet := NewHandler(upstream.URL, upstream.URL, upstream.URL, upstream.URL)
			handlers := map[string]http.Handler{
				"/rentalcore":      handlerSet.RentalAppProxy(),
				"/warehousecore":   handlerSet.WarehouseAppProxy(),
				"/plannercore":     handlerSet.PlannerAppProxy(),
				"/procurementcore": handlerSet.ProcurementAppProxy(),
			}
			request := httptest.NewRequest(http.MethodGet, mount+"/api/v1/auth/me", nil)
			response := httptest.NewRecorder()

			handlers[mount].ServeHTTP(response, request)

			if response.Code != http.StatusNoContent {
				t.Fatalf("status = %d, want %d", response.Code, http.StatusNoContent)
			}
		})
	}
}

func TestRentalAppProxyKeepsRedirectInsideMount(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", "/login")
		w.WriteHeader(http.StatusTemporaryRedirect)
	}))
	defer upstream.Close()

	handler := NewHandler(upstream.URL, upstream.URL, upstream.URL, upstream.URL).RentalAppProxy()
	request := httptest.NewRequest(http.MethodGet, "/rentalcore/private", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if location := response.Header().Get("Location"); location != "/rentalcore/login" {
		t.Fatalf("Location = %q, want %q", location, "/rentalcore/login")
	}
}
