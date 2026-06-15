package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/rs/zerolog"

	"coresdashboard/internal/config"
	"coresdashboard/internal/database"
	"coresdashboard/internal/handlers"
	"coresdashboard/internal/middleware"
)

//go:embed all:dist
var staticFiles embed.FS

func main() {
	log := zerolog.New(os.Stderr).With().Timestamp().Logger()

	cfg := config.Load()

	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("DB connect failed")
	}

	mux := http.NewServeMux()

	// Health endpoint (before auth middleware)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		sqlDB, err := db.DB()
		if err != nil || sqlDB.Ping() != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"status":  "error",
				"service": "cores-dashboard",
				"version": "2.1.0",
			})
			return
		}
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "ok",
			"service": "cores-dashboard",
			"version": "2.1.0",
		})
	})

	authHandler := handlers.NewAuthHandler(cfg, db)
	analyticsHandler := handlers.NewAnalyticsHandler(cfg)
	proxyHandler := handlers.NewAdminProxyHandler(cfg)
	brandingHandler := handlers.NewBrandingHandler(db)

	mux.HandleFunc("GET /api/v1/config", handlers.ConfigHandler(cfg, db))
	mux.HandleFunc("GET /api/v1/branding", func(w http.ResponseWriter, r *http.Request) {
		cfg := brandingHandler.GetBrandingPublic("cores")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cfg)
	})
	mux.HandleFunc("POST /api/v1/auth/login", authHandler.Login)
	mux.HandleFunc("POST /api/v1/auth/logout", authHandler.Logout)

	protected := middleware.RequireAuth(cfg, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/auth/me":
			authHandler.Me(w, r)
		case r.URL.Path == "/api/v1/analytics/summary":
			analyticsHandler.Summary(w, r)
		default:
			http.NotFound(w, r)
		}
	}))

	// FIXED: Admin auth bypass — admin and proxy routes now use RequireAdmin middleware
	adminProtected := middleware.RequireAdmin(cfg, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/admin/branding":
			brandingHandler.GetBranding(w, r)
		case r.Method == http.MethodPut && r.URL.Path == "/api/v1/admin/branding":
			brandingHandler.UpdateBranding(w, r)
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/admin/branding/logo":
			brandingHandler.UploadLogo(w, r)
		case r.Method == http.MethodDelete && r.URL.Path == "/api/v1/admin/branding/logo":
			brandingHandler.DeleteLogo(w, r)
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
	mux.Handle("/api/v1/proxy/", adminProtected)
	mux.Handle("/api/v1/planner/", adminProtected)
	mux.Handle("/api/v1/admin/", adminProtected)

	// Plannercore SPA proxy (public — auth handled by Plannercore itself)
	mux.HandleFunc("/planner/", proxyHandler.ProxyPlannerSpa)
	mux.HandleFunc("/planner", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/planner/", http.StatusMovedPermanently)
	})

	distFS, err := fs.Sub(staticFiles, "dist")
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create dist sub-filesystem")
	}
	fileServer := http.FileServer(http.FS(distFS))

	// Serve branding logos: shared volume first, then embedded fallback
	mux.HandleFunc("/logos/", func(w http.ResponseWriter, r *http.Request) {
		base := filepath.Base(r.URL.Path)
		// Reject directory traversal attempts
		if base == "." || base == ".." || base == "" {
			http.NotFound(w, r)
			return
		}
		// Try shared volume first (uploaded logos)
		volDir := "/var/lib/branding/logos"
		volPath := filepath.Join(volDir, base)
		if !strings.HasPrefix(filepath.Clean(volPath), filepath.Clean(volDir)+string(os.PathSeparator)) {
			http.NotFound(w, r)
			return
		}
		if _, err := os.Stat(volPath); err == nil {
			if strings.HasSuffix(volPath, ".svg") {
				w.Header().Set("Content-Security-Policy", "sandbox")
				w.Header().Set("X-Content-Type-Options", "nosniff")
			}
			http.ServeFile(w, r, volPath)
			return
		}
		// Fallback: embedded in dist/logos/
		fallbackPath := "dist/logos/" + base
		if !strings.HasPrefix(filepath.Clean(fallbackPath), "dist/logos/") {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, fallbackPath)
	})

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
		// FIXED: w.Write(nil) panic — nil-check before writing embedded index.html
		if idx == nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte("<html><body>cores-dashboard</body></html>"))
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(idx)
	})

	addr := fmt.Sprintf(":%s", cfg.Port)

	// Graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	srv := &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	go func() {
		log.Info().Str("addr", addr).Msg("cores-dashboard listening")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server failed")
		}
	}()

	<-ctx.Done()
	log.Info().Msg("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("server shutdown error")
	}

	sqlDB, err := db.DB()
	if err == nil {
		if err := sqlDB.Close(); err != nil {
			log.Error().Err(err).Msg("db close error")
		}
	}
	log.Info().Msg("shutdown complete")
}
