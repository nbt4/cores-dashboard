package handlers

import (
	"io"
	"net/http"
	"strings"
	"time"

	"coresdashboard/internal/config"
)

type AdminProxyHandler struct {
	cfg    *config.Config
	client *http.Client
}

func NewAdminProxyHandler(cfg *config.Config) *AdminProxyHandler {
	return &AdminProxyHandler{
		cfg:    cfg,
		client: &http.Client{Timeout: 15 * time.Second},
	}
}

// ProxyRental forwards /api/v1/proxy/rental/api/v1/... → rentalcore:8081/api/v1/...
func (h *AdminProxyHandler) ProxyRental(w http.ResponseWriter, r *http.Request) {
	target := strings.TrimPrefix(r.URL.Path, "/api/v1/proxy/rental")
	h.proxy(w, r, h.cfg.RentalCoreURL+target)
}

// ProxyWarehouse forwards /api/v1/proxy/warehouse/api/v1/... → warehousecore:8082/api/v1/...
func (h *AdminProxyHandler) ProxyWarehouse(w http.ResponseWriter, r *http.Request) {
	target := strings.TrimPrefix(r.URL.Path, "/api/v1/proxy/warehouse")
	h.proxy(w, r, h.cfg.WarehouseCoreURL+target)
}

// ProxyPlanner forwards both /api/v1/planner/* and /api/v1/proxy/planner/* → plannercore:8080
func (h *AdminProxyHandler) ProxyPlanner(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	// Admin proxy: /api/v1/proxy/planner/* → /api/v1/planner/*
	if strings.HasPrefix(path, "/api/v1/proxy/planner") {
		remaining := strings.TrimPrefix(path, "/api/v1/proxy/planner")
		if remaining == "" {
			remaining = "/"
		}
		path = "/api/v1/planner" + remaining
	}
	// Direct proxy: /api/v1/planner/* → forward as-is
	h.proxy(w, r, h.cfg.PlannercoreURL+path)
}

// ProxyPlannerSpa forwards /planner/* → plannercore:8080/* (serves Plannercore frontend)
func (h *AdminProxyHandler) ProxyPlannerSpa(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/planner")
	if path == "" {
		path = "/"
	}
	// Also pass query string
	target := h.cfg.PlannercoreURL + path
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}
	h.serveSPAProxy(w, r, target)
}

func (h *AdminProxyHandler) serveSPAProxy(w http.ResponseWriter, r *http.Request, targetURL string) {
	req, err := http.NewRequest(r.Method, targetURL, r.Body)
	if err != nil {
		http.Error(w, `{"error":"proxy error"}`, http.StatusBadGateway)
		return
	}

	req.Header.Set("Content-Type", r.Header.Get("Content-Type"))
	// Forward cookies for auth
	for _, c := range r.Cookies() {
		req.AddCookie(c)
	}

	resp, err := h.client.Do(req)
	if err != nil {
		http.Error(w, `{"error":"upstream unavailable"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func (h *AdminProxyHandler) proxy(w http.ResponseWriter, r *http.Request, targetURL string) {
	if r.URL.RawQuery != "" {
		targetURL += "?" + r.URL.RawQuery
	}

	req, err := http.NewRequest(r.Method, targetURL, r.Body)
	if err != nil {
		http.Error(w, `{"error":"proxy error"}`, http.StatusBadGateway)
		return
	}

	// Forward content-type and authorization headers
	req.Header.Set("Content-Type", r.Header.Get("Content-Type"))

	// Forward cores_token cookie so cores accept the request
	if c, err := r.Cookie("cores_token"); err == nil {
		req.AddCookie(c)
	}

	resp, err := h.client.Do(req)
	if err != nil {
		http.Error(w, `{"error":"upstream unavailable"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}
