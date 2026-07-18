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

	h.issueLogin(w, user)
}

func (h *AuthHandler) issueLogin(w http.ResponseWriter, user models.User) {
	if err := h.setSessionCookie(w, user); err != nil {
		jsonError(w, "Token error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":               true,
		"user_id":               user.UserID,
		"username":              user.Username,
		"is_admin":              user.IsAdmin,
		"force_password_change": user.ForcePassword,
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
	redirectURI := h.microsoftRedirectURI(r, settings)
	http.Redirect(w, r, microsoft.AuthorizationURL(settings, redirectURI, state), http.StatusFound)
}

func (h *AuthHandler) MicrosoftCallback(w http.ResponseWriter, r *http.Request) {
	if h.ms == nil {
		h.redirectLoginError(w, r, "Microsoft-Anmeldung ist nicht verfügbar")
		return
	}
	stateCookie, err := r.Cookie("cores_ms_oauth_state")
	if err != nil || stateCookie.Value == "" || stateCookie.Value != r.URL.Query().Get("state") {
		h.redirectLoginError(w, r, "Ungültiger oder abgelaufener Anmeldestatus")
		return
	}
	h.setOAuthStateCookie(w, "", -1)
	if providerError := r.URL.Query().Get("error"); providerError != "" {
		h.redirectLoginError(w, r, firstNonEmptyString(r.URL.Query().Get("error_description"), providerError))
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" {
		h.redirectLoginError(w, r, "Microsoft hat keinen Anmeldecode geliefert")
		return
	}
	settings, err := h.ms.GetSettings(r.Context())
	if err != nil || !settings.UsesMicrosoftLogin() {
		h.redirectLoginError(w, r, "Microsoft-Anmeldung ist deaktiviert")
		return
	}
	profile, err := h.ms.AuthenticateCode(r.Context(), settings, code, h.microsoftRedirectURI(r, settings))
	if err != nil {
		h.redirectLoginError(w, r, err.Error())
		return
	}
	var user models.User
	err = h.db.Where("identity_source = ? AND external_id = ? AND is_active = ?", "microsoft", profile.ID, true).First(&user).Error
	if err != nil {
		h.redirectLoginError(w, r, "Dieses Microsoft-Konto gehört nicht zur konfigurierten Cores-Gruppe oder wurde noch nicht synchronisiert")
		return
	}
	if err := h.setSessionCookie(w, user); err != nil {
		h.redirectLoginError(w, r, "Cores-Sitzung konnte nicht erstellt werden")
		return
	}
	http.Redirect(w, r, "/", http.StatusFound)
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

func (h *AuthHandler) redirectLoginError(w http.ResponseWriter, r *http.Request, message string) {
	http.Redirect(w, r, "/login?error="+url.QueryEscape(message), http.StatusFound)
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
		"user_id":  claims.UserID,
		"username": claims.Username,
		"is_admin": claims.IsAdmin,
	})
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
