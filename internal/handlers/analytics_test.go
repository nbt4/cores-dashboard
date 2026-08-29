package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"coresdashboard/internal/config"
)

func TestFetchPlannerBuildsOperationalSummary(t *testing.T) {
	now := time.Now()
	yesterday := now.Add(-24 * time.Hour).Format(time.RFC3339)
	today := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location()).Add(-time.Second).Format(time.RFC3339)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/planner/my/tasks" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[
			{"id":"late","title":"Überfällig","priority":"high","progress":20,"status":"in-progress","isLate":true,"dueDate":"` + yesterday + `"},
			{"id":"today","title":"Heute","priority":"medium","progress":0,"status":"not-started","isLate":false,"dueDate":"` + today + `"},
			{"id":"done","title":"Erledigt","priority":"urgent","progress":100,"status":"completed","completedAt":"` + today + `"}
		]`))
	}))
	defer server.Close()

	handler := NewAnalyticsHandler(&config.Config{PlannercoreURL: server.URL}, nil)
	result := handler.fetchPlanner(t.Context(), "token")

	if result["openTasks"] != 2 {
		t.Fatalf("openTasks = %v, want 2", result["openTasks"])
	}
	if result["overdue"] != 1 || result["dueToday"] != 1 || result["inProgress"] != 1 {
		t.Fatalf("unexpected planner counters: %#v", result)
	}
	priorities, ok := result["priorities"].([]map[string]any)
	if !ok || len(priorities) != 1 || priorities[0]["id"] != "late" {
		t.Fatalf("unexpected priorities: %#v", result["priorities"])
	}
}

func TestFetchMapReportsUnavailableUpstream(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "down", http.StatusServiceUnavailable)
	}))
	defer server.Close()

	handler := NewAnalyticsHandler(&config.Config{}, nil)
	result := handler.fetchMap(t.Context(), server.URL, "", "test")
	if result["error"] != "unavailable" {
		t.Fatalf("error = %v, want unavailable", result["error"])
	}
}

func TestFetchRentalUsesRevenueRoute(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/analytics/revenue" || r.URL.Query().Get("period") != "30days" {
			t.Fatalf("unexpected rental request %q?%s", r.URL.Path, r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"totalRevenue":1250,"totalJobs":4}`))
	}))
	defer server.Close()

	handler := NewAnalyticsHandler(&config.Config{RentalCoreURL: server.URL}, nil)
	result := handler.fetchRental(t.Context(), "token")
	if result["totalRevenue"] != float64(1250) || result["totalJobs"] != float64(4) {
		t.Fatalf("unexpected rental summary: %#v", result)
	}
}
