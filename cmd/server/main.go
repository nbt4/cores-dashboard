package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/rs/zerolog"

	"coresdashboard/internal/admin"
	"coresdashboard/internal/audit"
	"coresdashboard/internal/config"
	"coresdashboard/internal/database"
	"coresdashboard/internal/handlers"
	"coresdashboard/internal/metrics"
	"coresdashboard/internal/microsoft"
	"coresdashboard/internal/middleware"
	"coresdashboard/internal/proxy"

	"github.com/prometheus/client_golang/prometheus/promhttp"
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
	if err := microsoft.EnsureSchema(db); err != nil {
		log.Fatal().Err(err).Msg("Microsoft identity schema migration failed")
	}
	microsoftService := microsoft.NewService(db)
	syncCtx, cancelMicrosoftSync := context.WithCancel(context.Background())
	defer cancelMicrosoftSync()
	microsoftService.Start(syncCtx)

	// Set initial DB connection gauge
	sqlDB, err := db.DB()
	if err == nil {
		metrics.DBConnectionsOpen.Set(float64(sqlDB.Stats().OpenConnections))
	}

	// Audit logger
	auditLogger := audit.NewAuditLogger(sqlDB)

	// API Gateway proxy
	gatewayProxy := proxy.NewHandler(cfg.RentalCoreURL, cfg.WarehouseCoreURL, cfg.PlannercoreURL)

	// requireAdmin wrapper
	requireAdmin := func(next http.Handler) http.Handler {
		return middleware.RequireAdmin(cfg, next)
	}

	mux := http.NewServeMux()

	// Prometheus metrics endpoint
	mux.Handle("GET /metrics", promhttp.Handler())

	// Health dashboard (admin only)
	healthHandler := admin.NewHealthHandler(cfg, db)
	mux.HandleFunc("GET /api/v1/admin/health", healthHandler.ServeHTTP)

	// Audit log (admin only)
	auditHandler := audit.NewAuditHandler(sqlDB)
	mux.HandleFunc("GET /api/v1/admin/audit", auditHandler.ServeHTTP)

	// API Gateway proxy routes (admin only, with audit logging)
	mux.Handle("/api/v1/rental/", audit.AuditMiddleware(auditLogger, "rental")(requireAdmin(gatewayProxy.RentalProxy())))
	mux.Handle("/api/v1/warehouse/", audit.AuditMiddleware(auditLogger, "warehouse")(requireAdmin(gatewayProxy.WarehouseProxy())))
	mux.Handle("/api/v1/planner/", audit.AuditMiddleware(auditLogger, "planner")(requireAdmin(gatewayProxy.PlannerProxy())))

	// Health endpoint (before auth middleware)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		sqlDB, err := db.DB()
		if err != nil || sqlDB.Ping() != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"status":  "error",
				"service": "cores-dashboard",
				"version": "1.14.13",
			})
			return
		}
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "ok",
			"service": "cores-dashboard",
			"version": "1.14.13",
		})
	})

	authHandler := handlers.NewAuthHandler(cfg, db, microsoftService)
	analyticsHandler := handlers.NewAnalyticsHandler(cfg)
	proxyHandler := handlers.NewAdminProxyHandler(cfg)
	brandingHandler := handlers.NewBrandingHandler(db)
	microsoftHandler := handlers.NewMicrosoftHandler(microsoftService)
	usersHandler := handlers.NewUsersHandler(db, microsoftService)

	mux.HandleFunc("GET /api/v1/config", handlers.ConfigHandler(cfg, db))
	mux.HandleFunc("GET /api/v1/branding", func(w http.ResponseWriter, r *http.Request) {
		cfg := brandingHandler.GetBrandingPublic("cores")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cfg)
	})
	mux.HandleFunc("POST /api/v1/auth/login", authHandler.Login)
	mux.HandleFunc("POST /api/v1/auth/logout", authHandler.Logout)
	mux.HandleFunc("GET /api/v1/auth/methods", authHandler.Methods)
	mux.HandleFunc("GET /api/v1/auth/microsoft/start", authHandler.MicrosoftStart)
	mux.HandleFunc("GET /api/v1/auth/microsoft/callback", authHandler.MicrosoftCallback)

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
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/admin/microsoft/settings":
			microsoftHandler.GetSettings(w, r)
		case r.Method == http.MethodPut && r.URL.Path == "/api/v1/admin/microsoft/settings":
			microsoftHandler.UpdateSettings(w, r)
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/admin/microsoft/test":
			microsoftHandler.TestConnection(w, r)
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/admin/microsoft/sync":
			microsoftHandler.SyncUsers(w, r)
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/admin/users":
			usersHandler.List(w, r)
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/admin/users":
			usersHandler.Create(w, r)
		case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/api/v1/admin/users/") && strings.HasSuffix(strings.TrimRight(r.URL.Path, "/"), "/access"):
			usersHandler.UpdateAccess(w, r)
		case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/api/v1/admin/users/"):
			usersHandler.Update(w, r)
		case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/api/v1/admin/users/"):
			usersHandler.Delete(w, r)
		default:
			switch {
			case strings.HasPrefix(r.URL.Path, "/api/v1/proxy/rental"):
				proxyHandler.ProxyRental(w, r)
			case strings.HasPrefix(r.URL.Path, "/api/v1/proxy/warehouse"):
				proxyHandler.ProxyWarehouse(w, r)
			case strings.HasPrefix(r.URL.Path, "/api/v1/proxy/planner"):
				proxyHandler.ProxyPlanner(w, r)
			default:
				http.NotFound(w, r)
			}
		}
	}))
	mux.Handle("/api/v1/auth/me", protected)
	mux.Handle("/api/v1/analytics/", protected)
	mux.Handle("/api/v1/proxy/", adminProtected)
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
		// Fallback: embedded in dist/logos/. Serve from the embedded filesystem;
		// the runtime container does not contain a physical dist/ directory.
		fallbackPath := "dist/logos/" + base
		if !strings.HasPrefix(filepath.Clean(fallbackPath), "dist/logos/") {
			http.NotFound(w, r)
			return
		}
		data, err := staticFiles.ReadFile(fallbackPath)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if contentType := mime.TypeByExtension(filepath.Ext(base)); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		_, _ = w.Write(data)
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

	// Wrap with metrics middleware
	handler := metrics.Middleware(mux)

	// Graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	srv := &http.Server{
		Addr:    addr,
		Handler: handler,
	}

	go func() {
		log.Info().Str("addr", addr).Msg("cores-dashboard listening")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server failed")
		}
	}()

	<-ctx.Done()
	cancelMicrosoftSync()
	log.Info().Msg("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("server shutdown error")
	}

	if err := sqlDB.Close(); err != nil {
		log.Error().Err(err).Msg("db close error")
	}
	log.Info().Msg("shutdown complete")
}
