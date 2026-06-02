// File: cores-dashboard/internal/handlers/analytics.go
package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"coresdashboard/internal/config"
)

type AnalyticsHandler struct {
	cfg    *config.Config
	client *http.Client
}

func NewAnalyticsHandler(cfg *config.Config) *AnalyticsHandler {
	return &AnalyticsHandler{
		cfg:    cfg,
		client: &http.Client{Timeout: 5 * time.Second},
	}
}

// Summary aggregates data from both cores for the dashboard overview.
// GET /api/v1/analytics/summary
func (h *AnalyticsHandler) Summary(w http.ResponseWriter, r *http.Request) {
	token := ""
	if c, err := r.Cookie("cores_token"); err == nil {
		token = c.Value
	}

	rental := h.fetchRental(token)
	warehouse := h.fetchWarehouse(token)
	maintenance := h.fetchMaintenance(token)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"rental":      rental,
		"warehouse":   warehouse,
		"maintenance": maintenance,
	})
}

func (h *AnalyticsHandler) fetchRental(token string) map[string]interface{} {
	url := h.cfg.RentalCoreURL + "/api/v1/analytics/revenue?period=30days"
	data, err := h.fetchWithToken(url, token)
	if err != nil {
		log.Printf("analytics: rental fetch error: %v", err)
		return map[string]interface{}{"error": "unavailable"}
	}
	return data
}

func (h *AnalyticsHandler) fetchWarehouse(token string) map[string]interface{} {
	url := h.cfg.WarehouseCoreURL + "/api/v1/dashboard/stats"
	data, err := h.fetchWithToken(url, token)
	if err != nil {
		log.Printf("analytics: warehouse fetch error: %v", err)
		return map[string]interface{}{"error": "unavailable"}
	}
	return data
}

func (h *AnalyticsHandler) fetchMaintenance(token string) map[string]interface{} {
	url := h.cfg.WarehouseCoreURL + "/api/v1/maintenance/stats"
	data, err := h.fetchWithToken(url, token)
	if err != nil {
		log.Printf("analytics: maintenance fetch error: %v", err)
		return map[string]interface{}{"error": "unavailable"}
	}
	return data
}

func (h *AnalyticsHandler) fetchWithToken(url, token string) (map[string]interface{}, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if token != "" {
		req.AddCookie(&http.Cookie{Name: "cores_token", Value: token})
	}
	resp, err := h.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("upstream returned %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)
	return result, nil
}
