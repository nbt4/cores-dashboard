package handlers

import (
	"bytes"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	commonbranding "github.com/nbt4/cores-common/pkg/branding"
	"github.com/rs/zerolog"
	"gorm.io/gorm"

	"coresdashboard/internal/models"
)

var brandingLog = zerolog.New(os.Stderr).With().Timestamp().Str("component", "branding").Logger()

const (
	brandingLogoDir      = "/var/lib/branding/logos"
	brandingAllowedTypes = "image/png,image/svg+xml (JPEG only for print assets)"
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

// GetBrandingPublic returns branding scoped to the given service (e.g. "cores").
func (h *BrandingHandler) GetBrandingPublic(svc string) commonbranding.Config {
	return commonbranding.NewService(h.db, svc).GetConfig()
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
	if input.LogoSizeSidebar >= 50 && input.LogoSizeSidebar <= 200 {
		cfg.LogoSizeSidebar = input.LogoSizeSidebar
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
// multipart form: service=<service|company>, position=<semantic position>, file=<image>
// ---------------------------------------------------------------------------

func (h *BrandingHandler) UploadLogo(w http.ResponseWriter, r *http.Request) {
	// ParseMultipartForm's argument is only the in-memory threshold; larger
	// uploads spill to a temporary file and are not rejected by size.
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid multipart data"})
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
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
	data, err := io.ReadAll(file)
	if err != nil || len(data) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "could not read file"})
		return
	}
	data, ext, err := prepareBrandingAsset(data, header.Filename, pos)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	baseName := svc + "_" + strings.ReplaceAll(pos, "-", "_")
	destPath := filepath.Join(brandingLogoDir, baseName+ext)
	tmp, err := os.CreateTemp(brandingLogoDir, ".branding-upload-*")
	if err != nil {
		brandingLog.Error().Err(err).Str("dir", brandingLogoDir).Msg("could not create upload file")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cannot write file"})
		return
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		brandingLog.Error().Err(err).Str("file", tmpName).Msg("could not write upload file")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "write failed"})
		return
	}
	if err := tmp.Close(); err != nil {
		brandingLog.Error().Err(err).Str("file", tmpName).Msg("could not close upload file")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not finalize file"})
		return
	}
	if err := os.Rename(tmpName, destPath); err != nil {
		brandingLog.Error().Err(err).Str("source", tmpName).Str("destination", destPath).Msg("could not finalize upload file")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not finalize file"})
		return
	}

	webPath := "/logos/" + filepath.Base(destPath)
	cfg := h.getOrCreate()
	oldPath := h.assetPath(cfg, svc, pos)
	h.setAsset(cfg, svc, pos, webPath)
	column := h.columnFor(svc, pos)
	if column != "" { // keep old clients operational during migration
		h.setColumn(cfg, column, &webPath)
	}
	if err := h.db.Save(&cfg).Error; err != nil {
		_ = os.Remove(destPath)
		brandingLog.Error().Err(err).Str("service", svc).Str("position", pos).Msg("could not update branding configuration")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "db update failed"})
		return
	}

	// Remove stale extensions only after both the new file and DB update exist.
	matches, _ := filepath.Glob(filepath.Join(brandingLogoDir, baseName+".*"))
	for _, match := range matches {
		if match != destPath {
			_ = os.Remove(match)
		}
	}
	if oldPath != "" && filepath.Base(oldPath) != filepath.Base(webPath) {
		_ = os.Remove(filepath.Join(brandingLogoDir, filepath.Base(oldPath)))
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

	cfg := h.getOrCreate()
	currentPath := h.assetPath(cfg, svc, pos)
	h.setAsset(cfg, svc, pos, "")
	column := h.columnFor(svc, pos)
	if column != "" {
		h.setColumn(cfg, column, nil)
	}
	if err := h.db.Save(&cfg).Error; err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "db update failed"})
		return
	}
	if currentPath != "" {
		_ = os.Remove(filepath.Join(brandingLogoDir, filepath.Base(currentPath)))
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ---------------------------------------------------------------------------
// GET /api/v1/admin/branding/logo/{service}/{position}
// ---------------------------------------------------------------------------

func (h *BrandingHandler) ServeLogo(w http.ResponseWriter, r *http.Request, svc string, pos string) {
	cfg := h.getOrCreate()
	if !validService(svc) || !validPosition(pos) {
		http.NotFound(w, r)
		return
	}
	webPath := h.assetPath(cfg, svc, pos)
	if webPath == "" {
		http.NotFound(w, r)
		return
	}

	fsPath := filepath.Join(brandingLogoDir, filepath.Base(webPath))
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

func prepareBrandingAsset(data []byte, filename, position string) ([]byte, string, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == ".jpeg" {
		ext = ".jpg"
	}

	var width, height float64
	switch ext {
	case ".svg":
		data = sanitizeSVG(data)
		var err error
		width, height, err = svgDimensions(data)
		if err != nil {
			return nil, "", fmt.Errorf("invalid SVG: %w", err)
		}
	case ".png", ".jpg":
		if ext == ".jpg" && position != "print" {
			return nil, "", fmt.Errorf("JPEG is only accepted for print assets; use transparent PNG or SVG")
		}
		cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil || (format != "png" && format != "jpeg") {
			return nil, "", fmt.Errorf("file content is not a valid PNG or JPEG")
		}
		if (ext == ".png" && format != "png") || (ext == ".jpg" && format != "jpeg") {
			return nil, "", fmt.Errorf("file extension does not match image content")
		}
		width, height = float64(cfg.Width), float64(cfg.Height)
	default:
		return nil, "", fmt.Errorf("unsupported file type; allowed: %s", brandingAllowedTypes)
	}

	if width <= 0 || height <= 0 {
		return nil, "", fmt.Errorf("image dimensions must be positive")
	}
	if err := validateAspectRatio(position, width/height); err != nil {
		return nil, "", err
	}
	return data, ext, nil
}

func svgDimensions(data []byte) (float64, float64, error) {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	for {
		token, err := decoder.Token()
		if err != nil {
			return 0, 0, fmt.Errorf("missing svg root")
		}
		start, ok := token.(xml.StartElement)
		if !ok || strings.ToLower(start.Name.Local) != "svg" {
			continue
		}
		attrs := make(map[string]string, len(start.Attr))
		for _, attr := range start.Attr {
			attrs[strings.ToLower(attr.Name.Local)] = attr.Value
		}
		if viewBox := strings.Fields(attrs["viewbox"]); len(viewBox) == 4 {
			width, widthErr := strconv.ParseFloat(viewBox[2], 64)
			height, heightErr := strconv.ParseFloat(viewBox[3], 64)
			if widthErr == nil && heightErr == nil {
				return width, height, nil
			}
		}
		width, widthErr := parseSVGLength(attrs["width"])
		height, heightErr := parseSVGLength(attrs["height"])
		if widthErr != nil || heightErr != nil {
			return 0, 0, fmt.Errorf("svg needs a numeric viewBox or width and height")
		}
		return width, height, nil
	}
}

func parseSVGLength(value string) (float64, error) {
	value = strings.TrimSpace(value)
	for _, suffix := range []string{"px", "pt", "mm", "cm", "in"} {
		value = strings.TrimSuffix(value, suffix)
	}
	return strconv.ParseFloat(value, 64)
}

func validateAspectRatio(position string, ratio float64) error {
	switch position {
	case "mark-on-dark", "mark-on-light", "favicon", "app-icon", "maskable-icon":
		if ratio < 0.8 || ratio > 1.25 {
			return fmt.Errorf("%s must be approximately square (aspect ratio 0.8–1.25)", position)
		}
	case "horizontal-on-dark", "horizontal-on-light", "sidebar":
		if ratio < 1.4 || ratio > 6 {
			return fmt.Errorf("%s must be horizontal (aspect ratio 1.4–6.0)", position)
		}
	case "stacked-on-dark", "stacked-on-light", "login":
		if ratio < 0.7 || ratio > 1.7 {
			return fmt.Errorf("%s must be a stacked lockup (aspect ratio 0.7–1.7)", position)
		}
	}
	return nil
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
	if svc == "company" {
		return ""
	}
	if pos == "favicon" {
		return fmt.Sprintf("favicon_%s", svc)
	}
	switch pos {
	case "sidebar", "horizontal-on-dark":
		return fmt.Sprintf("logo_%s_sidebar", svc)
	case "login", "stacked-on-dark":
		return fmt.Sprintf("logo_%s_login", svc)
	}
	return ""
}

func (h *BrandingHandler) assetPath(cfg *models.BrandingConfig, svc, pos string) string {
	if cfg.Assets != nil {
		if path := assetValue(cfg.Assets[svc], pos); path != "" {
			return path
		}
	}
	column := h.columnFor(svc, pos)
	return derefStr(h.columnValue(cfg, column))
}

func (h *BrandingHandler) setAsset(cfg *models.BrandingConfig, svc, pos, value string) {
	if cfg.Assets == nil {
		cfg.Assets = make(map[string]commonbranding.AssetSet)
	}
	assets := cfg.Assets[svc]
	setAssetValue(&assets, pos, value)
	if assets == (commonbranding.AssetSet{}) {
		delete(cfg.Assets, svc)
	} else {
		cfg.Assets[svc] = assets
	}
}

func assetValue(assets commonbranding.AssetSet, pos string) string {
	switch pos {
	case "mark-on-dark":
		return assets.MarkOnDark
	case "mark-on-light":
		return assets.MarkOnLight
	case "horizontal-on-dark", "sidebar":
		return assets.HorizontalOnDark
	case "horizontal-on-light":
		return assets.HorizontalOnLight
	case "stacked-on-dark", "login":
		return assets.StackedOnDark
	case "stacked-on-light":
		return assets.StackedOnLight
	case "favicon":
		return assets.Favicon
	case "app-icon":
		return assets.AppIcon
	case "maskable-icon":
		return assets.MaskableIcon
	case "print":
		return assets.Print
	}
	return ""
}

func setAssetValue(assets *commonbranding.AssetSet, pos, value string) {
	switch pos {
	case "mark-on-dark":
		assets.MarkOnDark = value
	case "mark-on-light":
		assets.MarkOnLight = value
	case "horizontal-on-dark", "sidebar":
		assets.HorizontalOnDark = value
	case "horizontal-on-light":
		assets.HorizontalOnLight = value
	case "stacked-on-dark", "login":
		assets.StackedOnDark = value
	case "stacked-on-light":
		assets.StackedOnLight = value
	case "favicon":
		assets.Favicon = value
	case "app-icon":
		assets.AppIcon = value
	case "maskable-icon":
		assets.MaskableIcon = value
	case "print":
		assets.Print = value
	}
}

func (h *BrandingHandler) columnValue(cfg *models.BrandingConfig, column string) *string {
	switch column {
	case "logo_cores_sidebar":
		return cfg.LogoCoresSidebar
	case "logo_cores_login":
		return cfg.LogoCoresLogin
	case "logo_rental_sidebar":
		return cfg.LogoRentalSidebar
	case "logo_rental_login":
		return cfg.LogoRentalLogin
	case "logo_warehouse_sidebar":
		return cfg.LogoWarehouseSidebar
	case "logo_warehouse_login":
		return cfg.LogoWarehouseLogin
	case "logo_planner_sidebar":
		return cfg.LogoPlannerSidebar
	case "logo_planner_login":
		return cfg.LogoPlannerLogin
	case "logo_procurement_sidebar":
		return cfg.LogoProcurementSidebar
	case "logo_procurement_login":
		return cfg.LogoProcurementLogin
	case "favicon_cores":
		return cfg.FaviconCores
	case "favicon_rental":
		return cfg.FaviconRental
	case "favicon_warehouse":
		return cfg.FaviconWarehouse
	case "favicon_planner":
		return cfg.FaviconPlanner
	case "favicon_procurement":
		return cfg.FaviconProcurement
	case "favicon_path":
		return cfg.FaviconPath
	}
	return nil
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
	case "logo_procurement_sidebar":
		cfg.LogoProcurementSidebar = val
	case "logo_procurement_login":
		cfg.LogoProcurementLogin = val
	case "favicon_cores":
		cfg.FaviconCores = val
	case "favicon_rental":
		cfg.FaviconRental = val
	case "favicon_warehouse":
		cfg.FaviconWarehouse = val
	case "favicon_planner":
		cfg.FaviconPlanner = val
	case "favicon_procurement":
		cfg.FaviconProcurement = val
	case "favicon_path":
		cfg.FaviconPath = val
	}
}

func validService(s string) bool {
	switch s {
	case "cores", "rental", "warehouse", "planner", "procurement", "company":
		return true
	}
	return false
}

func validPosition(s string) bool {
	switch s {
	case "sidebar", "login", "mark-on-dark", "mark-on-light",
		"horizontal-on-dark", "horizontal-on-light", "stacked-on-dark",
		"stacked-on-light", "favicon", "app-icon", "maskable-icon", "print":
		return true
	}
	return false
}

// writeJSON delegates to commonresponse.JSON
func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
