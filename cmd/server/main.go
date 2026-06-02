package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"strings"

	"coresdashboard/internal/config"
	"coresdashboard/internal/database"
	"coresdashboard/internal/handlers"
	"coresdashboard/internal/middleware"
)

//go:embed all:dist
var staticFiles embed.FS

func main() {
	cfg := config.Load()

	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatal("DB connect failed:", err)
	}

	mux := http.NewServeMux()

	authHandler := handlers.NewAuthHandler(cfg, db)
	analyticsHandler := handlers.NewAnalyticsHandler(cfg)
	proxyHandler := handlers.NewAdminProxyHandler(cfg)

	mux.HandleFunc("GET /api/v1/config", handlers.ConfigHandler(cfg))
	mux.HandleFunc("POST /api/v1/auth/login", authHandler.Login)
	mux.HandleFunc("POST /api/v1/auth/logout", authHandler.Logout)

	protected := middleware.RequireAuth(cfg, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/auth/me":
			authHandler.Me(w, r)
		case r.URL.Path == "/api/v1/analytics/summary":
			analyticsHandler.Summary(w, r)
		default:
			switch {
			case strings.HasPrefix(r.URL.Path, "/api/v1/proxy/rental"):
				proxyHandler.ProxyRental(w, r)
			case strings.HasPrefix(r.URL.Path, "/api/v1/proxy/warehouse"):
				proxyHandler.ProxyWarehouse(w, r)
			case strings.HasPrefix(r.URL.Path, "/api/v1/proxy/planner"):
				proxyHandler.ProxyPlanner(w, r)
			case strings.HasPrefix(r.URL.Path, "/api/v1/planner"):
				proxyHandler.ProxyPlanner(w, r)
			default:
				http.NotFound(w, r)
			}
		}
	}))
	mux.Handle("/api/v1/auth/me", protected)
	mux.Handle("/api/v1/analytics/", protected)
	mux.Handle("/api/v1/proxy/", protected)
	mux.Handle("/api/v1/planner/", protected)

	// Plannercore SPA proxy (public — auth handled by Plannercore itself)
	mux.HandleFunc("/planner/", proxyHandler.ProxyPlannerSpa)
	mux.HandleFunc("/planner", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/planner/", http.StatusMovedPermanently)
	})

	distFS, err := fs.Sub(staticFiles, "dist")
	if err != nil {
		log.Fatal(err)
	}
	fileServer := http.FileServer(http.FS(distFS))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			f, err := distFS.Open(r.URL.Path[1:])
			if err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		idx, _ := staticFiles.ReadFile("dist/index.html")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(idx)
	})

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("cores-dashboard listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
