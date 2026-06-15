package handlers

import (
	"bytes"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/rs/zerolog"
	"gorm.io/gorm"

	"coresdashboard/internal/models"
)

var brandingLog = zerolog.New(os.Stderr).With().Timestamp().Str("component", "branding").Logger()

const (
	brandingLogoDir      = "/var/lib/branding/logos"
	brandingAllowedTypes = "image/png,image/jpeg,image/svg+xml"
)

// BrandingHandler provides CRUD endpoints for the branding_config singleton.
type BrandingHandler struct {
	db *gorm.DB
	mu sync.Mutex // FIXED: Race condition — mutex protects getOrCreate()
}

// NewBrandingHandler creates a handler backed by the shared PostgreSQL DB.
func NewBrandingHandler(db *gorm.DB) *BrandingHandler {
	if err := os.MkdirAll(brandingLogoDir, 0755); err != nil {
		brandingLog.Error().Err(err).Str("dir", brandingLogoDir).Msg("could not create logo dir")
	}
	return &BrandingHandler{db: db}
}

// PublicBranding mirrors the API shape that other services expose at /api/v1/branding.
type PublicBranding struct {
	CompanyName     string `json:"companyName"`
	BrandName       string `json:"brandName"`
	SidebarLogo     string `json:"sidebarLogo"`
	LoginLogo       string `json:"loginLogo"`
	FaviconPath     string `json:"faviconPath"`
	LogoSizeSidebar int16  `json:"logoSizeSidebar"`
	LogoSizeLogin   int16  `json:"logoSizeLogin"`
}

// GetBrandingPublic returns branding scoped to the given service (e.g. "cores").
func (h *BrandingHandler) GetBrandingPublic(svc string) PublicBranding {
	cfg := h.getOrCreate()
	ts := cfg.UpdatedAt.Unix()
	bust := func(p string) string {
		if p == "" {
			return ""
		}
		return fmt.Sprintf("%s?v=%d", p, ts)
	}
	pb := PublicBranding{
		CompanyName:     cfg.CompanyName,
		BrandName:       cfg.BrandName,
		LogoSizeSidebar: cfg.LogoSideSizebar,
		LogoSizeLogin:   cfg.LogoSizeLogin,
	}
	switch svc {
	case "cores":
		pb.SidebarLogo = bust(derefStr(cfg.LogoCoresSidebar))
		pb.LoginLogo = bust(derefStr(cfg.LogoCoresLogin))
		pb.FaviconPath = bust(derefStr(cfg.FaviconCores))
	case "rental":
		pb.SidebarLogo = bust(derefStr(cfg.LogoRentalSidebar))
		pb.LoginLogo = bust(derefStr(cfg.LogoRentalLogin))
		pb.FaviconPath = bust(derefStr(cfg.FaviconRental))
	case "warehouse":
		pb.SidebarLogo = bust(derefStr(cfg.LogoWarehouseSidebar))
		pb.LoginLogo = bust(derefStr(cfg.LogoWarehouseLogin))
		pb.FaviconPath = bust(derefStr(cfg.FaviconWarehouse))
	case "planner":
		pb.SidebarLogo = bust(derefStr(cfg.LogoPlannerSidebar))
		pb.LoginLogo = bust(derefStr(cfg.LogoPlannerLogin))
		pb.FaviconPath = bust(derefStr(cfg.FaviconPlanner))
	}
	// Fallback: legacy global favicon
	if pb.FaviconPath == "" {
		pb.FaviconPath = bust(derefStr(cfg.FaviconPath))
	}
	if pb.CompanyName == "" {
		pb.CompanyName = "Cores"
	}
	return pb
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// ---------------------------------------------------------------------------
// GET /api/v1/admin/branding
// ---------------------------------------------------------------------------

func (h *BrandingHandler) GetBranding(w http.ResponseWriter, r *http.Request) {
	cfg := h.getOrCreate()
	writeJSON(w, http.StatusOK, cfg)
}

// ---------------------------------------------------------------------------
// PUT /api/v1/admin/branding
// ---------------------------------------------------------------------------

func (h *BrandingHandler) UpdateBranding(w http.ResponseWriter, r *http.Request) {
	var input models.BrandingConfig
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	cfg := h.getOrCreate()

	// Only update fields that were actually sent (non-zero / non-empty)
	if input.CompanyName != "" || input.BrandName != "" {
		// allow clearing company name by sending exactly ""
	}
	cfg.CompanyName = input.CompanyName
	cfg.BrandName = input.BrandName

	// Logo size sliders
	if input.LogoSideSizebar >= 50 && input.LogoSideSizebar <= 200 {
		cfg.LogoSideSizebar = input.LogoSideSizebar
	}
	if input.LogoSizeLogin >= 50 && input.LogoSizeLogin <= 200 {
		cfg.LogoSizeLogin = input.LogoSizeLogin
	}

	if err := h.db.Save(&cfg).Error; err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save failed"})
		return
	}

	writeJSON(w, http.StatusOK, cfg)
}

// ---------------------------------------------------------------------------
// POST /api/v1/admin/branding/logo
// multipart form: service=cores|rental|warehouse|planner, position=sidebar|login|favicon, file=<image>
// ---------------------------------------------------------------------------

func (h *BrandingHandler) UploadLogo(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil { // FIXED: Unlimited upload — limit to 32MB
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "failed to parse upload"})
		return
	}

	svc := r.FormValue("service")
	pos := r.FormValue("position")
	if svc == "" || pos == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "service and position required"})
		return
	}
	if !validService(svc) || !validPosition(pos) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid service or position"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file field required"})
		return
	}
	defer file.Close()

	// Validate content type
	ct := header.Header.Get("Content-Type")
	if ct != "image/png" && ct != "image/jpeg" && ct != "image/svg+xml" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("unsupported type: %s (allowed: %s)", ct, brandingAllowedTypes)})
		return
	}

	// Determine extension
	ext := filepath.Ext(header.Filename)
	if ext == "" {
		switch ct {
		case "image/png":
			ext = ".png"
		case "image/jpeg":
			ext = ".jpg"
		case "image/svg+xml":
			ext = ".svg"
		}
	}

	// Validate final extension (prevents extension bypass)
	if ext != ".png" && ext != ".jpg" && ext != ".svg" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("unsupported file extension: %s (allowed: .png, .jpg, .svg)", ext)})
		return
	}

	// Build destination filename
	var destPath string
	column := h.columnFor(svc, pos)
	if pos == "favicon" {
		destPath = filepath.Join(brandingLogoDir, svc+"_favicon"+ext)
	} else {
		destPath = filepath.Join(brandingLogoDir, svc+"_"+pos+ext)
	}

	// Remove old file with same base name (any extension)
	oldBase := strings.TrimSuffix(destPath, ext)
	matches, _ := filepath.Glob(oldBase + ".*")
	for _, m := range matches {
		os.Remove(m)
	}

	// Write new file (SVG files are sanitized to prevent stored XSS)
	dst, err := os.Create(destPath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cannot write file"})
		return
	}
	defer dst.Close()

	if ext == ".svg" {
		data, err := io.ReadAll(file)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "read failed"})
			return
		}
		sanitized := sanitizeSVG(data)
		if _, err := dst.Write(sanitized); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "write failed"})
			return
		}
	} else {
		if _, err := io.Copy(dst, file); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "write failed"})
			return
		}
	}

	// Build web path
	webPath := "/logos/" + filepath.Base(destPath)

	// Update DB
	cfg := h.getOrCreate()
	if column != "" {
		h.setColumn(cfg, column, &webPath)
		if err := h.db.Save(&cfg).Error; err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "db update failed"})
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"path": webPath, "column": column})
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/admin/branding/logo?service=...&position=...
// ---------------------------------------------------------------------------

func (h *BrandingHandler) DeleteLogo(w http.ResponseWriter, r *http.Request) {
	svc := r.URL.Query().Get("service")
	pos := r.URL.Query().Get("position")
	if !validService(svc) || !validPosition(pos) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid service or position"})
		return
	}

	column := h.columnFor(svc, pos)
	cfg := h.getOrCreate()

	// Get current path to delete the file
	var currentPath *string
	switch column {
	case "logo_cores_sidebar":
		currentPath = cfg.LogoCoresSidebar
	case "logo_cores_login":
		currentPath = cfg.LogoCoresLogin
	case "logo_rental_sidebar":
		currentPath = cfg.LogoRentalSidebar
	case "logo_rental_login":
		currentPath = cfg.LogoRentalLogin
	case "logo_warehouse_sidebar":
		currentPath = cfg.LogoWarehouseSidebar
	case "logo_warehouse_login":
		currentPath = cfg.LogoWarehouseLogin
	case "logo_planner_sidebar":
		currentPath = cfg.LogoPlannerSidebar
	case "logo_planner_login":
		currentPath = cfg.LogoPlannerLogin
	case "favicon_cores":
		currentPath = cfg.FaviconCores
	case "favicon_rental":
		currentPath = cfg.FaviconRental
	case "favicon_warehouse":
		currentPath = cfg.FaviconWarehouse
	case "favicon_planner":
		currentPath = cfg.FaviconPlanner
	case "favicon_path":
		currentPath = cfg.FaviconPath
	}

	if currentPath != nil && *currentPath != "" {
		// Convert web path to filesystem path
		fsPath := filepath.Join(brandingLogoDir, filepath.Base(*currentPath))
		os.Remove(fsPath)
	}

	// Nullify column
	h.setColumn(cfg, column, nil)
	if err := h.db.Save(&cfg).Error; err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "db update failed"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ---------------------------------------------------------------------------
// GET /api/v1/admin/branding/logo/{service}/{position}
// ---------------------------------------------------------------------------

func (h *BrandingHandler) ServeLogo(w http.ResponseWriter, r *http.Request, svc string, pos string) {
	cfg := h.getOrCreate()
	var webPath *string
	switch {
	case svc == "cores" && pos == "sidebar":
		webPath = cfg.LogoCoresSidebar
	case svc == "cores" && pos == "login":
		webPath = cfg.LogoCoresLogin
	case svc == "rental" && pos == "sidebar":
		webPath = cfg.LogoRentalSidebar
	case svc == "rental" && pos == "login":
		webPath = cfg.LogoRentalLogin
	case svc == "warehouse" && pos == "sidebar":
		webPath = cfg.LogoWarehouseSidebar
	case svc == "warehouse" && pos == "login":
		webPath = cfg.LogoWarehouseLogin
	case svc == "planner" && pos == "sidebar":
		webPath = cfg.LogoPlannerSidebar
	case svc == "planner" && pos == "login":
		webPath = cfg.LogoPlannerLogin
	case pos == "favicon":
		webPath = cfg.FaviconPath
	default:
		http.NotFound(w, r)
		return
	}

	if webPath == nil || *webPath == "" {
		http.NotFound(w, r)
		return
	}

	fsPath := filepath.Join(brandingLogoDir, filepath.Base(*webPath))
	// Prevent SVG script execution via Content-Security-Policy
	if strings.HasSuffix(fsPath, ".svg") {
		w.Header().Set("Content-Security-Policy", "sandbox")
		w.Header().Set("X-Content-Type-Options", "nosniff")
	}
	http.ServeFile(w, r, fsPath)
}

// sanitizeSVG uses XML tokenization to strip executable content from SVG files.
// Unlike regex, this correctly handles namespaces, nested elements, and edge cases.
// Removes: <script>, <foreignObject>, on* event attributes, javascript: hrefs.
func sanitizeSVG(data []byte) []byte {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	decoder.Strict = false
	decoder.AutoClose = xml.HTMLAutoClose

	var buf bytes.Buffer
	encoder := xml.NewEncoder(&buf)

	// Track whether we're inside a skipped element
	skipDepth := 0

	for {
		tok, err := decoder.Token()
		if err != nil {
			break
		}

		switch t := tok.(type) {
		case xml.StartElement:
			// Drop <script> and <foreignObject> with their entire content
			if t.Name.Local == "script" || t.Name.Local == "foreignObject" {
				skipDepth++
				continue
			}
			if skipDepth > 0 {
				skipDepth++
				continue
			}
			cleanStart := xml.StartElement{
				Name: t.Name,
				Attr: sanitizeAttrs(t.Attr),
			}
			encoder.EncodeToken(cleanStart)

		case xml.EndElement:
			if skipDepth > 0 {
				skipDepth--
				continue
			}
			encoder.EncodeToken(t)

		case xml.CharData:
			if skipDepth > 0 {
				continue
			}
			encoder.EncodeToken(t)

		case xml.Comment:
			if skipDepth > 0 {
				continue
			}
			encoder.EncodeToken(t)

		case xml.ProcInst:
			if skipDepth > 0 {
				continue
			}
			encoder.EncodeToken(t)

		case xml.Directive:
			if skipDepth > 0 {
				continue
			}
			encoder.EncodeToken(t)
		}
	}

	encoder.Flush()
	return buf.Bytes()
}

// sanitizeAttrs removes dangerous attributes: event handlers (on*) and javascript: hrefs.
func sanitizeAttrs(attrs []xml.Attr) []xml.Attr {
	filtered := make([]xml.Attr, 0, len(attrs))
	for _, a := range attrs {
		name := strings.ToLower(a.Name.Local)
		// Strip all on* event handler attributes
		if strings.HasPrefix(name, "on") {
			continue
		}
		// Strip href/xlink:href containing javascript:
		if (name == "href" || strings.HasSuffix(name, ":href")) &&
			strings.Contains(strings.ToLower(a.Value), "javascript:") {
			continue
		}
		filtered = append(filtered, a)
	}
	return filtered
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func (h *BrandingHandler) getOrCreate() *models.BrandingConfig {
	h.mu.Lock()
	defer h.mu.Unlock() // FIXED: Race condition — mutex protects getOrCreate()
	var cfg models.BrandingConfig
	if err := h.db.First(&cfg, 1).Error; err != nil {
		// Row should always exist (migration seeds id=1), but if not, create it.
		cfg = models.BrandingConfig{ID: 1}
		h.db.Create(&cfg)
	}
	return &cfg
}

func (h *BrandingHandler) columnFor(svc, pos string) string {
	if pos == "favicon" {
		return fmt.Sprintf("favicon_%s", svc)
	}
	return fmt.Sprintf("logo_%s_%s", svc, pos)
}

func (h *BrandingHandler) setColumn(cfg *models.BrandingConfig, column string, val *string) {
	switch column {
	case "logo_cores_sidebar":
		cfg.LogoCoresSidebar = val
	case "logo_cores_login":
		cfg.LogoCoresLogin = val
	case "logo_rental_sidebar":
		cfg.LogoRentalSidebar = val
	case "logo_rental_login":
		cfg.LogoRentalLogin = val
	case "logo_warehouse_sidebar":
		cfg.LogoWarehouseSidebar = val
	case "logo_warehouse_login":
		cfg.LogoWarehouseLogin = val
	case "logo_planner_sidebar":
		cfg.LogoPlannerSidebar = val
	case "logo_planner_login":
		cfg.LogoPlannerLogin = val
	case "favicon_cores":
		cfg.FaviconCores = val
	case "favicon_rental":
		cfg.FaviconRental = val
	case "favicon_warehouse":
		cfg.FaviconWarehouse = val
	case "favicon_planner":
		cfg.FaviconPlanner = val
	case "favicon_path":
		cfg.FaviconPath = val
	}
}

func validService(s string) bool {
	switch s {
	case "cores", "rental", "warehouse", "planner":
		return true
	}
	return false
}

func validPosition(s string) bool {
	switch s {
	case "sidebar", "login", "favicon":
		return true
	}
	return false
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
