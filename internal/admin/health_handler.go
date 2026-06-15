package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"coresdashboard/internal/config"
	"coresdashboard/internal/middleware"

	"gorm.io/gorm"
)

// HealthHandler serves the admin-only service health dashboard endpoint.
type HealthHandler struct {
	cfg    *config.Config
	db     *gorm.DB
	client *http.Client
}

// NewHealthHandler creates a new HealthHandler.
func NewHealthHandler(cfg *config.Config, db *gorm.DB) *HealthHandler {
	return &HealthHandler{
		cfg: cfg,
		db:  db,
		client: &http.Client{
			Timeout: 3 * time.Second,
		},
	}
}

// serviceTarget maps a service name to its health URL.
type serviceTarget struct {
	name string
	url  string
}

// HealthResponse is the JSON body returned by each service's /health endpoint.
type HealthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

// AggregatedHealth is the response for GET /api/v1/admin/health.
type AggregatedHealth struct {
	CoresDashboard   ServiceHealth `json:"cores-dashboard"`
	RentalCore       ServiceHealth `json:"rentalcore"`
	WarehouseCore    ServiceHealth `json:"warehousecore"`
	PlannerCore      ServiceHealth `json:"plannercore"`
	Database         ServiceHealth `json:"database"`
	Timestamp        string        `json:"timestamp"`
}

// ServiceHealth represents the health status of a single service.
type ServiceHealth struct {
	Status  string `json:"status"`
	Version string `json:"version,omitempty"`
	Error   string `json:"error,omitempty"`
}

// VERSION is the cores-dashboard version string.
const VERSION = "2.1.0"

// ServeHTTP handles GET /api/v1/admin/health (admin-only).
func (h *HealthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// Verify admin access via RequireAdmin middleware — this handler is
	// expected to be wrapped with RequireAdmin in main.go, but we also
	// do a double-check here.
	claims, ok := middleware.GetClaims(r)
	if !ok || !claims.IsAdmin {
		http.Error(w, `{"error":"Forbidden"}`, http.StatusForbidden)
		return
	}

	agg := AggregatedHealth{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	// cores-dashboard is always ok (we're serving this request)
	agg.CoresDashboard = ServiceHealth{
		Status:  "ok",
		Version: VERSION,
	}

	// Build list of external services to check
	services := []serviceTarget{
		{"rentalcore", h.cfg.RentalCoreURL + "/health"},
		{"warehousecore", h.cfg.WarehouseCoreURL + "/health"},
		{"plannercore", h.cfg.PlannercoreURL + "/health"},
	}

	// Check all services concurrently
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, svc := range services {
		wg.Add(1)
		go func(svc serviceTarget) {
			defer wg.Done()
			sh := h.checkService(svc.name, svc.url)
			mu.Lock()
			switch svc.name {
			case "rentalcore":
				agg.RentalCore = sh
			case "warehousecore":
				agg.WarehouseCore = sh
			case "plannercore":
				agg.PlannerCore = sh
			}
			mu.Unlock()
		}(svc)
	}

	// Check database while waiting for services
	wg.Add(1)
	go func() {
		defer wg.Done()
		dbHealth := h.checkDatabase()
		mu.Lock()
		agg.Database = dbHealth
		mu.Unlock()
	}()

	wg.Wait()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(agg)
}

func (h *HealthHandler) checkService(name, url string) ServiceHealth {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return ServiceHealth{
			Status: "error",
			Error:  fmt.Sprintf("request creation failed: %v", err),
		}
	}

	resp, err := h.client.Do(req)
	if err != nil {
		return ServiceHealth{
			Status: "unreachable",
			Error:  fmt.Sprintf("%v", err),
		}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ServiceHealth{
			Status: "error",
			Error:  fmt.Sprintf("HTTP %d", resp.StatusCode),
		}
	}

	var hr HealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&hr); err != nil {
		return ServiceHealth{
			Status: "degraded",
			Error:  fmt.Sprintf("invalid JSON response: %v", err),
		}
	}

	status := hr.Status
	if status == "" {
		status = "ok"
	}

	return ServiceHealth{
		Status:  status,
		Version: hr.Version,
	}
}

func (h *HealthHandler) checkDatabase() ServiceHealth {
	sqlDB, err := h.db.DB()
	if err != nil {
		return ServiceHealth{
			Status: "error",
			Error:  fmt.Sprintf("cannot get underlying DB: %v", err),
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := sqlDB.PingContext(ctx); err != nil {
		return ServiceHealth{
			Status: "unreachable",
			Error:  fmt.Sprintf("ping failed: %v", err),
		}
	}

	return ServiceHealth{
		Status: "ok",
	}
}
