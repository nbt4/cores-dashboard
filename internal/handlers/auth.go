package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"coresdashboard/internal/config"
	"coresdashboard/internal/microsoft"
	"coresdashboard/internal/models"
	commonjwt "github.com/nbt4/cores-common/pkg/jwt"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthHandler struct {
	cfg       *config.Config
	db        *gorm.DB
	ms        *microsoft.Service
	rateLimit map[string]time.Time // FIXED: Login rate limiting
	rateMu    sync.Mutex           // FIXED: Login rate limiting
}

func NewAuthHandler(cfg *config.Config, db *gorm.DB, ms ...*microsoft.Service) *AuthHandler {
	h := &AuthHandler{
		cfg:       cfg,
		db:        db,
		rateLimit: make(map[string]time.Time), // FIXED: Login rate limiting
	}
	if len(ms) > 0 {
		h.ms = ms[0]
	}
	return h
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Redirect string `json:"redirect"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	// FIXED: Login rate limiting — max 10 attempts per minute per IP
	ip := r.RemoteAddr
	h.rateMu.Lock()
	if last, ok := h.rateLimit[ip]; ok && time.Since(last) < 6*time.Second {
		h.rateMu.Unlock()
		jsonError(w, "Too many login attempts. Please wait.", http.StatusTooManyRequests)
		return
	}
	h.rateLimit[ip] = time.Now()
	h.rateMu.Unlock()

	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if h.ms != nil {
		settings, err := h.ms.GetSettings(r.Context())
		if err == nil && !settings.UsesLocalLogin() {
			jsonError(w, "Lokale Anmeldung ist deaktiviert. Bitte Microsoft verwenden.", http.StatusForbidden)
			return
		}
	}

	var user models.User
	if err := h.db.Where("username = ? AND is_active = ?", req.Username, true).First(&user).Error; err != nil {
		jsonError(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		jsonError(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	h.issueLogin(w, r, user, req.Redirect)
}

func (h *AuthHandler) issueLogin(w http.ResponseWriter, r *http.Request, user models.User, redirect string) {
	if err := h.setSessionCookie(w, user); err != nil {
		jsonError(w, "Token error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":               true,
		"user_id":               user.UserID,
		"username":              user.Username,
		"display_name":          h.displayName(user.UserID, user.Username),
		"is_admin":              user.IsAdmin,
		"force_password_change": user.ForcePassword,
		"redirect":              h.safeReturnURL(r, redirect),
	})
}

func (h *AuthHandler) setSessionCookie(w http.ResponseWriter, user models.User) error {
	claims := &commonjwt.Claims{
		UserID:   user.UserID,
		Username: user.Username,
		IsAdmin:  user.IsAdmin,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(h.cfg.JWTSecret))
	if err != nil {
		return err
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "cores_token",
		Value:    signed,
		Path:     "/",
		Domain:   h.cfg.CookieDomain,
		HttpOnly: true,
		Secure:   h.cfg.CookieDomain != "",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400,
	})
	return nil
}

func (h *AuthHandler) Methods(w http.ResponseWriter, r *http.Request) {
	localEnabled := true
	microsoftEnabled := false
	mode := "local"
	if h.ms != nil {
		if settings, err := h.ms.GetSettings(r.Context()); err == nil {
			localEnabled = settings.UsesLocalLogin()
			microsoftEnabled = settings.UsesMicrosoftLogin()
			mode = settings.UserMode
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"mode": mode, "localEnabled": localEnabled, "microsoftEnabled": microsoftEnabled,
	})
}

func (h *AuthHandler) MicrosoftStart(w http.ResponseWriter, r *http.Request) {
	if h.ms == nil {
		jsonError(w, "Microsoft-Anmeldung ist nicht verfügbar", http.StatusNotFound)
		return
	}
	settings, err := h.ms.GetSettings(r.Context())
	if err != nil || !settings.UsesMicrosoftLogin() || settings.TenantID == "" || settings.ClientID == "" || settings.ClientSecret == "" {
		jsonError(w, "Microsoft-Anmeldung ist nicht konfiguriert", http.StatusConflict)
		return
	}
	stateBytes := make([]byte, 32)
	if _, err := rand.Read(stateBytes); err != nil {
		jsonError(w, "Anmeldung konnte nicht gestartet werden", http.StatusInternalServerError)
		return
	}
	state := base64.RawURLEncoding.EncodeToString(stateBytes)
	h.setOAuthStateCookie(w, state, 600)
	h.setOAuthReturnCookie(w, h.safeReturnURL(r, r.URL.Query().Get("redirect")), 600)
	redirectURI := h.microsoftRedirectURI(r, settings)
	http.Redirect(w, r, microsoft.AuthorizationURL(settings, redirectURI, state), http.StatusFound)
}

func (h *AuthHandler) MicrosoftCallback(w http.ResponseWriter, r *http.Request) {
	returnTo := "/"
	if returnCookie, err := r.Cookie("cores_ms_oauth_return"); err == nil {
		returnTo = h.safeReturnURL(r, returnCookie.Value)
	}
	h.setOAuthReturnCookie(w, "", -1)
	if h.ms == nil {
		h.redirectLoginError(w, r, "Microsoft-Anmeldung ist nicht verfügbar", returnTo)
		return
	}
	stateCookie, err := r.Cookie("cores_ms_oauth_state")
	if err != nil || stateCookie.Value == "" || stateCookie.Value != r.URL.Query().Get("state") {
		h.redirectLoginError(w, r, "Ungültiger oder abgelaufener Anmeldestatus", returnTo)
		return
	}
	h.setOAuthStateCookie(w, "", -1)
	if providerError := r.URL.Query().Get("error"); providerError != "" {
		h.redirectLoginError(w, r, firstNonEmptyString(r.URL.Query().Get("error_description"), providerError), returnTo)
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" {
		h.redirectLoginError(w, r, "Microsoft hat keinen Anmeldecode geliefert", returnTo)
		return
	}
	settings, err := h.ms.GetSettings(r.Context())
	if err != nil || !settings.UsesMicrosoftLogin() {
		h.redirectLoginError(w, r, "Microsoft-Anmeldung ist deaktiviert", returnTo)
		return
	}
	profile, err := h.ms.AuthenticateCode(r.Context(), settings, code, h.microsoftRedirectURI(r, settings))
	if err != nil {
		h.redirectLoginError(w, r, err.Error(), returnTo)
		return
	}
	var user models.User
	err = h.db.Where("identity_source = ? AND external_id = ? AND is_active = ?", "microsoft", profile.ID, true).First(&user).Error
	if err != nil {
		h.redirectLoginError(w, r, "Dieses Microsoft-Konto gehört nicht zur konfigurierten Cores-Gruppe oder wurde noch nicht synchronisiert", returnTo)
		return
	}
	if err := h.setSessionCookie(w, user); err != nil {
		h.redirectLoginError(w, r, "Cores-Sitzung konnte nicht erstellt werden", returnTo)
		return
	}
	http.Redirect(w, r, returnTo, http.StatusFound)
}

func (h *AuthHandler) microsoftRedirectURI(r *http.Request, settings microsoft.Settings) string {
	if base := strings.TrimRight(strings.TrimSpace(settings.AppBaseURL), "/"); base != "" {
		return base + "/api/v1/auth/microsoft/callback"
	}
	scheme := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))
	if scheme == "" {
		if r.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}
	return fmt.Sprintf("%s://%s/api/v1/auth/microsoft/callback", scheme, r.Host)
}

func (h *AuthHandler) setOAuthStateCookie(w http.ResponseWriter, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: "cores_ms_oauth_state", Value: value, Path: "/api/v1/auth/microsoft/",
		Domain: h.cfg.CookieDomain, HttpOnly: true, Secure: h.cfg.CookieDomain != "",
		SameSite: http.SameSiteLaxMode, MaxAge: maxAge,
	})
}

func (h *AuthHandler) setOAuthReturnCookie(w http.ResponseWriter, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: "cores_ms_oauth_return", Value: value, Path: "/api/v1/auth/microsoft/",
		Domain: h.cfg.CookieDomain, HttpOnly: true, Secure: h.cfg.CookieDomain != "",
		SameSite: http.SameSiteLaxMode, MaxAge: maxAge,
	})
}

func (h *AuthHandler) redirectLoginError(w http.ResponseWriter, r *http.Request, message, redirect string) {
	query := url.Values{"error": {message}}
	if safe := h.safeReturnURL(r, redirect); safe != "/" {
		query.Set("redirect", safe)
	}
	http.Redirect(w, r, "/login?"+query.Encode(), http.StatusFound)
}

func (h *AuthHandler) safeReturnURL(r *http.Request, raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.Contains(raw, "\\") {
		return "/"
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return "/"
	}
	if !parsed.IsAbs() {
		if parsed.Host != "" || !strings.HasPrefix(parsed.Path, "/") || strings.HasPrefix(parsed.Path, "//") {
			return "/"
		}
		return parsed.String()
	}
	if parsed.User != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return "/"
	}
	allowed := []string{
		requestOrigin(r),
		h.cfg.RentalPublicURL,
		h.cfg.WarehousePublicURL,
		h.cfg.PlannercorePublicURL,
		h.cfg.ProcurementPublicURL,
	}
	for _, candidate := range allowed {
		base, parseErr := url.Parse(strings.TrimSpace(candidate))
		if parseErr == nil && base.Scheme != "" && base.Host != "" &&
			strings.EqualFold(parsed.Scheme, base.Scheme) && strings.EqualFold(parsed.Host, base.Host) {
			return parsed.String()
		}
	}
	return "/"
}

func requestOrigin(r *http.Request) string {
	scheme := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Proto"), ",")[0])
	if scheme == "" {
		if r.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}
	host := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Host"), ",")[0])
	if host == "" {
		host = r.Host
	}
	return scheme + "://" + host
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return "Unbekannter Fehler"
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "cores_token",
		Value:    "",
		Path:     "/",
		Domain:   h.cfg.CookieDomain,
		HttpOnly: true,
		MaxAge:   -1,
	})
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	claims, _ := commonjwt.GetClaims(r)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user_id":      claims.UserID,
		"username":     claims.Username,
		"display_name": h.displayName(claims.UserID, claims.Username),
		"is_admin":     claims.IsAdmin,
	})
}

func (h *AuthHandler) displayName(userID uint, fallback string) string {
	var displayName string
	err := h.db.Raw(`SELECT COALESCE(
		NULLIF(p.display_name, ''),
		NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
		u.username
	) FROM users u LEFT JOIN user_profiles p ON p.user_id = u.userid WHERE u.userid = ?`, userID).
		Scan(&displayName).Error
	if err != nil || strings.TrimSpace(displayName) == "" {
		return fallback
	}
	return displayName
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
