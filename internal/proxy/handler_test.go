package proxy

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRentalAppProxyStripsMountAndForwardsPrefix(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/auth/me" {
			t.Fatalf("upstream path = %q, want %q", r.URL.Path, "/api/v1/auth/me")
		}
		if prefix := r.Header.Get("X-Forwarded-Prefix"); prefix != "/rental" {
			t.Fatalf("X-Forwarded-Prefix = %q, want %q", prefix, "/rental")
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer upstream.Close()

	handler := NewHandler(upstream.URL, upstream.URL, upstream.URL).RentalAppProxy()
	request := httptest.NewRequest(http.MethodGet, "/rental/api/v1/auth/me", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNoContent)
	}
}

func TestRentalAppProxyKeepsRedirectInsideMount(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", "/login")
		w.WriteHeader(http.StatusTemporaryRedirect)
	}))
	defer upstream.Close()

	handler := NewHandler(upstream.URL, upstream.URL, upstream.URL).RentalAppProxy()
	request := httptest.NewRequest(http.MethodGet, "/rental/private", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if location := response.Header().Get("Location"); location != "/rental/login" {
		t.Fatalf("Location = %q, want %q", location, "/rental/login")
	}
}
