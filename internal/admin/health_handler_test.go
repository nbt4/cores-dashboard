package admin

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthChecksCoverMCPAndBroker(t *testing.T) {
	mcp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","version":"1.5.0"}`))
	}))
	defer mcp.Close()

	h := &HealthHandler{client: mcp.Client()}
	service := h.checkService(context.Background(), "cores-mcp", mcp.URL)
	if service.Status != "ok" || service.Version != "1.5.0" {
		t.Fatalf("MCP health = %+v", service)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	address := listener.Addr().String()
	broker := h.checkTCPService(context.Background(), address)
	if broker.Status != "ok" {
		t.Fatalf("broker health = %+v", broker)
	}
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	broker = h.checkTCPService(context.Background(), address)
	if broker.Status != "unreachable" {
		t.Fatalf("closed broker must be unreachable: %+v", broker)
	}
}
