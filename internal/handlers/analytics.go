package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"coresdashboard/internal/admin"
	"coresdashboard/internal/config"

	"github.com/rs/zerolog"
)

var analyticsLog = zerolog.New(os.Stderr).With().Timestamp().Str("component", "analytics").Logger()

type AnalyticsHandler struct {
	cfg    *config.Config
	health *admin.HealthHandler
	client *http.Client
}

type plannerTask struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	Priority  string     `json:"priority"`
	Progress  int        `json:"progress"`
	Status    string     `json:"status"`
	IsLate    bool       `json:"isLate"`
	DueDate   *time.Time `json:"dueDate"`
	PlanID    string     `json:"planId"`
	Completed *time.Time `json:"completedAt"`
}

func NewAnalyticsHandler(cfg *config.Config, health *admin.HealthHandler) *AnalyticsHandler {
	return &AnalyticsHandler{
		cfg:    cfg,
		health: health,
		client: &http.Client{Timeout: 5 * time.Second},
	}
}

// Summary aggregates operational data from every Core for the central cockpit.
// GET /api/v1/analytics/summary
func (h *AnalyticsHandler) Summary(w http.ResponseWriter, r *http.Request) {
	token := ""
	if c, err := r.Cookie("cores_token"); err == nil {
		token = c.Value
	}

	var rental, warehouse, warehouseOverview, maintenance, planner, procurement map[string]any
	var services admin.AggregatedHealth
	var wg sync.WaitGroup
	run := func(target *map[string]any, fetch func(context.Context, string) map[string]any) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			*target = fetch(r.Context(), token)
		}()
	}

	run(&rental, h.fetchRental)
	run(&warehouse, h.fetchWarehouse)
	run(&warehouseOverview, h.fetchWarehouseOverview)
	run(&maintenance, h.fetchMaintenance)
	run(&planner, h.fetchPlanner)
	run(&procurement, h.fetchProcurement)
	wg.Add(1)
	go func() {
		defer wg.Done()
		services = h.health.Collect(r.Context())
	}()
	wg.Wait()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"rental":            rental,
		"warehouse":         warehouse,
		"warehouseOverview": warehouseOverview,
		"maintenance":       maintenance,
		"planner":           planner,
		"procurement":       procurement,
		"services":          services,
		"timestamp":         time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *AnalyticsHandler) fetchRental(ctx context.Context, token string) map[string]any {
	return h.fetchMap(ctx, h.cfg.RentalCoreURL+"/api/v1/analytics/revenue?period=30days", token, "rental")
}

func (h *AnalyticsHandler) fetchWarehouse(ctx context.Context, token string) map[string]any {
	return h.fetchMap(ctx, h.cfg.WarehouseCoreURL+"/api/v1/dashboard/stats", token, "warehouse")
}

func (h *AnalyticsHandler) fetchWarehouseOverview(ctx context.Context, token string) map[string]any {
	return h.fetchMap(ctx, h.cfg.WarehouseCoreURL+"/api/v1/warehouse/overview", token, "warehouse overview")
}

func (h *AnalyticsHandler) fetchMaintenance(ctx context.Context, token string) map[string]any {
	return h.fetchMap(ctx, h.cfg.WarehouseCoreURL+"/api/v1/maintenance/stats", token, "maintenance")
}

func (h *AnalyticsHandler) fetchProcurement(ctx context.Context, token string) map[string]any {
	return h.fetchMap(ctx, h.cfg.ProcurementCoreURL+"/api/v1/dashboard", token, "procurement")
}

func (h *AnalyticsHandler) fetchPlanner(ctx context.Context, token string) map[string]any {
	var tasks []plannerTask
	if err := h.fetchJSON(ctx, h.cfg.PlannercoreURL+"/api/v1/planner/my/tasks", token, &tasks); err != nil {
		analyticsLog.Error().Err(err).Msg("planner fetch error")
		return map[string]any{"error": "unavailable"}
	}

	now := time.Now()
	today := now.Format("2006-01-02")
	openTasks, overdue, dueToday, inProgress := 0, 0, 0, 0
	priorities := make([]map[string]any, 0, 5)
	for _, task := range tasks {
		if task.Completed != nil || task.Status == "completed" {
			continue
		}
		openTasks++
		if task.IsLate || (task.DueDate != nil && task.DueDate.Before(now)) {
			overdue++
		}
		if task.DueDate != nil && task.DueDate.Format("2006-01-02") == today {
			dueToday++
		}
		if task.Status == "in-progress" || task.Progress > 0 {
			inProgress++
		}
		if len(priorities) < 5 && (task.IsLate || task.Priority == "urgent" || task.Priority == "high") {
			priorities = append(priorities, map[string]any{
				"id": task.ID, "planId": task.PlanID, "title": task.Title,
				"priority": task.Priority, "progress": task.Progress,
				"isLate": task.IsLate, "dueDate": task.DueDate,
			})
		}
	}
	return map[string]any{
		"openTasks": openTasks, "overdue": overdue, "dueToday": dueToday,
		"inProgress": inProgress, "priorities": priorities,
	}
}

func (h *AnalyticsHandler) fetchMap(ctx context.Context, url, token, component string) map[string]any {
	var result map[string]any
	if err := h.fetchJSON(ctx, url, token, &result); err != nil {
		analyticsLog.Error().Err(err).Str("upstream", component).Msg("analytics fetch error")
		return map[string]any{"error": "unavailable"}
	}
	return result
}

func (h *AnalyticsHandler) fetchJSON(ctx context.Context, url, token string, target any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	if strings.TrimSpace(token) != "" {
		req.AddCookie(&http.Cookie{Name: "cores_token", Value: token})
	}
	resp, err := h.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("upstream returned %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		return fmt.Errorf("invalid upstream response: %w", err)
	}
	return nil
}
